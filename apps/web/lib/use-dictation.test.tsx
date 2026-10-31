jest.mock('./api', () => ({
  ...jest.requireActual('./api'),
  dictate: jest.fn(),
}));

import { act, renderHook, waitFor } from '@testing-library/react';
import { MAX_RECORDING_SECONDS } from '@auto-learn/shared';
import { ApiFailure, dictate } from './api';
import { useDictation } from './use-dictation';
import type { BrowserRecognitionEvent } from './speech-recognition';

const transcribes = dictate as jest.Mock;

/**
 * jsdom implements none of this — no getUserMedia, no MediaRecorder — so the
 * stubs below are the environment. They are deliberately small: what is being
 * tested is the hook's sequencing and cleanup, not the browser's.
 */
const tracks: Array<{ stop: jest.Mock }> = [];
let recorders: FakeRecorder[] = [];

class FakeRecorder {
  static isTypeSupported = () => true;
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(
    readonly stream: { getTracks: () => Array<{ stop: jest.Mock }> },
    readonly options?: { audioBitsPerSecond?: number; mimeType?: string },
  ) {
    recorders.push(this);
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

const grantMicrophone = (granted = true) => {
  const track = { stop: jest.fn() };
  tracks.push(track);

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: granted
        ? jest.fn().mockResolvedValue({ getTracks: () => [track] })
        : jest.fn().mockRejectedValue(new Error('NotAllowedError')),
    },
  });
};

/**
 * The browser's own recogniser, faked. It records what the hook asked of it and
 * leaves the firing of results and errors to the test, because those are the
 * browser's moves, not the hook's.
 */
let recognisers: FakeRecognition[] = [];

class FakeRecognition {
  lang = '';
  interimResults = true;
  continuous = true;
  maxAlternatives = 0;
  started = false;
  stopped = false;
  aborted = false;
  onresult: ((event: BrowserRecognitionEvent) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    recognisers.push(this);
  }

  start() {
    this.started = true;
  }

  stop() {
    this.stopped = true;
  }

  abort() {
    this.aborted = true;
  }

  say(transcript: string) {
    this.onresult?.({ results: [[{ transcript }]] });
  }
}

const withBrowserRecogniser = () =>
  Object.defineProperty(window, 'webkitSpeechRecognition', {
    configurable: true,
    writable: true,
    value: FakeRecognition,
  });

beforeEach(() => {
  recorders = [];
  recognisers = [];
  tracks.length = 0;
  // jsdom has none, but a test above may have added one: the recorder tests
  // are about the path taken where the browser cannot listen for itself.
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  transcribes.mockReset();
  transcribes.mockResolvedValue({ transcript: 'The evidence was substantial.' });
  Object.defineProperty(window, 'MediaRecorder', {
    configurable: true,
    writable: true,
    value: FakeRecorder,
  });
  grantMicrophone();
});

