jest.mock('./api', () => ({
  ...jest.requireActual('./api'),
  dictate: jest.fn(),
}));

import { act, renderHook, waitFor } from '@testing-library/react';
import { MAX_RECORDING_SECONDS } from '@auto-learn/shared';
import { ApiFailure, dictate } from './api';
import { useDictation } from './use-dictation';

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

beforeEach(() => {
  recorders = [];
  tracks.length = 0;
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
});
