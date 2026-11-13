import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { generateObject } from 'ai';
import {
  ModelLessonVerdict,
  UNITS,
  findUsedForm,
  splitSentences,
  type ApiError,
  type LessonFeedbackRequest,
  type LessonFeedbackResponse,
  type FillerNote,
  type LessonPart,
  type LessonUnit,
  type LessonWordRequest,
  type ProposeResponse,
  type SessionWordResponse,
} from '@auto-learn/shared';
import {
  CONVERSE_MODEL,
  CONVERSE_TIMEOUT_MS,
  LESSON_FEEDBACK_MAX_OUTPUT_TOKENS,
  MODEL_MAX_RETRIES_VOICE,
  converseModel,
  lessonFeedbackProviderOptions,
} from '../llm/models';
import {
  LESSON_FEEDBACK_SYSTEM_PROMPT,
  LESSON_WORD_SYSTEM_PROMPT,
  lessonFeedbackUserPrompt,
  lessonWordUserPrompt,
} from '../llm/prompts';
import {
  ConverseService,
  SPOKEN_TRANSFORM,
} from '../converse/converse.service';
import { DictionaryService } from '../dictionary/dictionary.service';
import { ProposeService } from '../propose/propose.service';
import { TelemetryService } from '../telemetry/telemetry.service';

/**
 * A quote reduced to its words, so it is matched by what was said rather than
 * how it was typed. Curly apostrophes become straight ones and every other mark
 * but the apostrophe goes, because a model quoting "I’m building bots" from "I'm
 * building bots." has quoted the learner exactly, and calling it not heard
 * would tell them they left out a part they said. The apostrophe stays because
 * it is part of the word ("its" and "it's" are different words).
 */
