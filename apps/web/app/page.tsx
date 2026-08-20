'use client';

import type { ApiError, ApiErrorCode, BankEntry } from '@auto-learn/shared';
import { ComposePanel } from '@/components/compose-panel';
import { ReviewPanel } from '@/components/review-panel';
import { WordCard } from '@/components/word-card';
import { BankPanel } from '@/components/bank-panel';
import { FinishedText } from '@/components/finished-text';
import { Skeleton } from '@/components/ui/skeleton';
import { useReview } from '@/lib/use-review';
import { useBank } from '@/lib/use-bank';

export default function Page() {
  const {
    state,
    card,
    submit,
    focus,
    openGate,
    lookup,
    accept,
    reject,
    dismiss,
    reset,
    bankVersion,
    reused,
    saved,
    saveLookup,
    draft,
    setDraft,
  } = useReview();

  const bank = useBank(bankVersion);

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
          <ComposePanel
            text={draft}
            onTextChange={setDraft}
            disabled={false}
            onSubmit={submit}
          />
          {state.status === 'error' && <Notice error={state.error} />}
        </div>
      )}

      {state.status === 'proposing' && (
        <div className="space-y-4" data-testid="proposing">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-11/12" />
          <Skeleton className="h-7 w-4/6" />
        </div>
      )}

      {reused.length > 0 && <ReuseNotice entries={reused} />}

      {state.status === 'reviewing' && (
        <ReviewPanel
          response={state.response}
          focused={state.focused}
          onFocus={focus}
          onOpenGate={(suggestionId) => openGate(state.focused, suggestionId)}
          onLookup={(word) => lookup(state.focused, word)}
          onStartOver={reset}
          cardSlot={
            card ? (
              <WordCard
                state={card}
                saved={saved}
                onAccept={accept}
                onReject={reject}
                onSave={() => void saveLookup()}
                onDismiss={dismiss}
              />
            ) : null
          }
        />
      )}

      {state.status === 'reviewing' && (
        <FinishedText response={state.response} />
      )}

      <BankPanel
        entries={bank.entries}
        count={bank.count}
        onRemove={(id) => void bank.remove(id)}
      />
    </main>
  );
}

/**
 * The only reward in the product, and it is earned: it fires because the
 * writer used a banked word themselves, not because they showed up.
 */
function ReuseNotice({ entries }: { entries: BankEntry[] }) {
  const words = entries.map((entry) => entry.word);
  const when = (entry: BankEntry) =>
    new Date(entry.addedAt).toLocaleDateString();

  return (
    <div
      data-testid="reuse-notice"
      className="mb-6 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm"
    >
      You used{' '}
      <span className="font-medium">
        {words.length === 1
          ? words[0]
          : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`}
      </span>{' '}
      here yourself.{' '}
      {entries.length === 1 && (
        <span className="text-muted-foreground">
          You looked it up on {when(entries[0])}.
        </span>
      )}
    </div>
  );
}

/**
 * Refusals that are not failures.
 *
 * An over-cap paste is the product explaining its workflow, and a refused burst
 * is "wait a moment" — neither is the red treatment that means something broke.
 * Everything else keeps it.
 */
const GUIDANCE: Partial<Record<ApiErrorCode, string>> = {
  too_many_sentences: 'cap-notice',
  rate_limited: 'wait-notice',
};

function Notice({ error }: { error: ApiError }) {
  const guidance = GUIDANCE[error.code];

  return (
    <div
      role="status"
      data-testid={guidance ?? 'error-notice'}
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
