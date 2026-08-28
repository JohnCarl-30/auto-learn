'use client';

import { useEffect, type ReactNode } from 'react';
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

  useArrowKeyFocus(focused, total, onFocus);

  return (
    <div className="space-y-6" data-testid="review">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground" data-testid="progress">
          Sentence {focused + 1} of {total}
          {gatedCount > 0 &&
            ` · ${gatedCount} ${gatedCount === 1 ? 'suggestion' : 'suggestions'}`}
        </span>
        <div className="flex items-center gap-2">
          {total > 1 && (
            <span
              className="hidden text-xs text-muted-foreground sm:inline"
              data-testid="arrow-hint"
            >
              ← → to move
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={onStartOver}>
            Start over
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-5">
        {sentences.map((sentence, index) => {
          const isFocused = index === focused;

          return (
            <div key={sentence.index} className="space-y-4">
              {isFocused ? (
                <SentenceView
                  sentence={sentence}
                  interactive
                  onOpenGate={onOpenGate}
                  onLookup={onLookup}
                />
              ) : (
                /*
                  A real control, not a div with a click handler. Moving between
                  sentences was mouse-only, which made every gate in every other
                  sentence unreachable without one — and the dimming was deep
                  enough to fail contrast on the text it was dimming.
                */
                <div
                  role="button"
                  tabIndex={0}
                  data-testid="focus-sentence"
                  aria-label={`Go to sentence ${index + 1}`}
                  onClick={() => onFocus(index)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    // Space scrolls the page otherwise, which is the opposite
                    // of what someone selecting a sentence asked for.
                    event.preventDefault();
                    onFocus(index);
                  }}
                  className={cn(
                    'cursor-pointer rounded-md opacity-70 transition-opacity hover:opacity-100',
                    'outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/60',
                  )}
                >
                  <SentenceView
                    sentence={sentence}
                    interactive={false}
                    onOpenGate={onOpenGate}
                    onLookup={onLookup}
                  />
                </div>
              )}

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
 * Left and right move between sentences.
 *
 * Bound to the window rather than to a container, because by the time you want
 * the next sentence your focus is usually inside the card you just read. The
 * guards matter more than the binding: a modifier means a browser shortcut,
 * and a text field means someone is moving a cursor, not a selection.
 */
function useArrowKeyFocus(
  focused: number,
  total: number,
  onFocus: (index: number) => void,
) {
  useEffect(() => {
    if (total < 2) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (isTyping(event.target)) return;

      const next =
        event.key === 'ArrowRight'
          ? focused + 1
          : event.key === 'ArrowLeft'
            ? focused - 1
            : null;

      if (next === null || next < 0 || next >= total) return;

      event.preventDefault();
      onFocus(next);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focused, total, onFocus]);
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
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
            className="group flex w-full items-baseline gap-2 rounded-sm text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
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
