'use client';

import { useMemo } from 'react';
import {
  MAX_SENTENCES,
  TRANSFORM_HINTS,
  TRANSFORM_LABELS,
  TransformOption,
  splitSentences,
} from '@auto-learn/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const OPTIONS = TransformOption.options;

/**
 * Sentences to try when you have arrived with nothing of your own.
 *
 * Each one is wrong in a different way — agreement, padding, a word doing the
 * wrong job — so whichever you pick, the review has something to teach rather
 * than a clean sentence and an apology. They are the product's only claim
 * about what it is for that you can check in one click.
 */
const EXAMPLES = [
  'The results was very big, so we can make a conclusion that the theory is correct.',
  'I want to say that this problem is very important for many peoples around the world.',
  'She dont have much informations about the topic, but she try her best anyway.',
];

/**
 * Controlled on purpose. The page unmounts this panel while a proposal is in
 * flight, so a draft owned here would not survive a failed request — see the
 * note on `draft` in use-review.
 */
export function ComposePanel({
  text,
  onTextChange,
  disabled,
  onSubmit,
}: {
  text: string;
  onTextChange: (text: string) => void;
  disabled: boolean;
  onSubmit: (text: string, option: TransformOption) => void;
}) {
  const count = useMemo(() => splitSentences(text).length, [text]);
  const overCap = count > MAX_SENTENCES;
  const empty = count === 0;

  return (
    <div className="space-y-4">
      <Textarea
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder="Paste one to three sentences you're unsure about."
        rows={5}
        className="resize-none text-base leading-relaxed"
        data-testid="compose"
        aria-label="Sentences to review"
      />

      <div className="flex min-h-5 items-center justify-between text-sm">
        <span
          data-testid="sentence-count"
          className={overCap ? 'text-amber-600' : 'text-muted-foreground'}
        >
          {empty
            ? 'One to three sentences.'
            : `${count} ${count === 1 ? 'sentence' : 'sentences'}`}
        </span>
        {overCap && (
          <span className="text-amber-600">
            That&apos;s more than I take at once.
          </span>
        )}
      </div>

      {/*
        Tapping an example fills the box and stops there. Submitting for you
        would skip the choice of transform, which is the one thing a first-time
        visitor has to understand — and would spend a model call on a decision
        they did not make.
      */}
      {empty && (
        <div className="space-y-2" data-testid="examples">
          <p className="text-sm text-muted-foreground">
            Nothing to hand? Start from one of these.
          </p>
          <ul className="space-y-1.5">
            {EXAMPLES.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  data-testid="example"
                  onClick={() => onTextChange(example)}
                  className="w-full rounded-md border border-dashed px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-solid hover:bg-muted hover:text-foreground"
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        The button stays enabled over the cap on purpose. Blocking here would
        mean the server never sees the attempt, and the overflow count is the
        signal that decides whether whole-essay mode is worth building.
      */}
      <div className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((option) => (
          <Button
            key={option}
            data-testid={`option-${option}`}
            variant="outline"
            disabled={disabled || empty}
            onClick={() => onSubmit(text, option)}
            className="h-auto flex-col items-start gap-0.5 py-2 text-left whitespace-normal"
          >
            <span>{TRANSFORM_LABELS[option]}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {TRANSFORM_HINTS[option]}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
