'use client';

import type { ProposePreview } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The wait, with something in it.
 *
 * A spinner for six seconds says the same thing whether the model is halfway
 * through the sentence or the request died. These lines are the model's actual
 * findings, in the order it found them, on the reader's own words.
 *
 * Nothing here is interactive, and that is the point. Offsets are not settled
 * until every silent fix has been applied, so a preview that offered a gate to
 * click would be pointing at a position that is about to move. The gates
 * become real when the payload lands.
 */
export function ProposingPanel({ preview }: { preview: ProposePreview[] }) {
  return (
    <div className="space-y-4" data-testid="proposing">
      {preview.length === 0 ? (
        <>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-4/6" />
        </>
      ) : (
        <ul className="space-y-2 text-sm">
          {preview.map((item, index) => (
            <li
              key={`${item.kind}-${item.sentence}-${item.original}-${index}`}
              data-testid={`preview-${item.kind}`}
              className="flex items-baseline gap-2 rounded-md border border-border/60 px-3 py-2"
            >
              {item.kind === 'fix' ? (
                <>
                  <span className="text-muted-foreground line-through">
                    {item.original}
                  </span>
                  <span aria-hidden className="text-muted-foreground">
                    →
                  </span>
                  <span className="font-medium">{item.replacement}</span>
                </>
              ) : (
                <>
                  <span className="font-medium">{item.original}</span>
                  <span className="text-muted-foreground">{item.teaser}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-sm text-muted-foreground" role="status">
        Reading your sentence…
      </p>
    </div>
  );
}
