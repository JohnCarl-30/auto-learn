'use client';

import type { BankEntry } from '@auto-learn/shared';
import { ComposePanel } from '@/components/compose-panel';
import { ReviewPanel } from '@/components/review-panel';
import { WordCard } from '@/components/word-card';
import { BankPanel } from '@/components/bank-panel';
import { FinishedText } from '@/components/finished-text';
import { ProposingPanel } from '@/components/proposing-panel';
import { SiteNav } from '@/components/site-nav';
import { PageHeader } from '@/components/page-header';
import { ApiNotice } from '@/components/notice';
import { useReview } from '@/lib/use-review';
import { useBank } from '@/lib/use-bank';
import { useBankSync } from '@/lib/use-bank-sync';
import { useIsDesktop } from '@/lib/use-is-desktop';
import { cn } from '@/lib/utils';

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
    open,
    bankVersion,
    reused,
    saved,
    saveLookup,
    draft,
    setDraft,
  } = useReview();

  // Two reasons the bank may have changed: this session wrote to it, or a sync
  // brought words in from another device. Both have to re-read it.
  const synced = useBankSync();
  const bank = useBank(bankVersion + synced);

  // One card, mounted once: beside the review on a desktop, where it takes the
  // bank's column, and under its sentence on a phone.
  const desktop = useIsDesktop();
  const cardView = card ? (
    <WordCard
      state={card}
      saved={saved}
      onAccept={accept}
      onReject={reject}
      onSave={() => void saveLookup()}
      onDismiss={dismiss}
    />
  ) : null;
  const railCard = desktop && state.status === 'reviewing' ? cardView : null;
  const composing = state.status === 'idle' || state.status === 'error';

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16 lg:max-w-6xl">
      <SiteNav />
      <PageHeader
        eyebrow="Write"
        title="Fix your sentence, and learn the word that fixed it."
        display={composing}
      />

      {/* Desktop: the work on the left, the bank beside it. Phone: the bank follows below. */}
      <div
        className={cn(
          'lg:grid lg:gap-16',
          railCard
            ? 'lg:grid-cols-[minmax(0,1fr)_392px]'
            : 'lg:grid-cols-[minmax(0,1fr)_320px]',
        )}
      >
        <div>
          {composing && (
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
            <ProposingPanel preview={state.preview} />
          )}

          {state.status !== 'reviewing' && reused.length > 0 && (
            <div className="mb-6">
              <ReuseNotice entries={reused} />
            </div>
          )}

          {state.status === 'reviewing' && (
            <ReviewPanel
              response={state.response}
              focused={state.focused}
              onFocus={focus}
              onOpenGate={(suggestionId) => openGate(state.focused, suggestionId)}
              onLookup={(word) => lookup(state.focused, word)}
              onStartOver={reset}
              cardSlot={railCard ? null : cardView}
              activeGateId={railCard ? open?.suggestionId : null}
              notice={reused.length > 0 ? <ReuseNotice entries={reused} /> : null}
            />
          )}

          {state.status === 'reviewing' && (
            <FinishedText response={state.response} />
          )}
        </div>

        {railCard ? (
          <aside className="lg:sticky lg:top-6 lg:self-start">{railCard}</aside>
        ) : (
        <aside className="lg:border-l lg:pl-10">
          <BankPanel
            entries={bank.entries}
            count={bank.count}
            onRemove={(id) => void bank.remove(id)}
            onExport={() => void bank.download()}
            onImport={(file) => void bank.restore(file)}
          />
        </aside>
        )}
      </div>
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
      className="border-l-4 border-marker bg-marker/35 px-4 py-3 text-[13px]"
    >
      You used{' '}
      <span className="font-semibold">
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
