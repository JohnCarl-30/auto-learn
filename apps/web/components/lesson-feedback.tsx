'use client';

import type { LessonUnit, ProposeResponse, WordUse } from '@auto-learn/shared';
import { TeaserList } from '@/components/review-panel';
import { SentenceView } from '@/components/sentence-view';
import { Button } from '@/components/ui/button';
import { WordCard } from '@/components/word-card';
import { useGatedReview } from '@/lib/use-gated-review';
import type { SpokenResult } from '@/lib/use-lesson';
import { clock } from '@/lib/utils';

/**
 * Said as what was heard, in the tone of say-back.ts: the transcriber can miss
 * a word, and "not heard" blames nobody for that.
 */
const WORD_USE: Record<WordUse, string> = {
  correct: "Today's word: you used it, and used it well.",
  incorrect: "Today's word: you used it, though not quite in its usual sense.",
  unused: "Today's word: not heard this time.",
};

/**
 * Feedback on one spoken answer, after it is finished and never during:
 * point first, the unit's shape, length and fillers, the day's word, and the
 * weakest sentence reviewed behind the same gates as everywhere else.
 *
 * `retryTarget` says this attempt is the retry, so its length is held to the
 * unit's retry target (unit 3's twenty seconds) rather than the first one.
 * `onRetry` is given only while one more attempt is allowed.
 */
export function LessonFeedback({
  unit,
  attempt,
  retryTarget,
  onRetry,
}: {
  unit: LessonUnit;
  attempt: SpokenResult;
  retryTarget: boolean;
  onRetry?: () => void;
}) {
  const { feedback, fillers, seconds } = attempt;
  const target = retryTarget
    ? (unit.retryTargetSeconds ?? unit.targetSeconds)
    : unit.targetSeconds;
  // Most heard first, so the habit worth working on leads.
  const heard = Object.entries(fillers.byWord).sort(([, a], [, b]) => b - a);

  return (
    <section className="space-y-5" aria-label="Feedback" data-testid="lesson-feedback">
      <div className="space-y-1">
        <p className="text-lg leading-relaxed" data-testid="first-sentence">
          Your first sentence: ‘{feedback.firstSentence}’
        </p>
        <p className="text-sm text-muted-foreground">{feedback.pointFirstNote}</p>
      </div>

      <div className="space-y-1.5">
        <ul className="space-y-1.5" aria-label="Parts of your answer">
          {feedback.parts.map((part, index) => (
            <li key={index} className="text-sm">
              <span className="font-medium capitalize">{part.label}</span>
              {' — '}
              {part.quote ? (
                <span>‘{part.quote}’</span>
              ) : (
                <span className="text-muted-foreground">Not heard</span>
              )}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">{feedback.structureNote}</p>
      </div>

      <div className="space-y-1 text-sm">
        {/* A typed answer has no length worth reporting. */}
        {seconds !== null && (
          <p data-testid="duration">
            You spoke for {clock(seconds)} (target {clock(target)})
          </p>
        )}
        <p data-testid="fillers">
          Fillers heard: {fillers.total}
          {heard.length > 0 &&
            ` (${heard.map(([word, count]) => `${word} ×${count}`).join(', ')})`}
        </p>
        {feedback.wordUse && <p>{WORD_USE[feedback.wordUse]}</p>}
      </div>

      {feedback.review && (
        <div className="space-y-2">
          <p className="text-sm font-medium">One sentence, tighter</p>
          <GatedReview initial={feedback.review} />
        </div>
      )}

      {onRetry && (
        <Button variant="outline" onClick={onRetry} data-testid="retry">
          {unit.retryTargetSeconds
            ? `Now say it in ${unit.retryTargetSeconds} seconds`
            : 'Try once more'}
        </Button>
      )}
    </section>
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
