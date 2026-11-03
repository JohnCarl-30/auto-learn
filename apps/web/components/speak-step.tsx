'use client';

import { useEffect, useState } from 'react';
import { LoaderCircleIcon, MicIcon, SendIcon, SquareIcon } from 'lucide-react';
import {
  MAX_LESSON_RECORDING_SECONDS,
  joinDictation,
  type LessonUnit,
} from '@auto-learn/shared';
import { ApiNotice, Notice } from '@/components/notice';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useDictation } from '@/lib/use-dictation';
import { clock } from '@/lib/utils';

/** How long before the recorder stops itself the learner is told it will. */
const CLOSING_SECONDS = 15;

/**
 * The prompt, answered out loud.
 *
 * The transcript lands in a box to be checked before it is sent, as on /talk,
 * because feedback on words the transcriber misheard is feedback on words
 * nobody said. Typing works too (no microphone, or no wish to use one), and a
 * typed answer has no length: `seconds` is only ever what the microphone timed,
 * from the start of each recording to its stop, added up.
 *
 * Unit 6 is answered cold: the prompt stays hidden until Start, then five
 * seconds to think, then the recorder starts by itself.
 */
export function SpeakStep({
  unit,
  prompt,
  retry,
  error,
  onSubmit,
}: {
  unit: LessonUnit;
  prompt: { id: string; text: string };
  /** The second attempt, held to the retry target where the unit has one. */
  retry: boolean;
  error: string | null;
  onSubmit: (answer: string, seconds: number | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [spoken, setSpoken] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [revealed, setRevealed] = useState(!unit.prepSeconds);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  // The recorder, never the browser recogniser: that one stops at the first
  // pause, and a lesson answer is a minute or two of pauses.
  const dictation = useDictation(
    (transcript) => setDraft((current) => joinDictation(current, transcript)),
    { maxSeconds: MAX_LESSON_RECORDING_SECONDS, engine: 'recorder' },
  );
  const recording = dictation.status === 'recording';
  const transcribing = dictation.status === 'transcribing';
  const { start } = dictation;

  // Timed from when the recorder is actually running, not from the tap, so a
  // slow permission prompt is not counted as speaking.
  useEffect(() => {
    if (!recording) return;
    const startedAt = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => {
      clearInterval(tick);
      setElapsed(0);
      setSpoken((total) => (total ?? 0) + Math.round((Date.now() - startedAt) / 1000));
    };
  }, [recording]);

  // One second at a time; the last one starts the recorder.
  useEffect(() => {
    if (countdown === null) return;
    const next = setTimeout(() => {
      if (countdown > 1) {
        setCountdown(countdown - 1);
      } else {
        setCountdown(null);
        void start();
      }
    }, 1000);
    return () => clearTimeout(next);
  }, [countdown, start]);

  const target = retry ? (unit.retryTargetSeconds ?? unit.targetSeconds) : unit.targetSeconds;
  const answer = draft.trim();

  const submit = async () => {
    if (!answer || sending || recording || transcribing) return;
    setSending(true);
    try {
      await onSubmit(answer, spoken);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-4" aria-label="Speak" data-testid="speak-step">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{unit.title}</p>
        {revealed ? (
          <p className="text-lg leading-relaxed" data-testid="prompt">
            {prompt.text}
          </p>
        ) : (
          <p className="text-lg leading-relaxed">
            The question stays hidden until you start. You get {unit.prepSeconds} seconds to
            think, then the microphone opens.
          </p>
        )}
        <p className="text-sm text-muted-foreground">Aim for {clock(target)}</p>
      </div>

      {!revealed && (
        <Button
          size="lg"
          className="h-11"
          onClick={() => {
            setRevealed(true);
            setCountdown(unit.prepSeconds ?? 0);
          }}
        >
          Start
        </Button>
      )}

      <p aria-live="assertive" className="text-sm font-medium" data-testid="countdown">
        {countdown !== null && `Recording in ${countdown}…`}
      </p>

      {revealed && (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Press the mic and answer, or type."
            rows={5}
            className="resize-none text-base leading-relaxed"
            aria-label="Your answer"
            data-testid="answer"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground" aria-live="polite">
              {recording
                ? `Listening… ${clock(elapsed)}`
                : transcribing
                  ? 'Writing that down…'
                  : 'Check what I heard, then submit.'}
            </span>
            {/* 44px targets, as on /talk: pressed by thumb, mid-answer. */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={recording ? 'secondary' : 'outline'}
                size="lg"
                className="h-11 min-w-11"
                disabled={sending || transcribing || countdown !== null}
                aria-label={recording ? 'Stop recording' : 'Answer out loud'}
                onClick={() => (recording ? dictation.stop() : void start())}
                data-testid="lesson-mic"
              >
                {transcribing ? (
                  <LoaderCircleIcon className="animate-spin" />
                ) : recording ? (
                  <SquareIcon />
                ) : (
                  <MicIcon />
                )}
              </Button>
              <Button
                type="submit"
                size="lg"
                className="h-11"
                disabled={!answer || sending || recording || transcribing}
                data-testid="submit-answer"
              >
                {sending ? <LoaderCircleIcon className="animate-spin" /> : <SendIcon />} Submit
              </Button>
            </div>
          </div>
          {/*
            Its own region, apart from the ticking clock above, so a screen
            reader hears it once when it appears rather than every second.
          */}
          <p aria-live="polite" className="text-sm text-muted-foreground" data-testid="time-left">
            {recording &&
              elapsed >= MAX_LESSON_RECORDING_SECONDS - CLOSING_SECONDS &&
              `${CLOSING_SECONDS} seconds left. Finish your thought.`}
          </p>
        </form>
      )}

      {/* The recorder's refusals, coloured by the same rules as /talk's. */}
      {dictation.problem &&
        (dictation.problem.code ? (
          <ApiNotice
            error={{ code: dictation.problem.code, message: dictation.problem.message }}
            testId="dictation-notice"
          />
        ) : (
          <Notice message={dictation.problem.message} tone="guidance" testId="dictation-notice" />
        ))}

      {error && <Notice message={error} tone="error" testId="speak-notice" />}
    </section>
  );
}
