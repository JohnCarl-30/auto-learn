'use client';

import {
  bareWord,
  segmentSentence,
  tokenizeWords,
  type GatedSuggestionType,
  type ReviewedSentence,
} from '@auto-learn/shared';
import { cn } from '@/lib/utils';

/**
 * Grammar and word choice are different promises, so they get different marks.
 *
 * Amber-filled means there is a *word* behind this — opening it gives you a
 * definition, synonyms and a nuance you can bank. A plain rule-underline means
 * there is a *rule* behind it: one line, nothing to learn as vocabulary. Making
 * them look identical, as they first did, meant you could not tell which kind
 * of thing you were about to open.
 */
const GATE_STYLES: Record<GatedSuggestionType, string> = {
  'word-choice':
    'bg-amber-500/15 decoration-amber-600/70 hover:bg-amber-500/30',
  register: 'bg-amber-500/15 decoration-amber-600/70 hover:bg-amber-500/30',
  grammar:
    'decoration-sky-600/70 decoration-dashed hover:bg-sky-500/10 dark:decoration-sky-400/70',
};

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
              data-testid="gate"
              data-gate-type={segment.suggestion.type}
              disabled={!interactive}
              onClick={() => onOpenGate(segment.suggestion.id)}
              className={cn(
                'rounded-sm px-0.5 underline decoration-2 underline-offset-4',
                interactive
                  ? cn('cursor-pointer', GATE_STYLES[segment.suggestion.type])
                  : // An unfocused sentence should not compete for attention:
                    // its marks stay legible but stop shouting.
                    'decoration-muted-foreground/40',
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
              data-testid="word"
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
