'use client';

import type { ReactNode } from 'react';
import type { ProposeResponse } from '@auto-learn/shared';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { SentenceView } from './sentence-view';

export function ReviewPanel({
  response,
  focused,
  onFocus,
  onOpenGate,
  onLookup,
  onStartOver,
  cardSlot,
}: {
  response: ProposeResponse;
  focused: number;
  onFocus: (index: number) => void;
  onOpenGate: (suggestionId: string) => void;
  onLookup: (word: string) => void;
  onStartOver: () => void;
  /** The inline card, rendered directly beneath the focused sentence. */
  cardSlot: ReactNode;
}) {
  const { sentences } = response;
  const total = sentences.length;
  const gatedCount = sentences[focused]?.gated.length ?? 0;

  return (
    <div className="space-y-6" data-testid="review">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground" data-testid="progress">
          Sentence {focused + 1} of {total}
          {gatedCount > 0 &&
            ` · ${gatedCount} ${gatedCount === 1 ? 'suggestion' : 'suggestions'}`}
        </span>
        <Button variant="ghost" size="sm" onClick={onStartOver}>
          Start over
        </Button>
      </div>

      <Separator />

      <div className="space-y-5">
        {sentences.map((sentence, index) => {
          const isFocused = index === focused;

          return (
            <div key={sentence.index} className="space-y-4">
              <div
                className={cn(
                  'transition-opacity',
                  isFocused
                    ? 'opacity-100'
                    : 'cursor-pointer opacity-40 hover:opacity-70',
                )}
                onClick={isFocused ? undefined : () => onFocus(index)}
              >
                <SentenceView
                  sentence={sentence}
                  interactive={isFocused}
                  onOpenGate={onOpenGate}
                  onLookup={onLookup}
                />
              </div>

              {isFocused && cardSlot}
            </div>
          );
        })}
      </div>

      {sentences.every((s) => s.gated.length === 0) && (
        <p className="text-sm text-muted-foreground">
          Nothing worth stopping for here — this reads well already.
        </p>
      )}
    </div>
  );
}
