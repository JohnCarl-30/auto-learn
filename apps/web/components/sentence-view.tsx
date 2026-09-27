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
 * Two marks, and what separates them is what opening one gives you.
 *
 * Amber-filled means there is a *word* behind this — a definition, synonyms, a
 * nuance, something that lands in your bank. Dashed means there is a *rule* or
 * a *construction* behind it: one line, nothing to learn as vocabulary.
 *
 * So the split follows the note-versus-card branch in the API exactly, and
 * wordiness joins grammar on the dashed side: a sentence that was shortened
 * teaches you a shape, not a word. Making all four look alike, as the first
 * two did, meant you could not tell what you were about to open.
 */
const GATE_STYLES: Record<GatedSuggestionType, string> = {
  'word-choice':
    'bg-amber-500/15 decoration-amber-600/70 hover:bg-amber-500/30',
  register: 'bg-amber-500/15 decoration-amber-600/70 hover:bg-amber-500/30',
  grammar:
    'decoration-sky-600/70 decoration-dashed hover:bg-sky-500/10 dark:decoration-sky-400/70',
  wordiness:
    'decoration-sky-600/70 decoration-dashed hover:bg-sky-500/10 dark:decoration-sky-400/70',
};

/** Every target in the sentence is reachable by keyboard, and says where it is. */
const FOCUS_RING =
  'outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background';

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
          /*
            An unfocused sentence renders as text, not as a row of disabled
            buttons. Disabled controls are still announced, so a screen reader
            walking the review met every gate in every sentence and could act on
            none of them — and the whole unfocused sentence is one click target
            in the panel above, which a nested button would fight.
          */
          if (!interactive) {
            return (
              <span
                key={`g-${segment.start}`}
                data-testid="gate"
                data-gate-type={segment.suggestion.type}
                className="rounded-sm px-0.5 underline decoration-2 decoration-muted-foreground/40 underline-offset-4"
              >
                {segment.suggestion.original}
              </span>
            );
          }

          return (
            <button
              key={`g-${segment.start}`}
              type="button"
              data-testid="gate"
              data-gate-type={segment.suggestion.type}
              onClick={() => onOpenGate(segment.suggestion.id)}
              className={cn(
                'cursor-pointer rounded-sm px-0.5 underline decoration-2 underline-offset-4',
                GATE_STYLES[segment.suggestion.type],
                FOCUS_RING,
              )}
            >
              {segment.suggestion.original}
            </button>
          );
        }

        if (!interactive) {
          return <span key={`t-${segment.start}`}>{segment.value}</span>;
        }

        // Plain text: every word is individually tappable, so curiosity is
        // never blocked on the model having flagged something.
        return tokenizeWords(segment.value, segment.start).map((token) =>
          token.isWord ? (
            <button
              key={`w-${token.start}`}
              type="button"
              data-testid="word"
              onClick={() => onLookup(bareWord(token.value))}
              className={cn(
                'cursor-pointer rounded-sm hover:bg-muted hover:underline hover:decoration-dotted hover:underline-offset-4',
                FOCUS_RING,
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
