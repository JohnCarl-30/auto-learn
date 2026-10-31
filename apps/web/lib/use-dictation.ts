'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AUDIO_MEDIA_TYPES,
  MAX_RECORDING_SECONDS,
  RECORDING_BITS_PER_SECOND,
  type ApiErrorCode,
} from '@auto-learn/shared';
import { ApiFailure, dictate } from './api';
import { recognitionConstructor, type BrowserRecognition } from './speech-recognition';

export type DictationStatus = 'idle' | 'recording' | 'transcribing';

/**
 * A refusal, and where it came from.
 *
 * `code` is null for the ones the browser settled by itself — a denied
 * microphone never reaches the server. Keeping the distinction here rather
 * than deciding the colour lets the panel apply the same amber/red rules as
 * every other refusal in the app, instead of this one guessing.
 */
export type DictationProblem = {
  message: string;
  code: ApiErrorCode | null;
};

/**
 * Not an ApiErrorCode, and deliberately not one.
 *
 * A refused microphone never reaches the server — the browser settles it
 * locally. Adding a code for it to the wire vocabulary would mean the API
 * declaring a failure it can neither cause nor observe.
 */
const NO_PERMISSION =
  'I need permission to use your microphone. Allow it in your browser, then try again.';

const NO_RECORDER = "This browser won't let me record audio.";

const NO_SPEECH = "I didn't hear anything. Try again.";

/**
 * Who is doing the hearing. The browser's own recogniser costs nothing, so it
 * goes first; recording and uploading to /dictate is the path for browsers
 * with no recogniser (an iPhone home-screen app has none) or whose recogniser
 * has said it cannot work here.
 */
export type DictationEngine = 'browser' | 'recorder';

/**
 * Opus in WebM first, because it is what speech at this bitrate is for. The
 * rest are fallbacks for browsers that disagree, and the list is shared with
 * the server so the two cannot drift into rejecting each other's choices.
 */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', ...AUDIO_MEDIA_TYPES].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

