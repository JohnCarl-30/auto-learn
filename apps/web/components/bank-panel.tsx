'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { CLAIM_PROMPT_THRESHOLD, type BankEntry } from '@auto-learn/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { DRILL_MIN, RecallDrill } from './recall-drill';

/** Where the open/closed choice is kept, so it survives a reload. */
const EXPANDED_KEY = 'auto-learn:bank-expanded';

/**
 * localStorage read as an external store rather than copied into state.
 *
 * The server has no localStorage, so the value cannot be an initial state
 * without a hydration mismatch on the element the whole panel hangs off. A
 * server snapshot of "closed" plus a client snapshot of the stored choice is
 * exactly what `useSyncExternalStore` is for; the `storage` subscription is a
 * free extra — a second tab that opens the bank opens it here too.
 */
const listeners = new Set<() => void>();

function subscribeToExpanded(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function readExpanded(): boolean {
  return window.localStorage.getItem(EXPANDED_KEY) === 'true';
}

function writeExpanded(value: boolean): void {
  window.localStorage.setItem(EXPANDED_KEY, String(value));
  for (const listener of listeners) listener();
}

type SortOrder = 'recent' | 'alphabetical' | 'reused';

const SORT_LABELS: Record<SortOrder, string> = {
  recent: 'Newest first',
  alphabetical: 'A–Z',
  reused: 'Most reused',
};

export function BankPanel({
  entries,
  count,
  onRemove,
}: {
  entries: BankEntry[];
  count: number;
  onRemove?: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<SortOrder>('recent');
  const [drilling, setDrilling] = useState(false);

  const expanded = useSyncExternalStore(
    subscribeToExpanded,
    readExpanded,
    () => false,
  );

  const toggle = () => writeExpanded(!expanded);

  const visible = useMemo(() => filterAndSort(entries, query, order), [entries, query, order]);

  if (count === 0) {
    return (
      <section className="mt-16" data-testid="bank">
        <Separator className="mb-6" />
        <p className="text-sm text-muted-foreground">
          Words you accept or look up will collect here.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-16" data-testid="bank">
      <Separator className="mb-6" />

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          Word bank{' '}
          <span data-testid="bank-count" className="text-muted-foreground">
            · {count}
          </span>
        </h2>
        <div className="flex items-center gap-1">
          {/*
            Practice is offered over what is on screen, so a search narrows the
            drill as well as the list — the cheapest way to work on one corner
            of the bank without building a second selection mechanism.
          */}
          {expanded && !drilling && visible.length >= DRILL_MIN && (
            <Button
              variant="ghost"
              size="sm"
              data-testid="bank-practice"
              onClick={() => setDrilling(true)}
            >
              Practice
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            data-testid="bank-toggle"
            onClick={toggle}
          >
            {expanded ? 'Hide' : 'Show'}
          </Button>
        </div>
      </div>

      {/*
        The account ask waits until the bank is worth losing. Asking on first
        visit trades the only thing that makes someone say yes for nothing.
      */}
      {count >= CLAIM_PROMPT_THRESHOLD && (
        <div
          data-testid="claim-prompt"
          className="mt-4 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm"
        >
          You have {count} words saved on this device. Create an account to keep
          them.
        </div>
      )}

      {expanded && drilling && (
        <div className="mt-4">
          <RecallDrill entries={visible} onDone={() => setDrilling(false)} />
        </div>
      )}

      {expanded && !drilling && (
        <>
          {/*
            A bank you cannot search stops being a bank at about thirty words —
            it becomes a scroll. The controls appear with the list rather than
            above the toggle so a collapsed panel stays one line.
          */}
          <div className="mt-4 flex items-center gap-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your words"
              aria-label="Search the word bank"
              data-testid="bank-search"
              className="h-7 text-sm"
            />
            <select
              value={order}
              onChange={(event) => setOrder(event.target.value as SortOrder)}
              aria-label="Sort the word bank"
              data-testid="bank-sort"
              className="h-7 shrink-0 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              {(Object.keys(SORT_LABELS) as SortOrder[]).map((value) => (
                <option key={value} value={value}>
                  {SORT_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          {visible.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground" data-testid="bank-no-match">
              No word here matches “{query}”.
            </p>
          ) : (
            <ul className="mt-4 space-y-4" data-testid="bank-list">
              {visible.map((entry) => (
                <li key={entry.id} className="space-y-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">{entry.word}</span>
                    <span className="text-xs text-muted-foreground">
                      {entry.partOfSpeech}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {entry.addedVia}
                    </Badge>
                    {entry.timesReused > 0 && (
                      <Badge className="text-xs" data-testid="reused-badge">
                        used {entry.timesReused}×
                      </Badge>
                    )}
                    {onRemove && (
                      <button
                        type="button"
                        data-testid="remove-word"
                        aria-label={`Remove ${entry.word}`}
                        onClick={() => onRemove(entry.id)}
                        className="ml-auto text-xs text-muted-foreground hover:text-destructive"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{entry.definition}</p>
                  <p className="text-xs text-muted-foreground/70 italic">
                    from: {entry.sourceSentence}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Search covers the definition and the source sentence, not just the word.
 * Half of what someone remembers about a banked word is the sentence they met
 * it in — "the one about the results" has to find it.
 */
function filterAndSort(
  entries: readonly BankEntry[],
  query: string,
  order: SortOrder,
): BankEntry[] {
  const needle = query.trim().toLowerCase();

  const matched = needle
    ? entries.filter((entry) =>
        [entry.word, entry.definition, entry.sourceSentence].some((field) =>
          field.toLowerCase().includes(needle),
        ),
      )
    : [...entries];

  switch (order) {
    case 'alphabetical':
      return matched.sort((a, b) => a.word.localeCompare(b.word));
    case 'reused':
      // Ties fall back to newest, so an untouched bank still reads as a list
      // rather than as whatever order IndexedDB handed back.
      return matched.sort(
        (a, b) => b.timesReused - a.timesReused || b.addedAt.localeCompare(a.addedAt),
      );
    default:
      return matched.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }
}