const squash = (text: string) =>
  text
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[^\p{L}\p{N}\s']/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

@Injectable()
export class LessonService {
  private readonly logger = new Logger(LessonService.name);

  constructor(
    private readonly propose: ProposeService,
    private readonly converse: ConverseService,
    private readonly telemetry: TelemetryService,
    private readonly dictionary: DictionaryService,
  ) {}

  /**
   * Today's new word for a unit, or null.
   *
   * The conversation's picker with a different question: same one-word parse,
   * same bank filter, same WordNet check, and the same refusal to ever be an
   * error. The unit is already range-checked by the request schema.
   *
   * Then the word's pronunciation, which the conversation does without: the
   * lesson's word step has a button to hear it, and a dictionary recording
   * plays without the paid voice. `pronunciation()` never throws, and a word
   * with no recording is the button's ordinary case, so this cannot cost the
   * learner the word.
   */
  async suggestWord(request: LessonWordRequest): Promise<SessionWordResponse> {
    const unit = UNITS[request.unit - 1];
    const found = await this.converse.suggestCheckedWord(
      LESSON_WORD_SYSTEM_PROMPT,
      lessonWordUserPrompt({ unit, known: request.known }),
      request.known,
    );
    if (!found.word) return found;

    const pronunciation = await this.dictionary.pronunciation(found.word.word);
    return { word: { ...found.word, pronunciation } };
  }

  /**
   * Feedback on one spoken answer: a verdict on its structure and the word,
   * and the weakest sentence run through the same gated review as everything
   * else.
   *
   * The two fail differently on purpose. No verdict is a failed request — the
   * learner has just finished speaking and there is nothing to show. No
   * rewrite is a verdict without one, because it is the smaller half and the
   * review is allowed to be unavailable (propose refuses what it cannot take).
   */
  async feedback(
    request: LessonFeedbackRequest,
  ): Promise<LessonFeedbackResponse> {
    const unit = UNITS[request.unit - 1];
    const prompt = unit.prompts.find((p) => p.id === request.promptId);
    if (!prompt) {
      // A prompt id the unit does not have means a stale or hand-built request.
      // Refused before the model call, so it costs nothing.
      const body: ApiError = {
        code: 'invalid_prompt',
        message: 'That question is not part of this lesson.',
      };
      throw new HttpException(body, HttpStatus.BAD_REQUEST);
    }

    const sentences = splitSentences(request.answer);
    const verdict = await this.judge(unit, prompt.text, sentences, request);

    const reviewedText = this.rewriteTarget(sentences, verdict, request.word);
    const review = reviewedText
      ? await this.review(reviewedText, request.known)
      : null;

    return {
      firstSentence: sentences[0],
      pointFirst: verdict.pointFirst,
      pointFirstNote: verdict.pointFirstNote,
      parts: this.onlyHeard(verdict.parts, request.answer),
      structureNote: verdict.structureNote,
      // The model is told to say "unused" when there is no word; this makes
      // sure, since the page shows a word line for anything that is not null.
      wordUse: request.word === null ? null : verdict.wordUse,
      // Both or neither: the client splits `reviewedText` to find which
      // sentence a gate belongs to, so one without the other is useless.
      reviewedText: review ? reviewedText : null,
      review,
      fillerNotes: this.onlyRemovals(verdict.fillerNotes, request.answer),
    };
  }

  private async judge(
    unit: LessonUnit,
    prompt: string,
    sentences: string[],
    request: LessonFeedbackRequest,
  ): Promise<ModelLessonVerdict> {
    try {
      const { object, usage } = await generateObject({
        model: converseModel(),
        schema: ModelLessonVerdict,
        system: LESSON_FEEDBACK_SYSTEM_PROMPT,
        prompt: lessonFeedbackUserPrompt({
          unit,
          prompt,
          sentences,
          word: request.word,
        }),
        providerOptions: lessonFeedbackProviderOptions,
        maxOutputTokens: LESSON_FEEDBACK_MAX_OUTPUT_TOKENS,
        // The learner has just stopped speaking and is waiting: one retry, and
        // the same deadline as a conversation turn.
        maxRetries: MODEL_MAX_RETRIES_VOICE,
        abortSignal: AbortSignal.timeout(CONVERSE_TIMEOUT_MS),
      });
      this.telemetry.spend(CONVERSE_MODEL, usage);
      return object;
    } catch (error) {
      this.logger.error('lesson feedback failed', error as Error);
      const body: ApiError = {
        code: 'upstream_failed',
        message: "Couldn't review that answer. Try again in a moment.",
      };
      throw new HttpException(body, HttpStatus.BAD_GATEWAY);
    }
  }

  /**
   * The text to send for a rewrite, or null when there is nothing to send.
   *
   * The sentence the model called weakest, plus the first one that used the
   * day's word, so the word's own sentence gets a better-wording pass too. At
   * most two, which is what keeps this under propose's three-sentence cap
   * however long the answer ran. In answer order, because the client shows
   * them as a passage.
   *
   * The index is the model's, and nothing in its schema bounds it, so a
   * number past the end is ignored rather than trusted: the verdict is still
   * worth sending without a rewrite.
   */
  private rewriteTarget(
    sentences: string[],
    verdict: ModelLessonVerdict,
    word: string | null,
  ): string | null {
    const chosen = new Set<number>();

    if (
      verdict.weakestSentence >= 0 &&
      verdict.weakestSentence < sentences.length
    ) {
      chosen.add(verdict.weakestSentence);
    }

    if (word) {
      const used = sentences.findIndex((s) => findUsedForm(s, word) !== null);
      if (used >= 0) chosen.add(used);
    }

    if (chosen.size === 0) return null;
    return [...chosen]
      .sort((a, b) => a - b)
      .map((i) => sentences[i])
      .join(' ');
  }

  /** The rewrite, or null — never a reason to lose the verdict beside it. */
  private async review(
    text: string,
    known: string[] | undefined,
  ): Promise<ProposeResponse | null> {
    try {
      return await this.propose.propose({
        text,
        option: SPOKEN_TRANSFORM,
        known: known ?? [],
      });
    } catch (error) {
      // The propose service has already logged its own failures.
      if (!(error instanceof HttpException)) {
        this.logger.error('lesson review failed', error as Error);
      }
      return null;
    }
  }

  /**
   * Filler notes are kept only if they quote the learner and take words away.
   *
   * A note is the one place the verdict is allowed to restate a sentence, and
   * only to drop a filler from it. So `without` must be made of words from the
   * quote and be shorter than it: anything else is the model handing out the
   * better wording the gate exists to withhold. Three at most, as asked.
   */
  private onlyRemovals(notes: FillerNote[], answer: string): FillerNote[] {
    const said = squash(answer);
    const words = (text: string) => squash(text).split(' ').filter(Boolean);

    return notes
      .filter(({ quote, without }) => {
        const from = words(quote);
        const to = words(without);
        return (
          to.length > 0 &&
          to.length < from.length &&
          said.includes(squash(quote)) &&
          to.every((word) => from.includes(word))
        );
      })
      .slice(0, 3);
  }

  /**
   * Parts keep their quote only if the learner said it.
   *
   * The page words each quote as what was heard, and a model can quote words
   * that were never spoken. A part whose quote cannot be found is shown as not
   * heard, which is the honest reading of it.
   */
  private onlyHeard(parts: LessonPart[], answer: string): LessonPart[] {
    const said = squash(answer);
    return parts.map(({ label, quote }) => ({
      label,
      quote:
        quote && squash(quote) && said.includes(squash(quote)) ? quote : null,
    }));
  }
}