export function useDictation(onTranscript: (transcript: string) => void) {
  const [status, setStatus] = useState<DictationStatus>('idle');
  const [problem, setProblem] = useState<DictationProblem | null>(null);
  // Lazy, so the lookup runs once per mount rather than on every render. State
  // rather than a ref because a fallback is for the rest of the hook's life and
  // `start` has to see it on the next press.
  const [engine, setEngine] = useState<DictationEngine>(() =>
    recognitionConstructor() ? 'browser' : 'recorder',
  );

  const recorder = useRef<MediaRecorder | null>(null);
  const recognition = useRef<BrowserRecognition | null>(null);
  // Transcription outlives the panel: someone can stop recording and navigate
  // away before the answer arrives. Reporting into a component that is gone is
  // a warning at best and a leak at worst.
  const alive = useRef(true);
  const stopAt = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Held in a ref so that `start` does not have to be rebuilt every time the
   * panel re-renders with a new closure — a recorder that restarted whenever
   * the draft changed would be a recorder that never finished.
   */
  const heard = useRef<(t: string) => void>(onTranscript);
  useEffect(() => {
    heard.current = onTranscript;
  }, [onTranscript]);

  const release = useCallback(() => {
    if (stopAt.current) clearTimeout(stopAt.current);
    stopAt.current = null;
    recorder.current?.stream.getTracks().forEach((track) => track.stop());
    recorder.current = null;
  }, []);

  // Leaving the microphone open after the panel is gone is the kind of bug
  // people notice as a recording light that will not switch off.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      release();
      // Abort rather than stop: stop still delivers what was heard so far, to a
      // panel that is no longer there.
      recognition.current?.abort();
    };
  }, [release]);

  const startRecorder = useCallback(async () => {
    if (typeof MediaRecorder === 'undefined') {
      setProblem({ message: NO_RECORDER, code: null });
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setProblem({ message: NO_PERMISSION, code: null });
      return;
    }

    const mimeType = pickMimeType();
    const active = new MediaRecorder(stream, {
      mimeType,
      // Set explicitly: Chrome picks roughly twice this for Opus by default,
      // which doubles every upload without making a word easier to hear.
      audioBitsPerSecond: RECORDING_BITS_PER_SECOND,
    });
    const chunks: Blob[] = [];

    active.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    active.onstop = () => {
      release();

      // Ending every track ends the recorder, so unmounting mid-recording
      // arrives here. Without this the upload still goes — a transcription
      // paid for and thrown away, because the panel it would report into is
      // gone. The guards further down discard the answer; this declines to ask
      // the question. Reachable by ordinary use: the transform buttons and
      // ⌘↵ stay live while recording, so submitting mid-sentence unmounts us.
      if (!alive.current) return;

      const recording = new Blob(chunks, {
        type: mimeType ?? AUDIO_MEDIA_TYPES[0],
      });

      if (recording.size === 0) {
        setStatus('idle');
        return;
      }

      setStatus('transcribing');
      dictate(recording)
        .then((result) => {
          if (!alive.current) return;
          heard.current(result.transcript);
          setProblem(null);
        })
        .catch((error: unknown) => {
          if (!alive.current) return;
          setProblem(
            error instanceof ApiFailure
              ? { message: error.detail.message, code: error.detail.code }
              : {
                  message: 'Something went wrong with that recording.',
                  code: 'upstream_failed',
                },
          );
        })
        .finally(() => {
          if (alive.current) setStatus('idle');
        });
    };

    recorder.current = active;
    active.start();
    setStatus('recording');

    // The server refuses on bytes, because bytes are all it can see without
    // decoding. This is the half that keeps an honest recording under the cap
    // in the first place, rather than letting someone talk for five minutes
    // and then telling them it was too long.
    stopAt.current = setTimeout(
      () => active.state !== 'inactive' && active.stop(),
      MAX_RECORDING_SECONDS * 1000,
    );
  }, [release]);

  const listen = useCallback(
    (Recognition: new () => BrowserRecognition) => {
      const active = new Recognition();
      // One phrase per press, final result only: push-to-talk, the same shape
      // as the recorder path, so the panels cannot tell the two apart.
      active.lang = 'en-US';
      active.interimResults = false;
      active.continuous = false;
      active.maxAlternatives = 1;

      // Browsers fire `end` after `error`, and by then the recorder may already
      // be taking over; without this the late `end` would flip the status back
      // to idle underneath it.
      let handedOver = false;
      // Whether the person has been given an answer, a transcript or a reason.
      // A recogniser can also end having done neither (a tap and release before
      // speaking, or Safari simply closing), and an unexplained return to idle
      // reads as the button doing nothing.
      let answered = false;

      active.onresult = (event) => {
        if (!alive.current) return;
        const transcript = Array.from(event.results, (phrase) => phrase[0].transcript)
          .join(' ')
          .trim();
        if (!transcript) return;
        answered = true;
        heard.current(transcript);
      };

      active.onerror = (event) => {
        if (!alive.current) return;
        // Every error but `aborted` is told to the person below, so the `end`
        // that follows must not add a second, vaguer message on top.
        if (event.error !== 'aborted') answered = true;
        switch (event.error) {
          // The browser has a recogniser but cannot use it here: Safari with
          // dictation off, no capture device for it, or (`network`,
          // `language-not-supported`) a service it cannot reach or a language
          // it does not have. Each fails again on every press, which would
          // leave the person stuck on an engine that never works, while
          // recording needs none of them. So switch for good and take the same
          // press over rather than make them repeat it.
          case 'service-not-allowed':
          case 'audio-capture':
          case 'network':
          case 'language-not-supported':
            handedOver = true;
            // Let go of it now: `end` may never come, and a stale entry here
            // would make the guard in `start` refuse every press from now on.
            recognition.current = null;
            setEngine('recorder');
            setStatus('idle');
            void startRecorder();
            break;
          // Not a fallback: the recorder needs the same microphone permission,
          // so it would be refused for the same reason.
          case 'not-allowed':
            setProblem({ message: NO_PERMISSION, code: null });
            break;
          case 'no-speech':
            setProblem({ message: NO_SPEECH, code: null });
            break;
          // Our own abort() on unmount; nobody is left to tell. If it comes with
          // nothing said, `end` reports that the usual way.
          case 'aborted':
            break;
          default:
            setProblem({
              message: 'Something went wrong with that recording.',
              code: 'upstream_failed',
            });
        }
      };

      active.onend = () => {
        if (recognition.current === active) recognition.current = null;
        if (!alive.current || handedOver) return;
        setStatus('idle');
        if (!answered) setProblem({ message: NO_SPEECH, code: null });
      };

      recognition.current = active;
      try {
        active.start();
      } catch {
        // A recogniser that refuses to start (Safari can throw here instead of
        // firing `error`) never fires `end` either, so nothing would clear the
        // ref and the guard in `start` would refuse every press after this
        // one. Let go of it and take this press over with the recorder, for
        // good, as the unusable-service errors above do.
        recognition.current = null;
        setEngine('recorder');
        void startRecorder();
        return;
      }
      setStatus('recording');
    },
    [startRecorder],
  );

  const start = useCallback(async () => {
    // A second press while the first is still listening would orphan that
    // instance: its handlers would keep firing into state the new one owns,
    // and nothing would hold a reference to stop it with.
    if (recognition.current) return;

    setProblem(null);

    const Recognition = engine === 'browser' ? recognitionConstructor() : null;
    if (Recognition) listen(Recognition);
    else await startRecorder();
  }, [engine, listen, startRecorder]);

  const stop = useCallback(() => {
    recognition.current?.stop();
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  return { status, problem, engine, start, stop };
}
