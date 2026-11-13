'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  countFillers,
  findUsedForm,
  isRecallCorrect,
  pickPrompt,
  splitSentences,
  type BankEntry,
  type LessonFeedbackResponse,
  type LessonProgress,
  type LessonUnit,
  type SessionWord,
  type UnitId,
} from '@auto-learn/shared';
import { ApiFailure, fetchCard, lessonFeedback, lessonWord } from '@/lib/api';
import { bankWord, knownWords, listBank } from '@/lib/bank';
import { loadHabits, recordAnswer, type Habits } from '@/lib/habits';
import {
  LessonRequestFailed,
  answerReview as recordReview,
  completeLesson,
  fetchProgress,
} from '@/lib/lesson-client';
import { chooseUnit, reviewItems, type ReviewItem } from '@/lib/lesson-plan';
import { syncBank } from '@/lib/sync';

export type { ReviewItem };

export type LessonStep =
  | 'loading'
  | 'review'
  | 'word'
  | 'speak'
  | 'feedback'
  | 'done'
  | 'error';

export interface SpokenResult {
  answer: string;
  seconds: number | null;
  fillers: ReturnType<typeof countFillers>;
  feedback: LessonFeedbackResponse;
}

/** Everything fixed when the lesson opens. Only `progress` changes after it. */
interface Setup {
  start: LessonProgress;
  unit: LessonUnit;
  prompt: { id: string; text: string };
  reviews: ReviewItem[];
  word: SessionWord | null;
}

/** As on /propose: an unreadable bank costs a preference, not the lesson. */
const known = () => knownWords().catch(() => [] as string[]);

/**
 * One lesson, start to finish: review the due words, meet today's word, answer
 * the prompt out loud (once more if wanted), then record it.
 *
 * The steps run review → word → speak → feedback → done, and a step with
 * nothing in it (no words due, no word suggested) is skipped rather than shown
 * empty. Nothing here punishes: a wrong recall is recorded and the lesson goes
 * on, and a failed request leaves the learner where they were to try again.
 */
