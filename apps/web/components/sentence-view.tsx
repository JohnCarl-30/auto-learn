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
 * Cobalt-filled means there is a *word* behind this — a definition, synonyms, a
 * nuance, something that lands in your bank. Dashed means there is a *rule* or
 * a *construction* behind it: one line, nothing to learn as vocabulary.
 *
 * So the split follows the note-versus-card branch in the API exactly, and
 * wordiness joins grammar on the dashed side: a sentence that was shortened
 * teaches you a shape, not a word. Making all four look alike, as the first
 * two did, meant you could not tell what you were about to open.
 */
const WORD_GATE =
  'rounded-t-sm border-b-2 border-cobalt bg-cobalt-wash px-1 text-cobalt hover:bg-cobalt/20 dark:text-foreground';
const RULE_GATE =
  'rounded-sm text-cobalt underline decoration-cobalt decoration-dashed decoration-1 underline-offset-[6px] hover:bg-cobalt-wash dark:text-foreground';
const GATE_STYLES: Record<GatedSuggestionType, string> = {
  'word-choice': WORD_GATE,
  register: WORD_GATE,
  grammar: RULE_GATE,
  wordiness: RULE_GATE,
};

/** Every target in the sentence is reachable by keyboard, and says where it is. */
const FOCUS_RING =
  'outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background';

export function SentenceView({
  sentence,
  interactive,
  onOpenGate,
  onLookup,
  className,
}: {
  sentence: ReviewedSentence;
  /** The size, which is the caller's: a review reads larger than a chat turn. */
  className?: string;
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
    <p className={cn('font-display text-2xl leading-9', className)}>
      {segments.map((segment) => {
        if (segment.kind === 'silent') {
          return (
            <span
              key={`s-${segment.start}`}
              title={segment.fix.note}
              className="underline decoration-muted-foreground/60 decoration-dotted decoration-1 underline-offset-[6px]"
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
                'cursor-pointer',
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
