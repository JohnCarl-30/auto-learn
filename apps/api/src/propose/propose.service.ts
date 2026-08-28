import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { generateObject } from 'ai';
import { randomUUID } from 'node:crypto';
import {
  MAX_SENTENCES,
  ModelProposal,
  SILENT_TYPES,
  locateSpan,
  splitSentences,
  type ApiError,
  type GatedSuggestionType,
  type ProposeRequest,
  type ProposeResponse,
  type SilentFix,
  type SilentFixType,
} from '@auto-learn/shared';
import {
  PROPOSE_MAX_OUTPUT_TOKENS,
  proposeModel,
  proposeProviderOptions,
} from '../llm/models';
import { PROPOSE_SYSTEM_PROMPT, proposeUserPrompt } from '../llm/prompts';
import { TelemetryService } from '../telemetry/telemetry.service';
import {
  SessionStore,
  type StoredGated,
  type StoredSentence,
} from '../session/session.store';

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
    try {
      const { object } = await generateObject({
        model: proposeModel(),
        schema: ModelProposal,
        system: PROPOSE_SYSTEM_PROMPT,
        prompt: proposeUserPrompt(sentences, option),
        providerOptions: proposeProviderOptions,
        maxOutputTokens: PROPOSE_MAX_OUTPUT_TOKENS,
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

    // Counted by difference rather than at each `continue`: what matters is
    // how much of the model's proposal never reached the reader, and that is
    // the same number however it went missing — an unlocatable span, or a
    // silent fix applied to the text that could not then be reported.
    this.telemetry.editsDropped(
      edits.length - silentFixes.length - gated.length,
    );

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
