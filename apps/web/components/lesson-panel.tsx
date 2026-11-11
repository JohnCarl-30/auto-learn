'use client';

import { useState } from 'react';
import { ArrowRightIcon, CheckIcon, LoaderCircleIcon, Volume2Icon } from 'lucide-react';
import { lessonXp, type LessonProgress, type SessionWord, type UnitId } from '@auto-learn/shared';
import { LessonFeedback } from '@/components/lesson-feedback';
import { LessonRail } from '@/components/lesson-path';
import { Notice } from '@/components/notice';
import { PageHeader } from '@/components/page-header';
import { PronounceButton } from '@/components/pronounce-button';
import { ReviewStep } from '@/components/review-step';
import { SayItBack } from '@/components/say-it-back';
import { SpeakStep } from '@/components/speak-step';
import { Button } from '@/components/ui/button';
import { useLesson, type LessonStep, type SpokenResult } from '@/lib/use-lesson';
import { usePartnerVoice } from '@/lib/use-partner-voice';
import { cn } from '@/lib/utils';

const LABEL = 'font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground';
/** The one filled button a step ends on. */
const PRIMARY =
  'h-11 rounded-md bg-cobalt px-5.5 text-[15px] font-semibold text-white hover:bg-cobalt/90';

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
  const { step, unit, progress } = lesson;

  return (
    <>
      <PageHeader
        eyebrow={unit ? `Learn · Unit ${unit.id} · ${unit.title}` : 'Learn'}
        title="Five minutes a day: your words, a new one, and an answer out loud."
      />
      {/* Desktop: the lesson on the left, the streak and the path beside it. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_392px] lg:items-start lg:gap-16">
        <div>
          {step !== 'loading' && step !== 'error' && <StepProgress step={step} />}
          <LessonStepView lesson={lesson} unitId={unitId} onStart={onStart} />
        </div>
        {progress && (
          <aside className="mt-12 lg:mt-0">
            <LessonRail progress={progress} current={unit?.id} onPick={onStart} />
          </aside>
        )}
      </div>
    </>
  );
}

/** The four parts of a lesson, in the order they come. */
const STEPS: { step: LessonStep; label: string }[] = [
  { step: 'review', label: 'Your words' },
  { step: 'word', label: "Today's word" },
  { step: 'speak', label: 'Answer out loud' },
  { step: 'feedback', label: 'Feedback' },
];

/** Where the lesson is: ink for what is behind, cobalt for now, grey ahead. */
function StepProgress({ step }: { step: LessonStep }) {
  // `done` is past all four, so none is current and every bar is ink.
  const at = step === 'done' ? STEPS.length : STEPS.findIndex((entry) => entry.step === step);

  return (
    <ol className="flex gap-1.5 pb-3" aria-label="Lesson steps">
      {STEPS.map(({ step: name, label }, index) => (
        <li
          key={name}
          aria-current={index === at ? 'step' : undefined}
          className={cn(
            'flex-1 space-y-2 text-xs',
            index === at ? 'font-semibold text-cobalt' : 'text-muted-foreground',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'block h-[3px] rounded-full',
              index === at ? 'bg-cobalt' : index < at ? 'bg-foreground' : 'bg-border',
            )}
          />
          {label}
        </li>
      ))}
    </ol>
  );
}

function LessonStepView({
  lesson,
  unitId,
  onStart,
}: {
  lesson: ReturnType<typeof useLesson>;
  unitId?: UnitId;
  onStart: (unit?: UnitId) => void;
}) {
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
      <div className="pt-10">
        <ReviewStep
          key={item.entryId}
          item={item}
          position={lesson.reviewIndex + 1}
          total={lesson.reviews.length}
          onCheck={lesson.answerReview}
          onNext={lesson.advanceReview}
        />
      </div>
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
    <div className="pt-10">
      <SpeakStep
        unit={unit}
        prompt={prompt}
        retry={attempts.length === 1}
        error={lesson.error}
        onSubmit={lesson.submitAnswer}
      />
    </div>
  );
}

/** The round ink button that says the word, sized up to sit beside it. */
const PLAY = 'size-12 shrink-0 rounded-full [&_svg]:size-5';

/** Today's word, met before the answer it should turn up in. */
function WordStep({ word, onContinue }: { word: SessionWord; onContinue: () => void }) {
  const voice = usePartnerVoice();
  const recorded = word.pronunciation?.audioUrl;

  return (
    <section
      className="flex flex-col gap-5 pt-10 lg:pt-14"
      aria-label="Today's word"
      data-testid="word-step"
    >
      <p className={LABEL}>Today&apos;s word</p>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-5">
          <h2 className="font-display text-6xl leading-none font-semibold tracking-[-0.035em] break-words lg:text-[88px]">
            {word.word}
          </h2>
          {/*
            The dictionary's recording when it has one. Otherwise the browser's
            own voice, as the partner on /talk speaks, because /speak is
            ElevenLabs only and the free setup has no key for it: a button that
            always says "Couldn't play that" teaches nothing. Spoken straight
            from the tap, not after a failed request, because iOS can refuse
            speech that does not start from one. /speak is left for a browser
            with no voice at all. Keyed on the word: the button keeps its
            source for the life of the mount.
          */}
          {recorded || !voice.supported ? (
            <PronounceButton
              key={word.word}
              word={word.word}
              pronunciation={word.pronunciation ?? { ipa: null, audioUrl: null }}
              className={PLAY}
            />
          ) : (
            <Button
              type="button"
              data-testid="pronounce"
              className={PLAY}
              aria-label={`Hear ${word.word}`}
              onClick={() => voice.say(word.word, { force: true })}
            >
              <Volume2Icon />
            </Button>
          )}
        </div>
        {word.pronunciation?.ipa && (
          <p className="font-mono text-sm text-muted-foreground">{word.pronunciation.ipa}</p>
        )}
        <p className="max-w-[560px] font-display text-[28px] leading-[38px]">{word.definition}</p>
      </div>
      <SayItBack word={word.word} withMic />
      <div className="mt-5 flex items-center justify-between gap-3 border-t pt-5">
        <p className="text-sm text-muted-foreground">Try to use it in your answer.</p>
        <Button className={PRIMARY} onClick={onContinue}>
          Continue <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </div>
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
        word={lesson.word?.word}
        note={
          <p aria-live="polite" className="flex items-center gap-2">
            {lesson.bankedWord && (
              <>
                <CheckIcon aria-hidden className="size-3.5" />
                Today&apos;s word is in your bank.
              </>
            )}
          </p>
        }
      >
        <Button className={PRIMARY} onClick={() => void finish()} disabled={finishing}>
          {finishing && <LoaderCircleIcon className="animate-spin" />}
          Finish
        </Button>
      </LessonFeedback>
      {lesson.error && <Notice message={lesson.error} tone="error" testId="finish-notice" />}
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
    <section className="space-y-6 pt-10 lg:pt-14" aria-label="Lesson done" data-testid="done-step">
      <div className="flex items-baseline gap-4" role="status">
        <p className="font-display text-title font-semibold tracking-tight">+{xp} XP</p>
        <p className="text-muted-foreground">{progress.streak}-day streak</p>
      </div>
      {/* No unit: the next lesson on the path, as the page opens with. */}
      <Button className={PRIMARY} onClick={() => onStart()}>
        Another lesson
      </Button>
    </section>
  );
}
