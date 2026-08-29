import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { generateObject, streamObject, type DeepPartial } from 'ai';
import { randomUUID } from 'node:crypto';
import {
  GatedSuggestionType,
  MAX_SENTENCES,
  ModelProposal,
  SILENT_TYPES,
  SilentFixType,
  TEASERS,
  locateSpan,
  splitSentences,
  type ApiError,
  type ProposeRequest,
  type ProposeResponse,
  type ProposeStreamEvent,
  type SilentFix,
} from '@auto-learn/shared';
import {
  MODEL_MAX_RETRIES,
  PROPOSE_MAX_OUTPUT_TOKENS,
  PROPOSE_MODEL,
  PROPOSE_TIMEOUT_MS,
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

/**
 * The half-written shapes `partialObjectStream` hands back. Every field is
 * optional and every string may be a fragment — including the enums, which is
 * why `preview` parses them rather than casting.
 */
type PartialProposal = DeepPartial<ModelProposal>;
type PartialEdit = NonNullable<
  NonNullable<NonNullable<PartialProposal['sentences']>[number]>['edits']
>[number];

@Injectable()
export class ProposeService {
  private readonly logger = new Logger(ProposeService.name);

  constructor(
    private readonly sessions: SessionStore,
    private readonly telemetry: TelemetryService,
  ) {}

  async propose(request: ProposeRequest): Promise<ProposeResponse> {
    const sentences = this.prepare(request);
    const proposal = await this.callModel(sentences, request.option);
    return await this.finish(sentences, proposal, request.option);
  }

  /**
   * Everything that can refuse a request, done before any work starts.
   *
   * Separate from `propose` because the streaming route has to run these while
   * it can still send a status line. Once the first byte of an NDJSON body is
   * out, a 400 is no longer available and the refusal would have to be
   * smuggled into the stream — where a client that stopped reading never sees
   * it.
   */
  prepare(request: ProposeRequest): string[] {
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

    return sentences;
  }

  /**
   * Streams the proposal as the model writes it.
   *
   * What crosses the wire early is a *preview*: no offsets, and nothing
   * withheld is included. Offsets cannot be settled until every silent fix has
   * been applied, and the gate's whole design is that the client never holds a
   * tier-2 replacement — so the events carry neither, and `done` carries the
   * same payload `propose` returns. A bug here can make the wait less
   * informative. It cannot change what the reader ends up reviewing.
   */
  async *stream(
    request: ProposeRequest,
    sentences: string[],
    /** Aborted when the reader goes away, so an abandoned tab stops billing. */
    abandoned?: AbortSignal,
  ): AsyncGenerator<ProposeStreamEvent> {
    const emitted = new Map<number, number>();

    try {
      const result = streamObject({
        model: proposeModel(),
        schema: ModelProposal,
        system: PROPOSE_SYSTEM_PROMPT,
        prompt: proposeUserPrompt(sentences, request.option),
        providerOptions: proposeProviderOptions,
        maxOutputTokens: PROPOSE_MAX_OUTPUT_TOKENS,
        maxRetries: MODEL_MAX_RETRIES,
        abortSignal: abandoned
          ? AbortSignal.any([
              abandoned,
              AbortSignal.timeout(PROPOSE_TIMEOUT_MS),
            ])
          : AbortSignal.timeout(PROPOSE_TIMEOUT_MS),
      });

      for await (const partial of result.partialObjectStream) {
        yield* this.preview(partial, emitted);
      }

      const proposal = await result.object;
      this.telemetry.spend(PROPOSE_MODEL, await result.usage);
      yield {
        kind: 'done',
        response: await this.finish(sentences, proposal, request.option),
      };
    } catch (error) {
      // A reader who left is not a failure, and there is nobody to tell.
      if (abandoned?.aborted) return;

      // The status line is long gone, so the failure travels in the body.
      this.logger.error('propose stream failed', error as Error);
      yield {
        kind: 'error',
        error: {
          code: 'upstream_failed',
          message: 'Could not reach the language model.',
        },
      };
    }
  }

  /**
   * Turns a half-written object into events that are safe to send.
   *
   * A streamed value can be a fragment: `type` may read "word-cho" and
   * `original` may be the first half of the writer's phrase. The rule
   * throughout is that a field is only trustworthy once the *next* one has
   * begun — JSON is written in order, so `replacement` existing at all is the
   * proof that `original` is closed. Every type is parsed rather than trusted,
   * because a fragment that is not yet a known type must not be classified,
   * and classification is what decides whether a replacement may be sent.
   */
  private *preview(
    partial: PartialProposal,
    emitted: Map<number, number>,
  ): Generator<ProposeStreamEvent> {
    for (const sentence of partial.sentences ?? []) {
      if (!sentence || typeof sentence.index !== 'number') continue;

      const edits = sentence.edits ?? [];
      let next = emitted.get(sentence.index) ?? 0;

      for (; next < edits.length; next++) {
        const event = this.toEvent(sentence.index, edits[next]);
        // Order matters more than throughput: an edit that is not yet safe to
        // send stops the sentence rather than being skipped over.
        if (!event) break;
        emitted.set(sentence.index, next + 1);
        yield event;
      }
    }
  }

  private toEvent(
    sentence: number,
    edit: PartialEdit,
  ): ProposeStreamEvent | null {
    if (!edit || typeof edit.original !== 'string') return null;

    const silent = SilentFixType.safeParse(edit.type);
    if (silent.success) {
      // `reason` having begun is what proves `replacement` is finished.
      if (typeof edit.replacement !== 'string' || edit.reason === undefined) {
        return null;
      }
      return {
        kind: 'fix',
        sentence,
        type: silent.data,
        original: edit.original,
        replacement: edit.replacement,
      };
    }

    const gated = GatedSuggestionType.safeParse(edit.type);
    if (!gated.success) return null;
    // Nothing withheld is read here, so `replacement` merely having started is
    // enough — its value is never sent.
    if (edit.replacement === undefined) return null;

    return {
      kind: 'gate',
      sentence,
      type: gated.data,
      original: edit.original,
      teaser: TEASERS[gated.data],
    };
  }

  /** Resolves offsets, opens the session, and drops what the gate withholds. */
  private async finish(
    sentences: string[],
    proposal: ModelProposal,
    option: ProposeRequest['option'],
  ): Promise<ProposeResponse> {
    const stored = sentences.map((sentence, index) =>
      this.resolveSentence(
        index,
        sentence,
        proposal.sentences.find((s) => s.index === index)?.edits ?? [],
      ),
    );

    const session = await this.sessions.create(option, stored);
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
      const { object, usage } = await generateObject({
        model: proposeModel(),
        schema: ModelProposal,
        system: PROPOSE_SYSTEM_PROMPT,
        prompt: proposeUserPrompt(sentences, option),
        providerOptions: proposeProviderOptions,
        maxOutputTokens: PROPOSE_MAX_OUTPUT_TOKENS,
        maxRetries: MODEL_MAX_RETRIES,
        abortSignal: AbortSignal.timeout(PROPOSE_TIMEOUT_MS),
      });
      this.telemetry.spend(PROPOSE_MODEL, usage);
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
