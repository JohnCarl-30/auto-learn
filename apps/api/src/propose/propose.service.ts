import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { generateObject } from 'ai';
import { randomUUID } from 'node:crypto';
import {
  MAX_SENTENCES,
  ModelProposal,
  SILENT_TYPES,
  TRANSFORM_INSTRUCTIONS,
  locateSpan,
  splitSentences,
  type ApiError,
  type GatedSuggestionType,
  type ProposeRequest,
  type ProposeResponse,
  type SilentFix,
  type SilentFixType,
} from '@auto-learn/shared';
import { proposeModel, proposeProviderOptions } from '../llm/models';
import { TelemetryService } from '../telemetry/telemetry.service';
import {
  SessionStore,
  type StoredGated,
  type StoredSentence,
} from '../session/session.store';

const SYSTEM_PROMPT = `You help university students who write academic English as a second language.

You receive 1-3 numbered sentences and one transform instruction. Return targeted edits for each sentence.

Classify every edit:
- "typo", "spacing", "punctuation" — mechanical slips. Applied silently.
- "grammar" — a grammatical error: agreement, tense, article, preposition, plurality.
- "word-choice" — a word that is correct but weak, vague, or imprecise for academic writing.
- "register" — phrasing too casual or too formal for an academic essay.

Rules:
- "original" MUST be an exact, verbatim substring of that sentence. Copy it character for character.
- Prefer the shortest span that captures the change. Never rewrite a whole sentence as one edit.
- Never remove content. Every claim the writer made must survive.
- If a sentence needs nothing, return an empty edits array for it. Do not invent changes to seem useful.
- "reason" is one short line a learner can understand. No jargon.`;

@Injectable()
export class ProposeService {
  private readonly logger = new Logger(ProposeService.name);

  constructor(
    private readonly sessions: SessionStore,
    private readonly telemetry: TelemetryService,
  ) {}

  async propose(request: ProposeRequest): Promise<ProposeResponse> {
    const sentences = splitSentences(request.text);

    if (sentences.length === 0) {
      throw this.fail('empty_input', 'Give me a sentence to work with.');
    }

    // The cap is enforced here, not in the UI. Refused, never truncated —
    // a silently truncated paste looks served and isn't.
    if (sentences.length > MAX_SENTENCES) {
      this.telemetry.overflow();
      throw this.fail(
        'too_many_sentences',
        `Bring me the one to three sentences you're unsure about — I found ${sentences.length}.`,
        sentences.length,
      );
    }

    const proposal = await this.callModel(sentences, request.option);
    const stored = sentences.map((sentence, index) =>
      this.resolveSentence(
        index,
        sentence,
        proposal.sentences.find((s) => s.index === index)?.edits ?? [],
      ),
    );

    const session = this.sessions.create(request.option, stored);
    this.telemetry.proposal();

    return {
      sessionId: session.id,
      sentences: stored.map((s) => ({
        index: s.index,
        original: s.original,
        text: s.text,
        silentFixes: s.silentFixes,
        // `replacement` and `reason` are dropped here. This is the gate.
        gated: s.gated.map(({ id, type, original, start, end, teaser }) => ({
          id,
          type,
          original,
          start,
          end,
          teaser,
        })),
      })),
    };
  }

  private async callModel(
    sentences: string[],
    option: ProposeRequest['option'],
  ) {
    const numbered = sentences.map((s, i) => `${i}. ${s}`).join('\n');

    try {
      const { object } = await generateObject({
        model: proposeModel(),
        schema: ModelProposal,
        system: SYSTEM_PROMPT,
        prompt: `Transform: ${TRANSFORM_INSTRUCTIONS[option]}\n\nSentences:\n${numbered}`,
        providerOptions: proposeProviderOptions,
        maxOutputTokens: 2000,
      });
      return object;
    } catch (error) {
      this.logger.error('propose call failed', error as Error);
      throw this.fail('upstream_failed', 'Could not reach the language model.');
    }
  }

  /**
   * Turns model edits into a reviewable sentence.
   *
   * Silent fixes are applied first to produce `text`; every span the client
   * receives is an offset into that string. The model never reports offsets —
   * we locate each edit by searching for its `original`, and drop any edit we
   * cannot find rather than guessing and corrupting the sentence.
   */
  private resolveSentence(
    index: number,
    original: string,
    edits: ModelProposal['sentences'][number]['edits'],
  ): StoredSentence {
    const silentEdits = edits.filter((e) => SILENT_TYPES.has(e.type));
    const gatedEdits = edits.filter((e) => !SILENT_TYPES.has(e.type));

    let text = original;
    const appliedSilent: Array<{ edit: (typeof edits)[number] }> = [];

    for (const edit of silentEdits) {
      const span = locateSpan(text, edit.original);
      if (!span) continue;
      text =
        text.slice(0, span.start) + edit.replacement + text.slice(span.end);
      appliedSilent.push({ edit });
    }

    // Re-locate against the final text so earlier replacements can't leave
    // stale offsets behind.
    let cursor = 0;
    const silentFixes: SilentFix[] = [];
    for (const { edit } of appliedSilent) {
      const span = locateSpan(text, edit.replacement, cursor);
      if (!span) continue;
      cursor = span.end;
      silentFixes.push({
        id: randomUUID(),
        type: edit.type as SilentFixType,
        original: edit.original,
        replacement: edit.replacement,
        start: span.start,
        end: span.end,
        note: edit.reason,
      });
    }

    const gated: StoredGated[] = [];
    for (const edit of gatedEdits) {
      const span = locateSpan(text, edit.original);
      if (!span) continue;
      const type = edit.type as GatedSuggestionType;
      gated.push({
        id: randomUUID(),
        type,
        original: edit.original,
        start: span.start,
        end: span.end,
        // Built from the type, never from the model's text — the model's
        // reason would give away the word we are withholding.
        teaser: TEASERS[type],
        replacement: edit.replacement,
        reason: edit.reason,
      });
    }

    return { index, original, text, silentFixes, gated };
  }

  private fail(
    code: ApiError['code'],
    message: string,
    sentenceCount?: number,
  ): HttpException {
    const body: ApiError = { code, message, sentenceCount };
    const status =
      code === 'upstream_failed'
        ? HttpStatus.BAD_GATEWAY
        : HttpStatus.BAD_REQUEST;
    return new HttpException(body, status);
  }
}

const TEASERS: Record<GatedSuggestionType, string> = {
  grammar: 'grammar fix available',
  'word-choice': 'stronger word available',
  register: 'register could be more academic',
};
