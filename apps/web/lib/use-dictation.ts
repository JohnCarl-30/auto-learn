'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AUDIO_MEDIA_TYPES,
  MAX_RECORDING_SECONDS,
  RECORDING_BITS_PER_SECOND,
  type ApiErrorCode,
} from '@auto-learn/shared';
import { ApiFailure, dictate } from './api';

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

  const recorder = useRef<MediaRecorder | null>(null);
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
    };
  }, [release]);

  const start = useCallback(async () => {
    setProblem(null);

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

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  return { status, problem, start, stop };
}
