'use client';

import type { BankEntry } from '@auto-learn/shared';
import { ComposePanel } from '@/components/compose-panel';
import { ReviewPanel } from '@/components/review-panel';
import { WordCard } from '@/components/word-card';
import { BankPanel } from '@/components/bank-panel';
import { FinishedText } from '@/components/finished-text';
import { ThemeToggle } from '@/components/theme-toggle';
import { ApiNotice } from '@/components/notice';
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
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">auto-learn</h1>
          <ThemeToggle />
        </div>
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
          {state.status === 'error' && <ApiNotice error={state.error} />}
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
