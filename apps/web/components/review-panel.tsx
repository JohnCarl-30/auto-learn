'use client';

import type { ReactNode } from 'react';
import type {
  GatedSuggestionType,
  ProposeResponse,
  ReviewedSentence,
} from '@auto-learn/shared';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { SentenceView } from './sentence-view';

/** Matches the marks in the sentence, so the list reads as a key to them. */
const DOT_STYLES: Record<GatedSuggestionType, string> = {
  'word-choice': 'bg-amber-500/70',
  register: 'bg-amber-500/70',
  grammar: 'bg-sky-600/70',
};

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

              {isFocused && !cardSlot && (
                <TeaserList sentence={sentence} onOpenGate={onOpenGate} />
              )}

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

/**
 * The teasers used to live in a `title` attribute, which meant they did not
 * exist on touch and were slow to find on desktop — the one thing that tells
 * you what is behind a gate was effectively invisible. They are text now.
 */
function TeaserList({
  sentence,
  onOpenGate,
}: {
  sentence: ReviewedSentence;
  onOpenGate: (suggestionId: string) => void;
}) {
  if (sentence.gated.length === 0) return null;

  return (
    <ul className="space-y-1.5" data-testid="teasers">
      {sentence.gated.map((suggestion) => (
        <li key={suggestion.id}>
          <button
            type="button"
            data-testid="teaser"
            onClick={() => onOpenGate(suggestion.id)}
            className="group flex w-full items-baseline gap-2 text-left text-sm"
          >
            <span
              aria-hidden
              className={cn(
                'mt-1.5 size-1.5 shrink-0 rounded-full',
                DOT_STYLES[suggestion.type],
              )}
            />
            <span className="text-muted-foreground group-hover:text-foreground">
              <span className="font-medium text-foreground">
                {suggestion.original}
              </span>{' '}
              — {suggestion.teaser}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