export function useLesson(unitId?: UnitId) {
  const [step, setStep] = useState<LessonStep>('loading');
  const [setup, setSetup] = useState<Setup | null>(null);
  const [progress, setProgress] = useState<LessonProgress | null>(null);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [attempts, setAttempts] = useState<SpokenResult[]>([]);
  const [bankedWord, setBankedWord] = useState(false);
  const [habits, setHabits] = useState<Habits | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A double tap must not send a second feedback request (it costs a model
  // call) or, worse, a second completion (it is another lesson's XP).
  const busy = useRef(false);

  useEffect(() => {
    let live = true;

    (async () => {
      // Pulled first so words banked on another device can be reviewed here.
      // A failed sync is harmless (the local bank is untouched), as elsewhere.
      await syncBank().catch(() => undefined);

      let start: LessonProgress;
      try {
        start = await fetchProgress();
      } catch (failure) {
        if (!live) return;
        setError(
          failure instanceof LessonRequestFailed && failure.status === 401
            ? 'Sign in to start a lesson. Your streak and reviews are saved to your account.'
            : "Couldn't load your lessons. Try again in a moment.",
        );
        setStep('error');
        return;
      }

      const unit = chooseUnit(start, unitId);
      const [entries, word] = await Promise.all([
        listBank().catch(() => [] as BankEntry[]),
        // The word is a bonus: a failure here only skips the word step.
        known()
          .then((words) => lessonWord({ unit: unit.id, known: words }))
          .then((response) => response.word)
          .catch(() => null),
      ]);
      if (!live) return;

      const reviews = reviewItems(entries, start.dueEntryIds);
      setSetup({
        start,
        unit,
        prompt: pickPrompt(unit, start.recentPromptIds),
        reviews,
        word,
      });
      setProgress(start);
      setHabits(loadHabits());
      setStep(reviews.length > 0 ? 'review' : word ? 'word' : 'speak');
    })();

    return () => {
      live = false;
    };
  }, [unitId]);

  /**
   * Checked here, so the result shows at once; the server only hears about it
   * to move the word on its ladder. If that call fails the word may simply come
   * back sooner, which is not worth holding up the lesson for.
   */
  const answerReview = useCallback(
    async (answer: string) => {
      const item = setup?.reviews[reviewIndex];
      if (!item) return false;
      const right = isRecallCorrect(answer, item.lemma);
      recordReview({ entryId: item.entryId, right }).catch((failure) =>
        console.error('review not recorded', failure),
      );
      return right;
    },
    [setup, reviewIndex],
  );

  const advanceReview = useCallback(() => {
    if (!setup) return;
    if (reviewIndex + 1 < setup.reviews.length) {
      setReviewIndex(reviewIndex + 1);
    } else {
      setStep(setup.word ? 'word' : 'speak');
    }
  }, [setup, reviewIndex]);

  const continueToSpeak = useCallback(() => setStep('speak'), []);

  /**
   * Banks today's word once it was used correctly, the way accepting does on
   * /talk: find the sentence it was used in, open its card, bank that card.
   * Silent on failure; the feedback already says the word was used.
   */
  const bankTodaysWord = useCallback(
    async (word: SessionWord, feedback: LessonFeedbackResponse) => {
      const { review, reviewedText } = feedback;
      if (!review || !reviewedText) return;
      try {
        // The same split the server reviewed, so the index names its sentence.
        const sentences = splitSentences(reviewedText);
        const forms = sentences.map((sentence) => findUsedForm(sentence, word.word));
        const sentenceIndex = forms.findIndex((form) => form !== null);
        const form = forms[sentenceIndex];
        if (!form) return;

        const response = await fetchCard({
          kind: 'lookup',
          sessionId: review.sessionId,
          sentenceIndex,
          word: form,
        });
        if (response.kind !== 'card') return;
        // Only the sentence the word was used in: it becomes the masked review
        // cue in later lessons, and a whole two-minute answer is no cue.
        await bankWord(response.card, sentences[sentenceIndex], 'accepted');
        setBankedWord(true);
      } catch {
        // Silent: the word stays one to practise.
      }
    },
    [],
  );

  const submitAnswer = useCallback(
    async (answer: string, seconds: number | null) => {
      if (!setup || busy.current) return;
      busy.current = true;
      try {
        const feedback = await lessonFeedback({
          unit: setup.unit.id,
          promptId: setup.prompt.id,
          answer,
          word: setup.word?.word ?? null,
          known: await known(),
        });
        const attempt = { answer, seconds, fillers: countFillers(answer), feedback };
        setAttempts((current) => [...current, attempt]);
        setHabits(recordAnswer(attempt));
        setError(null);
        setStep('feedback');
        if (setup.word && feedback.wordUse === 'correct') {
          void bankTodaysWord(setup.word, feedback);
        }
      } catch (failure) {
        // Stay on speak, answer and all, so trying again is one tap.
        setError(
          failure instanceof ApiFailure
            ? failure.detail.message
            : 'Something went wrong. Try again.',
        );
      } finally {
        busy.current = false;
      }
    },
    [setup, bankTodaysWord],
  );

  const retry = useCallback(() => {
    if (attempts.length === 1) setStep('speak');
  }, [attempts.length]);

  /**
   * Records the lesson. Never retried on its own, because a completion is not
   * idempotent: a request that failed may still have been saved (the route
   * cannot tell the client which). So on failure, progress is read back, and if
   * XP or today's count went up since the lesson opened, it was counted.
   * Only a rise counts: today's count drops to 0 at Manila midnight, and that
   * reset must not be read as a lesson saved.
   */
  const finish = useCallback(async () => {
    if (!setup || busy.current || step === 'done') return;
    busy.current = true;
    const flags = {
      unit: setup.unit.id,
      promptId: setup.prompt.id,
      wordCorrect: attempts.some((a) => a.feedback.wordUse === 'correct'),
      retried: attempts.length === 2,
    };
    try {
      try {
        setProgress(await completeLesson(flags));
        setError(null);
        setStep('done');
        return;
      } catch (failure) {
        console.error('lesson complete failed', failure);
      }

      const { start } = setup;
      const now = await fetchProgress().catch(() => null);
      if (now && (now.xp > start.xp || now.doneToday > start.doneToday)) {
        setProgress(now);
        setError(null);
        setStep('done');
        return;
      }
      setError("Couldn't save this lesson. Check your connection and try again.");
    } finally {
      busy.current = false;
    }
  }, [setup, step, attempts]);

  return {
    step,
    progress,
    unit: setup?.unit ?? null,
    prompt: setup?.prompt ?? null,
    reviews: setup?.reviews ?? [],
    reviewIndex,
    answerReview,
    advanceReview,
    word: setup?.word ?? null,
    continueToSpeak,
    submitAnswer,
    attempts,
    canRetry: step === 'feedback' && attempts.length === 1,
    retry,
    finish,
    bankedWord,
    habits,
    error,
  };
}
