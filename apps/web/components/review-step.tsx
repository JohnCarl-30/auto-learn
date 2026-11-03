'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ReviewItem } from '@/lib/use-lesson';

/**
 * One due word, recalled from its cue: the learner's own sentence with the word
 * blanked, or the definition when there is no sentence to blank.
 *
 * One answer per word. Check locks after it, so a second tap cannot record the
 * word twice on its ladder; Next moves on. A wrong answer shows the word and
 * nothing else, because the point is to see it again, not to be marked down.
 * The caller keys this on the word, so each one starts empty.
 */
export function ReviewStep({
  item,
  position,
  total,
  onCheck,
  onNext,
}: {
  item: ReviewItem;
  position: number;
  total: number;
  onCheck: (answer: string) => Promise<boolean>;
  onNext: () => void;
}) {
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState(false);
  const [right, setRight] = useState<boolean | null>(null);

  const check = async () => {
    if (checked || !answer.trim()) return;
    setChecked(true);
    setRight(await onCheck(answer));
  };

  return (
    <section className="space-y-4" aria-label="Review" data-testid="review-step">
      <p className="text-sm text-muted-foreground">
        Word {position} of {total}
      </p>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void check();
        }}
      >
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {item.cueIsDefinition ? 'Which word means this?' : 'Fill in the missing word.'}
          </p>
          <p id="review-cue" className="text-lg leading-relaxed">
            {item.cue}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/*
            16px at every width: iOS zooms the page into any smaller input, and
            the Input default drops to 14px from md up.
          */}
          <Input
            aria-label="The missing word"
            aria-describedby="review-cue"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            readOnly={checked}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="h-11 text-base md:text-base"
          />
          <Button type="submit" size="lg" className="h-11" disabled={checked || !answer.trim()}>
            Check
          </Button>
        </div>
      </form>

      <div aria-live="polite" data-testid="review-result">
        {right !== null &&
          (right ? (
            <p className="font-medium text-emerald-700 dark:text-emerald-400">Right</p>
          ) : (
            <p>
              The word is <span className="font-medium">{item.lemma}</span>
            </p>
          ))}
      </div>

      {right !== null && (
        <Button onClick={onNext} autoFocus>
          Next
        </Button>
      )}
    </section>
  );
}
