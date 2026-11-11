'use client';

import type { ReactNode } from 'react';
import type { LessonUnit, ProposeResponse, WordUse } from '@auto-learn/shared';
import { TeaserList } from '@/components/review-panel';
import { SentenceView } from '@/components/sentence-view';
import { Button } from '@/components/ui/button';
import { WordCard } from '@/components/word-card';
import { useGatedReview } from '@/lib/use-gated-review';
import type { SpokenResult } from '@/lib/use-lesson';
import { clock, cn } from '@/lib/utils';

/**
 * Said as what was heard, in the tone of say-back.ts: the transcriber can miss
 * a word, and "not heard" blames nobody for that.
 */
const WORD_USE: Record<WordUse, string> = {
  correct: 'Used well',
  incorrect: 'Not quite',
  unused: 'Not heard',
};

const LABEL = 'font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground';

/**
 * Feedback on one spoken answer, after it is finished and never during:
 * point first, the unit's shape, length and fillers, the day's word, and the
 * weakest sentence reviewed behind the same gates as everywhere else.
 *
 * `retryTarget` says this attempt is the retry, so its length is held to the
 * unit's retry target (unit 3's twenty seconds) rather than the first one.
 * `onRetry` is given only while one more attempt is allowed. `note` and the
 * children are the caller's end of the footer: what to say, and the way on.
 */
export function LessonFeedback({
  unit,
  attempt,
  retryTarget,
  onRetry,
  word,
  note,
  children,
}: {
  unit: LessonUnit;
  attempt: SpokenResult;
  retryTarget: boolean;
  onRetry?: () => void;
  /** Today's word, named on its tile when the lesson had one. */
  word?: string;
  note?: ReactNode;
  children?: ReactNode;
}) {
  const { feedback, fillers, seconds } = attempt;
  const target = retryTarget
    ? (unit.retryTargetSeconds ?? unit.targetSeconds)
    : unit.targetSeconds;
  // Most heard first, so the habit worth working on leads.
  const heard = Object.entries(fillers.byWord).sort(([, a], [, b]) => b - a);

  return (
    <section
      className="space-y-8 pt-10 lg:pt-14"
      aria-label="Feedback"
      data-testid="lesson-feedback"
    >
      <div className="space-y-3">
        <p className={LABEL}>Your first sentence</p>
        <p
          className="font-display text-3xl font-semibold tracking-tight"
          data-testid="first-sentence"
        >
          “{feedback.firstSentence}”
        </p>
        <p className="text-sm">{feedback.pointFirstNote}</p>
      </div>

      <div className="space-y-3">
        {feedback.parts.length > 0 && (
          <ul className="border-b" aria-label="Parts of your answer">
            {feedback.parts.map((part, index) => (
              <li key={index} className="flex items-baseline gap-4 border-t py-3 text-[13px]">
                <span className="w-24 shrink-0 font-semibold capitalize">{part.label}</span>
                {part.quote ? (
                  <span className="font-display text-[15px] italic">“{part.quote}”</span>
                ) : (
                  <span className="text-destructive">Not heard</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[13px] text-muted-foreground">{feedback.structureNote}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {/* A typed answer has no length worth reporting. */}
        {seconds !== null && (
          <Stat
            testId="duration"
            value={clock(seconds)}
            detail={`/ target ${clock(target)}`}
            label="You spoke for"
          />
        )}
        <Stat
          testId="fillers"
          value={String(fillers.total)}
          detail={heard.map(([filler, count]) => `${filler} ×${count}`).join(', ')}
          label="Fillers heard"
        />
        {feedback.wordUse && (
          <Stat
            testId="word-use"
            value={WORD_USE[feedback.wordUse]}
            label={word ? `Today's word: ${word}` : "Today's word"}
            accent={feedback.wordUse === 'correct'}
          />
        )}
      </div>

      {feedback.review && (
        <div className="space-y-3">
          <p className={LABEL}>One sentence, tighter</p>
          <GatedReview initial={feedback.review} />
        </div>
      )}

      {(note || onRetry || children) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <div className="text-[13px]">{note}</div>
          <div className="flex items-center gap-2">
            {onRetry && (
              <Button
                variant="outline"
                className="h-11 rounded-md px-4"
                onClick={onRetry}
                data-testid="retry"
              >
                {unit.retryTargetSeconds
                  ? `Now say it in ${unit.retryTargetSeconds} seconds`
                  : 'Try once more'}
              </Button>
            )}
            {children}
          </div>
        </div>
      )}
    </section>
  );
}

/** One figure about the answer: the number large, what it counts underneath. */
function Stat({
  testId,
  value,
  detail,
  label,
  accent = false,
}: {
  testId: string;
  value: string;
  detail?: string;
  label: string;
  /** The one worth a second look, filled rather than outlined. */
  accent?: boolean;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'rounded-md border px-4 py-3.5',
        accent && 'border-transparent bg-cobalt-wash',
      )}
    >
      <p className="flex items-baseline gap-1.5">
        <span className={cn('font-display text-2xl font-semibold', accent && 'text-cobalt')}>
          {value}
        </span>
        {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
      </p>
      <p className={cn('mt-1.5 text-xs', !accent && 'text-muted-foreground')}>{label}</p>
    </div>
  );
}

/**
 * The reviewed sentence as /talk shows a turn: marks in the sentence, teasers
 * under it, and the card in their place once a gate is opened.
 */
function GatedReview({ initial }: { initial: ProposeResponse }) {
  const gated = useGatedReview(initial);

  return (
    <div className="space-y-3">
      {gated.review.sentences.map((sentence, index) => (
        <div key={sentence.index} className="space-y-2">
          <SentenceView
            sentence={sentence}
            interactive
            onOpenGate={(id) => void gated.openGate(index, id)}
            onLookup={(word) => gated.lookup(index, word)}
          />
          {gated.card && gated.open?.sentenceIndex === index ? (
            <WordCard
              state={gated.card}
              saved={gated.saved}
              onAccept={gated.accept}
              onReject={gated.reject}
              onSave={() => void gated.saveLookup()}
              onDismiss={gated.dismiss}
            />
          ) : (
            <TeaserList sentence={sentence} onOpenGate={(id) => void gated.openGate(index, id)} />
          )}
        </div>
      ))}
    </div>
  );
}
