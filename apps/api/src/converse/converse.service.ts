import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import {
  MAX_SENTENCES,
  recentTurns,
  splitSentences,
  type ApiError,
  type ConverseRequest,
  type ConverseResponse,
  type ConverseTurn,
  type Scenario,
  type SessionWordRequest,
  type SessionWordResponse,
  type TransformOption,
} from '@auto-learn/shared';
import {
  CONVERSE_MAX_OUTPUT_TOKENS,
  CONVERSE_MODEL,
  CONVERSE_TIMEOUT_MS,
  MODEL_MAX_RETRIES_VOICE,
  converseModel,
  converseProviderOptions,
  sessionWordProviderOptions,
} from '../llm/models';
import { DictionaryService } from '../dictionary/dictionary.service';
import {
  CONVERSE_SYSTEM_PROMPT,
  SESSION_WORD_SYSTEM_PROMPT,
  converseUserPrompt,
  sessionWordUserPrompt,
} from '../llm/prompts';
import { ProposeService } from '../propose/propose.service';
import { TelemetryService } from '../telemetry/telemetry.service';

/**
 * Which transform a spoken turn is reviewed with.
 *
 * "natural" rather than "grammar": a learner talking wants to sound like a
 * fluent speaker, and grammar alone would leave every weak word unflagged —
 * which is most of what there is to teach in speech. Not "academic" either:
 * nobody wants office-hours small talk raised to essay register.
 */
const SPOKEN_TRANSFORM: TransformOption = 'natural';

@Injectable()
export class ConverseService {
  private readonly logger = new Logger(ConverseService.name);

  constructor(
    private readonly propose: ProposeService,
    private readonly telemetry: TelemetryService,
    private readonly dictionary: DictionaryService,
  ) {}

  /**
   * One turn: the partner's answer, and the learner's words reviewed.
   *
   * The two run side by side because neither needs the other — the partner is
   * told not to correct anything, so it does not need to know what the review
   * found — and a reply that waited for a review would put the review's
   * latency in front of every answer. They fail differently on purpose: no
   * reply is a failed turn, no review is a turn without feedback.
   */
  async converse(request: ConverseRequest): Promise<ConverseResponse> {
    const [reply, feedback] = await Promise.all([
      this.reply(
        request.scenario,
        recentTurns(request.history),
        request.utterance,
      ),
      this.review(request),
    ]);

    this.telemetry.turn(feedback.review !== null);
    return { reply, ...feedback };
  }

  private async reply(
    scenario: Scenario,
    history: ConverseTurn[],
    utterance: string,
  ): Promise<string> {
    try {
      const { text, usage } = await generateText({
        model: converseModel(),
        system: CONVERSE_SYSTEM_PROMPT,
        prompt: converseUserPrompt({ scenario, history, utterance }),
        providerOptions: converseProviderOptions,
        maxOutputTokens: CONVERSE_MAX_OUTPUT_TOKENS,
        // Someone has stopped talking and is waiting to hear back. One retry,
        // like the voice routes, because silence that never ends is worse than
        // an error that does.
        maxRetries: MODEL_MAX_RETRIES_VOICE,
        abortSignal: AbortSignal.timeout(CONVERSE_TIMEOUT_MS),
      });
      this.telemetry.spend(CONVERSE_MODEL, usage);

      const reply = text.trim();
      if (!reply) throw new Error('empty reply');
      return reply;
    } catch (error) {
      this.logger.error('converse reply failed', error as Error);
      const body: ApiError = {
        code: 'upstream_failed',
        message: "Your partner didn't answer. Try saying that again.",
      };
      throw new HttpException(body, HttpStatus.BAD_GATEWAY);
    }
  }

  /**
   * The learner's turn, reviewed by /propose's own service.
   *
   * Over the sentence cap is checked here rather than left for `propose` to
   * refuse, because that refusal also counts an overflow — the signal that
   * decides whether essays are worth supporting, which a long spoken turn says
   * nothing about.
   */
  private async review(
    request: ConverseRequest,
  ): Promise<Pick<ConverseResponse, 'review' | 'skipped'>> {
    if (splitSentences(request.utterance).length > MAX_SENTENCES) {
      return { review: null, skipped: 'too_many_sentences' };
    }

    try {
      const review = await this.propose.propose({
        text: request.utterance,
        option: SPOKEN_TRANSFORM,
        known: request.known,
      });
      return { review, skipped: null };
    } catch (error) {
      // Already logged by the propose service. The reply goes out regardless.
      if (!(error instanceof HttpException)) {
        this.logger.error('converse review failed', error as Error);
      }
      return { review: null, skipped: 'unavailable' };
    }
  }

  /**
   * A word to practise in this conversation, or null.
   *
   * Never an error: a missing word must not stand between the learner and
   * talking, so every failure — the model, an empty answer, a word WordNet has
   * never heard of — comes back as `{ word: null }` and the panel shows nothing.
   */
  async suggestWord(request: SessionWordRequest): Promise<SessionWordResponse> {
    try {
      const { text, usage } = await generateText({
        model: converseModel(),
        system: SESSION_WORD_SYSTEM_PROMPT,
        prompt: sessionWordUserPrompt(request),
        providerOptions: sessionWordProviderOptions,
        // One word. The cap keeps a chatty answer from costing a paragraph.
        maxOutputTokens: 16,
        maxRetries: MODEL_MAX_RETRIES_VOICE,
        abortSignal: AbortSignal.timeout(CONVERSE_TIMEOUT_MS),
      });
      this.telemetry.spend(CONVERSE_MODEL, usage);

      // The model is asked for one bare word; take the first and strip the
      // full stop it adds anyway.
      const word = (text.trim().split(/\s+/)[0] ?? '')
        .replace(/[^\p{L}'-]/gu, '')
        .toLowerCase();
      if (!word) return { word: null };

      // The prompt asks for a word the learner does not have; this makes sure.
      // A banked word offered as new would be counted, carded and "added" again.
      const known = new Set(request.known.map((k) => k.toLowerCase()));
      if (known.has(word)) return { word: null };

      const found = await this.dictionary.lookup(word);
      if (found.status !== 'found') return { word: null };

      const definition = found.entry.senses[0]?.definition;
      return definition ? { word: { word, definition } } : { word: null };
    } catch (error) {
      this.logger.warn('session word failed', error as Error);
      return { word: null };
    }
  }
}
