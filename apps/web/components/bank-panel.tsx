'use client';

import { useState } from 'react';
import { CLAIM_PROMPT_THRESHOLD, type BankEntry } from '@auto-learn/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export function BankPanel({
  entries,
  count,
}: {
  entries: BankEntry[];
  count: number;
}) {
  const [expanded, setExpanded] = useState(false);

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

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">
          Word bank{' '}
          <span data-testid="bank-count" className="text-muted-foreground">
            · {count}
          </span>
        </h2>
        <Button
          variant="ghost"
          size="sm"
          data-testid="bank-toggle"
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? 'Hide' : 'Show'}
        </Button>
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

      {expanded && (
        <ul className="mt-4 space-y-4" data-testid="bank-list">
          {entries.map((entry) => (
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
              </div>
              <p className="text-sm text-muted-foreground">{entry.definition}</p>
              <p className="text-xs text-muted-foreground/70 italic">
                from: {entry.sourceSentence}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
