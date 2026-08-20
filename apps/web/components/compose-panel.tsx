'use client';

import { useMemo } from 'react';
import { LoaderCircleIcon, MicIcon, SquareIcon } from 'lucide-react';
import {
  MAX_SENTENCES,
  TRANSFORM_LABELS,
  TransformOption,
  joinDictation,
  splitSentences,
} from '@auto-learn/shared';
import { Notice, toneFor } from '@/components/notice';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useDictation } from '@/lib/use-dictation';

const OPTIONS = TransformOption.options;

/**
 * Controlled on purpose. The page unmounts this panel while a proposal is in
 * flight, so a draft owned here would not survive a failed request — see the
 * note on `draft` in use-review.
 */
export function ComposePanel({
  text,
  onTextChange,
  disabled,
  onSubmit,
}: {
  text: string;
  onTextChange: (text: string) => void;
  disabled: boolean;
  onSubmit: (text: string, option: TransformOption) => void;
}) {
  // Appends rather than replaces. Setting a controlled textarea's value from
  // code pushes no browser undo entry, so overwriting a draft would destroy
  // typed work with nothing to recover it with.
  const dictation = useDictation((transcript) =>
    onTextChange(joinDictation(text, transcript)),
  );
  const recording = dictation.status === 'recording';
  const transcribing = dictation.status === 'transcribing';

  const count = useMemo(() => splitSentences(text).length, [text]);
  const overCap = count > MAX_SENTENCES;
  const empty = count === 0;

  return (
    <div className="space-y-4">
      <Textarea
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder="Paste one to three sentences you're unsure about."
        rows={5}
        className="resize-none text-base leading-relaxed"
        data-testid="compose"
        aria-label="Sentences to review"
      />

      <div className="flex min-h-5 items-center justify-between gap-3 text-sm">
        <span
          data-testid="sentence-count"
          className={overCap ? 'text-amber-600' : 'text-muted-foreground'}
        >
          {recording
            ? 'Listening…'
            : transcribing
              ? 'Writing that down…'
              : empty
                ? 'One to three sentences.'
                : `${count} ${count === 1 ? 'sentence' : 'sentences'}`}
        </span>

        <div className="flex items-center gap-3">
          {overCap && (
            <span className="text-amber-600">
              That&apos;s more than I take at once.
            </span>
          )}
          <Button
            type="button"
            data-testid="dictate"
            variant={recording ? 'secondary' : 'ghost'}
            size="sm"
            disabled={disabled || transcribing}
            aria-label={recording ? 'Stop recording' : 'Dictate instead'}
            onClick={() => (recording ? dictation.stop() : void dictation.start())}
          >
            {transcribing ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : recording ? (
              <SquareIcon />
            ) : (
              <MicIcon />
            )}
          </Button>
        </div>
      </div>

      {dictation.problem && (
        <Notice
          message={dictation.problem.message}
          // A denied microphone is guidance; a provider that fell over is not.
          // Same rules the rest of the app already uses.
          tone={
            dictation.problem.code
              ? toneFor(dictation.problem.code)
              : 'guidance'
          }
          testId="dictation-notice"
        />
      )}

      {/*
        The button stays enabled over the cap on purpose. Blocking here would
        mean the server never sees the attempt, and the overflow count is the
        signal that decides whether whole-essay mode is worth building.
      */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {OPTIONS.map((option) => (
          <Button
            key={option}
            data-testid={`option-${option}`}
            variant="outline"
            disabled={disabled || empty}
            onClick={() => onSubmit(text, option)}
          >
            {TRANSFORM_LABELS[option]}
          </Button>
        ))}
      </div>
    </div>
  );
}
