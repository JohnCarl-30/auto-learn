'use client';

import { useState } from 'react';
import type { TransformOption } from '@auto-learn/shared';
import { ComposePanel } from '@/components/compose-panel';
import { ReviewPanel } from '@/components/review-panel';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useReview } from '@/lib/use-review';

export default function Page() {
  const { state, submit, focus, reset } = useReview();

  /** Which gate (or word) is open. The card body itself lands in task 5. */
  const [openCard, setOpenCard] = useState<string | null>(null);

  const start = (text: string, option: TransformOption) => {
    setOpenCard(null);
    void submit(text, option);
  };

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <header className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight">auto-learn</h1>
        <p className="mt-1 text-muted-foreground">
          Fix your sentence, and learn the word that fixed it.
        </p>
      </header>

      {(state.status === 'idle' || state.status === 'error') && (
        <div className="space-y-6">
          <ComposePanel disabled={false} onSubmit={start} />
          {state.status === 'error' && <Notice error={state.error} />}
        </div>
      )}

      {state.status === 'proposing' && (
        <div className="space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-11/12" />
          <Skeleton className="h-7 w-4/6" />
        </div>
      )}

      {state.status === 'reviewing' && (
        <ReviewPanel
          response={state.response}
          focused={state.focused}
          onFocus={(index) => {
            setOpenCard(null);
            focus(index);
          }}
          onOpenGate={setOpenCard}
          onLookup={setOpenCard}
          onStartOver={reset}
          cardSlot={openCard ? <PendingCard /> : null}
        />
      )}
    </main>
  );
}

/**
 * Placeholder for the inline word card. The gate is real — the replacement
 * wording is not in this page's data at all, it only arrives with the card
 * response — so this stays a skeleton until /card exists.
 */
function PendingCard() {
  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </CardContent>
    </Card>
  );
}

function Notice({
  error,
}: {
  error: { code: string; message: string; sentenceCount?: number };
}) {
  // An over-cap paste is the product explaining its workflow, not a failure.
  const guidance = error.code === 'too_many_sentences';

  return (
    <div
      role="status"
      className={
        guidance
          ? 'rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm'
          : 'rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive'
      }
    >
      {error.message}
    </div>
  );
}
