'use client';

import { useState } from 'react';
import { LoaderCircleIcon } from 'lucide-react';
import { lessonXp, type LessonProgress, type SessionWord, type UnitId } from '@auto-learn/shared';
import { LessonFeedback } from '@/components/lesson-feedback';
import { LessonPath } from '@/components/lesson-path';
import { Notice } from '@/components/notice';
import { PronounceButton } from '@/components/pronounce-button';
import { ReviewStep } from '@/components/review-step';
import { SayItBack } from '@/components/say-it-back';
import { SpeakStep } from '@/components/speak-step';
import { Button } from '@/components/ui/button';
import { useLesson, type SpokenResult } from '@/lib/use-lesson';

/**
 * The daily lesson. A new lesson (a unit tapped on the path, "Another lesson")
 * is a new mount of the body under a fresh key, never a changed `unitId` on a
 * live `useLesson`: everything a lesson holds (its review answers, attempts,
 * the guard against a second completion) belongs to that one lesson, and a
 * remount is the one way to be sure none of it carries over.
 */
export function LessonPanel() {
  const [lesson, setLesson] = useState<{ key: number; unit?: UnitId }>({ key: 0 });
  const startLesson = (unit?: UnitId) =>
    setLesson((current) => ({ key: current.key + 1, unit }));

  return <LessonBody key={lesson.key} unitId={lesson.unit} onStart={startLesson} />;
}

function LessonBody({
  unitId,
  onStart,
}: {
  unitId?: UnitId;
  onStart: (unit?: UnitId) => void;
}) {
  const lesson = useLesson(unitId);
  const { step, unit, prompt, attempts } = lesson;

  if (step === 'loading') {
    return (
      <p role="status" className="text-muted-foreground">
        Getting your lesson ready…
      </p>
    );
  }

  if (step === 'error' || !unit || !prompt) {
    return (
      <div className="space-y-3">
        <Notice
          message={lesson.error ?? "Couldn't load your lessons. Try again in a moment."}
          tone="error"
          testId="lesson-notice"
        />
        <Button variant="outline" onClick={() => onStart(unitId)}>
          Try again
        </Button>
      </div>
    );
  }

  if (step === 'review') {
    const item = lesson.reviews[lesson.reviewIndex];
    return (
      <ReviewStep
        key={item.entryId}
        item={item}
        position={lesson.reviewIndex + 1}
        total={lesson.reviews.length}
        onCheck={lesson.answerReview}
        onNext={lesson.advanceReview}
      />
    );
  }

  if (step === 'word' && lesson.word) {
    return <WordStep word={lesson.word} onContinue={lesson.continueToSpeak} />;
  }

  if (step === 'feedback') {
    return (
      <FeedbackStep
        lesson={lesson}
        onRetry={lesson.canRetry ? lesson.retry : undefined}
      />
    );
  }

  if (step === 'done' && lesson.progress) {
    return <DoneStep progress={lesson.progress} attempts={attempts} onStart={onStart} />;
  }

  return (
    <SpeakStep
      unit={unit}
      prompt={prompt}
      retry={attempts.length === 1}
      error={lesson.error}
      onSubmit={lesson.submitAnswer}
    />
  );
}

/** Today's word, met before the answer it should turn up in. */
function WordStep({ word, onContinue }: { word: SessionWord; onContinue: () => void }) {
  return (
    <section className="space-y-4" aria-label="Today's word" data-testid="word-step">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Today&apos;s word</p>
        <div className="flex items-center gap-2">
          <h2 className="text-3xl font-semibold tracking-tight">{word.word}</h2>
          {/*
            No recording comes with a suggested word, so it is synthesised on
            the first tap. Keyed on the word: the button keeps its source for
            the life of the mount.
          */}
          <PronounceButton
            key={word.word}
            word={word.word}
            pronunciation={{ ipa: null, audioUrl: null }}
          />
        </div>
        <p className="text-lg leading-relaxed">{word.definition}</p>
      </div>
      <SayItBack word={word.word} />
      <p className="text-sm text-muted-foreground">Try to use it in your answer.</p>
      <Button size="lg" className="h-11" onClick={onContinue}>
        Continue
      </Button>
    </section>
  );
}

/** The feedback on the latest attempt, with the way to try again or finish. */
function FeedbackStep({
  lesson,
  onRetry,
}: {
  lesson: ReturnType<typeof useLesson>;
  onRetry?: () => void;
}) {
  const [finishing, setFinishing] = useState(false);
  const { unit, attempts } = lesson;
  const latest = attempts.at(-1);
  if (!unit || !latest) return null;

  const finish = async () => {
    setFinishing(true);
    try {
      await lesson.finish();
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Keyed on the attempt, so a retry's review opens with its own gates. */}
      <LessonFeedback
        key={attempts.length}
        unit={unit}
        attempt={latest}
        retryTarget={attempts.length === 2}
        onRetry={onRetry}
      />
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {lesson.bankedWord && "Today's word is in your bank."}
      </p>
      {lesson.error && <Notice message={lesson.error} tone="error" testId="finish-notice" />}
      <Button size="lg" className="h-11" onClick={() => void finish()} disabled={finishing}>
        {finishing && <LoaderCircleIcon className="animate-spin" />}
        Finish
      </Button>
    </div>
  );
}

/**
 * What the lesson earned, worked out from the same two flags the server is
 * sent, so the number shown is the number saved.
 */
function DoneStep({
  progress,
  attempts,
  onStart,
}: {
  progress: LessonProgress;
  attempts: SpokenResult[];
  onStart: (unit?: UnitId) => void;
}) {
  const xp = lessonXp({
    wordCorrect: attempts.some((attempt) => attempt.feedback.wordUse === 'correct'),
    retried: attempts.length === 2,
  });

  return (
    <section className="space-y-6" aria-label="Lesson done" data-testid="done-step">
      <div className="flex items-baseline gap-4" role="status">
        <p className="text-3xl font-semibold tracking-tight">+{xp} XP</p>
        <p className="text-muted-foreground">{progress.streak}-day streak</p>
      </div>
      <LessonPath progress={progress} onPick={onStart} />
      {/* No unit: the next lesson on the path, as the page opens with. */}
      <Button size="lg" className="h-11" onClick={() => onStart()}>
        Another lesson
      </Button>
    </section>
  );
}
