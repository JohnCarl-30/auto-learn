'use client';

import { useState } from 'react';
import { MicIcon } from 'lucide-react';
import { judgeSaidBack, type SaidBack } from '@auto-learn/shared';
import { Button } from '@/components/ui/button';
import { reportEvent } from '@/lib/api';
import { useDictation } from '@/lib/use-dictation';
import { cn } from '@/lib/utils';

/**
 * Say the word back, and find out whether it came through.
 *
 * The product already speaks and already listens — the card has a pronounce
 * button and the compose panel takes dictation. This points the two halves at
 * each other, which is the cheapest real feature available: no new
 * infrastructure, no new provider, and pronunciation is half of what a learner
 * is anxious about.
 *
 * Nothing here is scored or banked. Transcription of accented English is good
 * rather than perfect, and a record of "you mispronounced this" built on a
 * fallible transcriber would be a record of the transcriber's bad days
 * attributed to the learner. What it does instead is tell you what was heard,
 * and let you decide.
 */
export function SayItBack({ word, withMic = false }: { word: string; withMic?: boolean }) {
  const [result, setResult] = useState<SaidBack | null>(null);

  const dictation = useDictation((transcript) => {
    const verdict = judgeSaidBack(word, transcript);
    setResult(verdict);
    reportEvent(
      verdict.verdict === 'matched' ? 'said_back_matched' : 'said_back_missed',
    );
    // One word, so one phrase: no Stop to press after saying it.
  }, { once: true });

  const recording = dictation.status === 'recording';
  const busy = dictation.status === 'transcribing';

  return (
    <div className="space-y-1.5 font-sans" data-testid="say-it-back">
      <Button
        size="sm"
        // Ghost until it is recording: an outline button beside the word reads
        // as something the card wants you to do, and this is an offer.
        variant={recording ? 'default' : 'ghost'}
        className="h-auto gap-1.5 px-0 py-0 font-medium text-cobalt underline underline-offset-[3px] hover:bg-transparent hover:text-cobalt data-[recording=true]:px-2 data-[recording=true]:py-1 data-[recording=true]:text-primary-foreground data-[recording=true]:no-underline"
        data-recording={recording}
        data-testid="say-it-back-toggle"
        disabled={busy}
        onClick={() => {
          if (recording) {
            dictation.stop();
            return;
          }
          // The previous attempt goes the moment a new one starts, so a stale
          // verdict cannot sit under a fresh recording and look like its answer.
          setResult(null);
          void dictation.start();
        }}
      >
        {withMic && !recording && <MicIcon aria-hidden />}
        {recording ? 'Stop' : busy ? 'Listening…' : 'Say it back'}
      </Button>

      {dictation.problem && (
        <p
          role="status"
          data-testid="say-it-back-problem"
          className="text-muted-foreground text-sm"
        >
          {dictation.problem.message}
        </p>
      )}

      {result && (
        <p
          role="status"
          aria-live="polite"
          data-testid="say-it-back-result"
          className={cn(
            'text-sm',
            result.verdict === 'matched'
              ? 'text-emerald-700 dark:text-emerald-400'
              : 'text-muted-foreground',
          )}
        >
          {describe(result, word)}
        </p>
      )}
    </div>
  );
}

/**
 * What the reader is told.
 *
 * Every line below the first reports rather than judges — "I heard" and not
 * "you said". The transcriber is the fallible party here far more often than
 * the learner is, and the wording has to leave room for that being true.
 */
function describe(result: SaidBack, word: string): string {
  switch (result.verdict) {
    case 'matched':
      return `That came through as ${word}.`;
    case 'close':
      return `Close — I heard “${result.heard}”.`;
    case 'different':
      return `I heard “${result.heard}”. Play it again and try once more.`;
    case 'nothing':
      return "I didn't catch anything that time.";
  }
}
