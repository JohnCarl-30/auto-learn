'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { LoaderCircleIcon, MicIcon, SquareIcon } from 'lucide-react';
import {
  MAX_SENTENCES,
  TRANSFORM_HINTS,
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

/** The last transform run, so the keyboard has something to repeat. */
const LAST_OPTION_KEY = 'auto-learn:last-transform';

/*
  Read as an external store rather than copied into state: the server cannot
  know it, so an initial value would be a hydration mismatch. Same shape as the
  bank panel's expanded flag.
*/
const listeners = new Set<() => void>();

function subscribeToLastOption(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function readLastOption(): TransformOption | null {
  const stored = window.localStorage.getItem(LAST_OPTION_KEY);
  const parsed = TransformOption.safeParse(stored);

  return parsed.success ? parsed.data : null;
}

function writeLastOption(option: TransformOption): void {
  window.localStorage.setItem(LAST_OPTION_KEY, option);
  for (const listener of listeners) listener();
}

/** Somewhere else someone is typing — their Enter is not ours. */
function isOtherField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  return target.isContentEditable || ['INPUT', 'SELECT'].includes(target.tagName);
}

/**
 * Naming the wrong key is worse than naming none. Safe to branch on the
 * platform here because the hint only renders once there is a stored choice,
 * which the server snapshot never has — so this never runs during hydration.
 */
function shortcutLabel(): string {
  const mac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

  return mac ? '⌘↵' : 'Ctrl↵';
}

/**
 * Sentences to try when you have arrived with nothing of your own.
 *
 * Each one is wrong in a different way — agreement, padding, a word doing the
 * wrong job — so whichever you pick, the review has something to teach rather
 * than a clean sentence and an apology. They are the product's only claim
 * about what it is for that you can check in one click.
 */
const EXAMPLES = [
  'The results was very big, so we can make a conclusion that the theory is correct.',
  'I want to say that this problem is very important for many peoples around the world.',
  'She dont have much informations about the topic, but she try her best anyway.',
];

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

  const lastOption = useSyncExternalStore(
    subscribeToLastOption,
    readLastOption,
    () => null,
  );

  const run = (option: TransformOption) => {
    writeLastOption(option);
    onSubmit(text, option);
  };

  /*
    Cmd-Enter repeats your last transform rather than picking one for you.
    There is no sensible default among four verbs, and guessing spends a model
    call on a decision nobody made — so before the first choice this key does
    nothing, and once there is a choice the hint below says what it will do.

    Bound to the window rather than to the textarea: the panel comes back after
    a failed request with focus nowhere in particular, and a shortcut that
    depends on where you last clicked is a shortcut people stop trusting. The
    bank's search box sits on the same page, so typing there is left alone.
  */
  useEffect(() => {
    if (disabled || empty || !lastOption) return;

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
      if (isOtherField(event.target)) return;

      event.preventDefault();
      writeLastOption(lastOption);
      onSubmit(text, lastOption);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [disabled, empty, lastOption, onSubmit, text]);

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
        Tapping an example fills the box and stops there. Submitting for you
        would skip the choice of transform, which is the one thing a first-time
        visitor has to understand — and would spend a model call on a decision
        they did not make.
      */}
      {empty && (
        <div className="space-y-2" data-testid="examples">
          <p className="text-sm text-muted-foreground">
            Nothing to hand? Start from one of these.
          </p>
          <ul className="space-y-1.5">
            {EXAMPLES.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  data-testid="example"
                  onClick={() => onTextChange(example)}
                  className="w-full rounded-md border border-dashed px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-solid hover:bg-muted hover:text-foreground"
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        The button stays enabled over the cap on purpose. Blocking here would
        mean the server never sees the attempt, and the overflow count is the
        signal that decides whether whole-essay mode is worth building.
      */}
      <div className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((option) => (
          <Button
            key={option}
            data-testid={`option-${option}`}
            variant="outline"
            disabled={disabled || empty}
            onClick={() => run(option)}
            className="h-auto flex-col items-start gap-0.5 py-2 text-left whitespace-normal"
          >
            <span>{TRANSFORM_LABELS[option]}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {TRANSFORM_HINTS[option]}
            </span>
          </Button>
        ))}
      </div>

      {lastOption && !empty && (
        <p className="text-xs text-muted-foreground" data-testid="repeat-hint">
          {shortcutLabel()} repeats {TRANSFORM_LABELS[lastOption]}
        </p>
      )}
    </div>
  );
}
