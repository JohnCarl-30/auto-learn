'use client';

import {
  bareWord,
  segmentSentence,
  tokenizeWords,
  type ReviewedSentence,
} from '@auto-learn/shared';
import { cn } from '@/lib/utils';

export function SentenceView({
  sentence,
  interactive,
  onOpenGate,
  onLookup,
}: {
  sentence: ReviewedSentence;
  /** Only the focused sentence responds to clicks. */
  interactive: boolean;
  onOpenGate: (suggestionId: string) => void;
  onLookup: (word: string) => void;
}) {
  const segments = segmentSentence(
    sentence.text,
    sentence.silentFixes,
    sentence.gated,
  );

  return (
    <p className="text-lg leading-loose">
      {segments.map((segment) => {
        if (segment.kind === 'silent') {
          return (
            <span
              key={`s-${segment.start}`}
              title={segment.fix.note}
              className="underline decoration-muted-foreground/50 decoration-dotted underline-offset-4"
            >
              {segment.fix.replacement}
            </span>
          );
        }

        if (segment.kind === 'gated') {
          return (
            <button
              key={`g-${segment.start}`}
              type="button"
              disabled={!interactive}
              onClick={() => onOpenGate(segment.suggestion.id)}
              title={segment.suggestion.teaser}
              className={cn(
                'rounded-sm bg-amber-500/15 px-0.5 underline decoration-amber-600/60 decoration-2 underline-offset-4',
                interactive && 'hover:bg-amber-500/30 cursor-pointer',
              )}
            >
              {segment.suggestion.original}
            </button>
          );
        }

        // Plain text: every word is individually tappable, so curiosity is
        // never blocked on the model having flagged something.
        return tokenizeWords(segment.value, segment.start).map((token) =>
          token.isWord ? (
            <button
              key={`w-${token.start}`}
              type="button"
              disabled={!interactive}
              onClick={() => onLookup(bareWord(token.value))}
              className={cn(
                'rounded-sm',
                interactive &&
                  'cursor-pointer hover:bg-muted hover:underline hover:decoration-dotted hover:underline-offset-4',
              )}
            >
              {token.value}
            </button>
          ) : (
            <span key={`ws-${token.start}`}>{token.value}</span>
          ),
        );
      })}
    </p>
  );
}
