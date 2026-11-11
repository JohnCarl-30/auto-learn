'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { diffWords, type ProposeResponse } from '@auto-learn/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** The finished sentence sits on a quiet panel, set like the sentence above it. */
const BOX = 'rounded-md bg-muted px-6 py-5 font-display text-lg leading-[30px]';

/**
 * The way out of the product.
 *
 * The review renders the sentence as marked-up spans — highlights, underlines,
 * per-word buttons — which is unselectable in practice. Someone came here to
 * leave with better text, so the finished version has to exist somewhere as
 * plain, copyable prose.
 *
 * That plain version stays the default view for exactly that reason. The diff
 * is the second thing you want, not the first: it answers "what did I get
 * wrong?", which only matters once you have the text you came for.
 */
export function FinishedText({ response }: { response: ProposeResponse }) {
  const [showChanges, setShowChanges] = useState(false);

  const text = response.sentences.map((sentence) => sentence.text).join(' ');
  // Sentences carry the paste exactly as it was typed, which is the only
  // record of it — the review mutates `text` in place as suggestions land.
  const typed = response.sentences
    .map((sentence) => sentence.original ?? sentence.text)
    .join(' ');

  const parts = useMemo(() => diffWords(typed, text), [typed, text]);
  const changed = typed !== text;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      // Clipboard can be blocked by permissions or an insecure context. The
      // failure used to be silent, which reads as a dead button — say what
      // happened, and point at the way out that always works.
      toast.error('Could not copy. Select the text and copy it yourself.');
    }
  };

  return (
    <section className="mt-10 space-y-3" data-testid="finished">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-mono text-[11px] font-normal uppercase tracking-[0.08em] text-muted-foreground">
          Your sentence
        </h2>
        <div className="flex items-center gap-4">
          {/*
            Offered only when there is something to show. A toggle that reveals
            an unchanged sentence teaches nothing and reads as broken.
          */}
          {changed && (
            <Button
              size="sm"
              variant="link"
              className="px-0 text-foreground"
              data-testid="toggle-changes"
              aria-pressed={showChanges}
              onClick={() => setShowChanges((shown) => !shown)}
            >
              {showChanges ? 'Hide changes' : 'Show changes'}
            </Button>
          )}
          <Button
            size="sm"
            variant="link"
            className="px-0 text-cobalt"
            data-testid="copy"
            onClick={() => void copy()}
          >
            Copy
          </Button>
        </div>
      </div>

      {showChanges ? (
        <>
          {/*
            `del` and `ins` rather than styled spans: the colours are the fast
            read for people who can see them, and the elements are the only
            read for everyone else.
          */}
          <p
            data-testid="diff-text"
            className={BOX}
          >
            {parts.map((part, index) => {
              if (part.kind === 'removed') {
                return (
                  <del
                    key={index}
                    data-testid="diff-removed"
                    className="text-destructive"
                  >
                    {part.value}
                  </del>
                );
              }

              if (part.kind === 'added') {
                return (
                  <ins
                    key={index}
                    data-testid="diff-added"
                    className="font-semibold text-cobalt no-underline"
                  >
                    {part.value}
                  </ins>
                );
              }

              return <span key={index}>{part.value}</span>;
            })}
          </p>

          <p className="text-xs text-muted-foreground">
            <del className="text-destructive">Struck out</del> is what you
            wrote;{' '}
            <ins className="no-underline">
              <span className="font-semibold text-cobalt">highlighted</span>
            </ins>{' '}
            is what it became.
          </p>
        </>
      ) : (
        <p
          data-testid="finished-text"
          className={cn(BOX, 'select-all')}
        >
          {text}
        </p>
      )}
    </section>
  );
}