describe('useDictation', () => {
  it('hands over what was said', async () => {
    const heard = jest.fn();
    const { result } = renderHook(() => useDictation(heard));

    await act(() => result.current.start());
    expect(result.current.status).toBe('recording');

    act(() => result.current.stop());

    await waitFor(() => expect(heard).toHaveBeenCalledWith(
      'The evidence was substantial.',
    ));
    await waitFor(() => expect(result.current.status).toBe('idle'));
  });

  /**
   * Chrome picks roughly twice this by default for Opus, which would double
   * every upload without making a single word easier to make out.
   */
  it('asks for speech-sized audio rather than the browser default', async () => {
    const { result } = renderHook(() => useDictation(jest.fn()));

    await act(() => result.current.start());

    expect(recorders[0].options?.audioBitsPerSecond).toBe(24_000);
  });

  /**
   * A refused microphone never reaches the server, so it is a local message
   * rather than an ApiErrorCode — the API cannot cause it and cannot see it.
   */
  it('explains a refused microphone without sending anything', async () => {
    grantMicrophone(false);
    const { result } = renderHook(() => useDictation(jest.fn()));

    await act(() => result.current.start());

    expect(result.current.problem?.message).toContain('permission');
    expect(result.current.problem?.code).toBeNull();
    expect(result.current.status).toBe('idle');
    expect(transcribes).not.toHaveBeenCalled();
  });

  it('stops itself at the cap rather than recording forever', async () => {
    jest.useFakeTimers();
    try {
      const heard = jest.fn();
      const { result } = renderHook(() => useDictation(heard));

      await act(() => result.current.start());
      expect(recorders[0].state).toBe('recording');

      await act(async () => {
        jest.advanceTimersByTime(MAX_RECORDING_SECONDS * 1000);
        await Promise.resolve();
      });

      expect(recorders[0].state).toBe('inactive');
      expect(heard).toHaveBeenCalledWith('The evidence was substantial.');
    } finally {
      jest.useRealTimers();
    }
  });

  /**
   * A microphone left open is a recording light that will not switch off, and
   * people rightly read that as the app listening to them.
   */
  it('releases the microphone once it has finished', async () => {
    const { result } = renderHook(() => useDictation(jest.fn()));

    await act(() => result.current.start());
    act(() => result.current.stop());

    await waitFor(() => expect(tracks[0].stop).toHaveBeenCalled());
  });

  it('releases it on unmount too, even mid-recording', async () => {
    const { result, unmount } = renderHook(() => useDictation(jest.fn()));

    await act(() => result.current.start());
    unmount();

    expect(tracks[0].stop).toHaveBeenCalled();
  });

  /**
   * A browser ends the recorder when its tracks end, so unmounting mid-recording
   * lands in `onstop` with a real recording in hand. Sending it would spend a
   * transcription on an answer that has nowhere to go — and the panel is gone,
   * so the reader is not waiting for it either.
   */
  it('does not spend a transcription nobody will see', async () => {
    const { result, unmount } = renderHook(() => useDictation(jest.fn()));

    await act(() => result.current.start());
    unmount();

    // What the browser does once every track has stopped.
    act(() => recorders[0].stop());

    expect(transcribes).not.toHaveBeenCalled();
  });

  it('repeats the server refusal rather than inventing its own', async () => {
    transcribes.mockRejectedValue(
      new ApiFailure({
        code: 'no_speech_detected',
        message: "I didn't hear anything in that recording.",
      }),
    );

    const heard = jest.fn();
    const { result } = renderHook(() => useDictation(heard));

    await act(() => result.current.start());
    act(() => result.current.stop());

    await waitFor(() =>
      expect(result.current.problem).toEqual({
        message: "I didn't hear anything in that recording.",
        code: 'no_speech_detected',
      }),
    );
    expect(heard).not.toHaveBeenCalled();
  });

  describe('where the browser can recognise speech itself', () => {
    beforeEach(withBrowserRecogniser);

    it('uses the browser recogniser when there is one and never calls /dictate', async () => {
      const heard = jest.fn();
      const { result } = renderHook(() => useDictation(heard));

      await act(() => result.current.start());
      expect(result.current.engine).toBe('browser');
      expect(result.current.status).toBe('recording');
      expect(recognisers[0]).toMatchObject({
        started: true,
        lang: 'en-US',
        interimResults: false,
        continuous: false,
        maxAlternatives: 1,
      });

      act(() => recognisers[0].say('I went yesterday'));
      act(() => recognisers[0].onend?.());

      expect(heard).toHaveBeenCalledWith('I went yesterday');
      expect(result.current.status).toBe('idle');
      expect(result.current.problem).toBeNull();
      // `dictate` is the only door to /dictate, and it is mocked above, so this
      // is the assertion that proves the server was not used. No recorder was
      // built either, so nothing was captured to upload.
      expect(transcribes).not.toHaveBeenCalled();
      expect(recorders).toHaveLength(0);
    });

    it('ignores a second press while the first is still listening', async () => {
      const { result } = renderHook(() => useDictation(jest.fn()));

      await act(() => result.current.start());
      await act(() => result.current.start());

      expect(recognisers).toHaveLength(1);
    });

    it('listens again on the next press rather than reusing a finished recogniser', async () => {
      const { result } = renderHook(() => useDictation(jest.fn()));

      await act(() => result.current.start());
      act(() => recognisers[0].onend?.());
      await act(() => result.current.start());

      expect(recognisers).toHaveLength(2);
    });

    it('stops the recogniser when asked to', async () => {
      const { result } = renderHook(() => useDictation(jest.fn()));

      await act(() => result.current.start());
      act(() => result.current.stop());

      expect(recognisers[0].stopped).toBe(true);
    });

    it('switches to recording when the browser service is not allowed', async () => {
      const { result } = renderHook(() => useDictation(jest.fn()));

      await act(() => result.current.start());
      await act(async () => recognisers[0].onerror?.({ error: 'service-not-allowed' }));
      act(() => recognisers[0].onend?.());

      expect(result.current.engine).toBe('recorder');
      await waitFor(() => expect(recorders[0]?.state).toBe('recording'));
      expect(result.current.status).toBe('recording');

      // For the rest of the hook's life: the next press goes straight to the
      // recorder instead of trying the engine that just said no.
      act(() => result.current.stop());
      await waitFor(() => expect(result.current.status).toBe('idle'));
      await act(() => result.current.start());
      expect(recognisers).toHaveLength(1);
      expect(recorders).toHaveLength(2);
    });

    /**
     * Each of these fails again on every press, so staying on the browser
     * engine would leave the person with a button that never works.
     */
    it.each(['audio-capture', 'network', 'language-not-supported'])(
      'switches to recording on %s too',
      async (error) => {
        const { result } = renderHook(() => useDictation(jest.fn()));

        await act(() => result.current.start());
        await act(async () => recognisers[0].onerror?.({ error }));

        expect(result.current.engine).toBe('recorder');
        await waitFor(() => expect(recorders[0]?.state).toBe('recording'));
        expect(result.current.problem).toBeNull();
      },
    );

    /**
     * `start()` throwing fires no `end`, so a ref left pointing at the dead
     * recogniser would make every later press do nothing until a remount.
     */
    it('records instead when the recogniser throws on start', async () => {
      const { result } = renderHook(() => useDictation(jest.fn()));
      const start = jest
        .spyOn(FakeRecognition.prototype, 'start')
        .mockImplementation(() => {
          throw new Error('InvalidStateError');
        });

      try {
        await act(() => result.current.start());

        expect(result.current.engine).toBe('recorder');
        await waitFor(() => expect(recorders[0]?.state).toBe('recording'));
        expect(result.current.status).toBe('recording');

        // The mic is not dead: the next press records again.
        act(() => result.current.stop());
        await waitFor(() => expect(result.current.status).toBe('idle'));
        await act(() => result.current.start());
        expect(recorders).toHaveLength(2);
      } finally {
        start.mockRestore();
      }
    });

    it('can press again after a fallback even if the browser never says it ended', async () => {
      const { result } = renderHook(() => useDictation(jest.fn()));

      await act(() => result.current.start());
      await act(async () => recognisers[0].onerror?.({ error: 'network' }));
      await waitFor(() => expect(recorders[0]?.state).toBe('recording'));
      act(() => result.current.stop());
      await waitFor(() => expect(result.current.status).toBe('idle'));

      await act(() => result.current.start());

      expect(recorders).toHaveLength(2);
    });

    it('ignores an abort rather than reporting it as a failure', async () => {
      const { result } = renderHook(() => useDictation(jest.fn()));

      await act(() => result.current.start());
      act(() => recognisers[0].onerror?.({ error: 'aborted' }));

      expect(result.current.problem).toBeNull();
      expect(result.current.engine).toBe('browser');
      expect(recorders).toHaveLength(0);
    });

    it('says something went wrong for an error it does not know', async () => {
      const { result } = renderHook(() => useDictation(jest.fn()));

      await act(() => result.current.start());
      act(() => recognisers[0].onerror?.({ error: 'bad-grammar' }));
      act(() => recognisers[0].onend?.());

      // Told once, by the error, not again by the `end` that follows it.
      expect(result.current.problem).toEqual({
        message: 'Something went wrong with that recording.',
        code: 'upstream_failed',
      });
      expect(result.current.engine).toBe('browser');
    });

    it('shows the permission message and does not fall back when the mic is refused', async () => {
      const { result } = renderHook(() => useDictation(jest.fn()));

      await act(() => result.current.start());
      act(() => recognisers[0].onerror?.({ error: 'not-allowed' }));
      act(() => recognisers[0].onend?.());

      expect(result.current.problem?.message).toContain('permission');
      expect(result.current.problem?.code).toBeNull();
      expect(result.current.engine).toBe('browser');
      expect(result.current.status).toBe('idle');
      expect(recorders).toHaveLength(0);
    });

    it('says so when nothing was heard', async () => {
      const { result } = renderHook(() => useDictation(jest.fn()));

      await act(() => result.current.start());
      act(() => recognisers[0].onerror?.({ error: 'no-speech' }));

      expect(result.current.problem).toEqual({
        message: "I didn't hear anything. Try again.",
        code: null,
      });
      expect(result.current.engine).toBe('browser');
    });

    /**
     * Tap and release before speaking, or a browser that just closes: `end`
     * arrives with no result and no error. Silence there looks like a button
     * that does nothing.
     */
    it('says so when the recogniser ends without a result or an error', async () => {
      const heard = jest.fn();
      const { result } = renderHook(() => useDictation(heard));

      await act(() => result.current.start());
      act(() => result.current.stop());
      act(() => recognisers[0].onend?.());

      expect(result.current.problem).toEqual({
        message: "I didn't hear anything. Try again.",
        code: null,
      });
      expect(result.current.status).toBe('idle');
      expect(heard).not.toHaveBeenCalled();
    });

    it('does not pile "nothing heard" on top of an error it already explained', async () => {
      const { result } = renderHook(() => useDictation(jest.fn()));

      await act(() => result.current.start());
      act(() => recognisers[0].onerror?.({ error: 'not-allowed' }));
      act(() => recognisers[0].onend?.());

      expect(result.current.problem?.message).toContain('permission');
    });

    it('lets go of the recogniser on unmount, mid-sentence', async () => {
      const heard = jest.fn();
      const { result, unmount } = renderHook(() => useDictation(heard));

      await act(() => result.current.start());
      unmount();
      recognisers[0].say('too late');

      expect(recognisers[0].aborted).toBe(true);
      expect(heard).not.toHaveBeenCalled();
    });
  });

  it('records when the browser has no recogniser', async () => {
    const { result } = renderHook(() => useDictation(jest.fn()));

    expect(result.current.engine).toBe('recorder');
    await act(() => result.current.start());

    expect(recorders[0].state).toBe('recording');
  });
});
