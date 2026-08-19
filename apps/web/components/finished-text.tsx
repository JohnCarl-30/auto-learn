'use client';

import { useEffect, useState } from 'react';
import type { ProposeResponse } from '@auto-learn/shared';
import { Button } from '@/components/ui/button';

/**
 * The way out of the product.
 *
 * The review renders the sentence as marked-up spans — highlights, underlines,
 * per-word buttons — which is unselectable in practice. Someone came here to
 * leave with better text, so the finished version has to exist somewhere as
 * plain, copyable prose.
 */
export function FinishedText({ response }: { response: ProposeResponse }) {
  const [copied, setCopied] = useState(false);

  const text = response.sentences.map((sentence) => sentence.text).join(' ');

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard can be blocked by permissions or an insecure context. The
      // text is visible and selectable regardless, so this is recoverable
      // without an error message.
      setCopied(false);
    }
  };

  return (
    <section className="mt-10 space-y-3" data-testid="finished">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Your sentence
        </h2>
        <Button size="sm" variant="outline" data-testid="copy" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      <p
        data-testid="finished-text"
        className="rounded-md border bg-muted/30 px-4 py-3 text-base leading-relaxed select-all"
      >
        {text}
      </p>
    </section>
  );
}
