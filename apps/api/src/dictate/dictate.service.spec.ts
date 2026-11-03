jest.mock('ai', () => ({ transcribe: jest.fn() }));
// `transcribeModel()` falls through to OpenAI when no ElevenLabs key is set, so
// the mock needs `.transcription` as well as being callable.
jest.mock('@ai-sdk/openai', () => ({
  openai: Object.assign(jest.fn(), { transcription: jest.fn() }),
}));
jest.mock('@ai-sdk/elevenlabs', () => ({
  elevenLabs: { speech: jest.fn(), transcription: jest.fn() },
}));

import { transcribe } from 'ai';
import type { ApiError } from '@auto-learn/shared';
import { TelemetryService } from '../telemetry/telemetry.service';
import { DictateService } from './dictate.service';

const listen = transcribe as unknown as jest.Mock;

const errorOf = async (fn: () => Promise<unknown>): Promise<ApiError> => {
  try {
    await fn();
    throw new Error('expected a rejection');
  } catch (error) {
    return (error as { getResponse(): ApiError }).getResponse();
  }
};

beforeEach(() => listen.mockReset());

describe('DictateService', () => {
  const audio = new Uint8Array([1, 2, 3]);

  it('returns the transcript and records what it cost, in seconds', async () => {
    const telemetry = new TelemetryService();
    listen.mockResolvedValue({
      text: '  The evidence was substantial.  ',
      durationInSeconds: 4.25,
    });

    const result = await new DictateService(telemetry).dictate(audio);

    expect(result.transcript).toBe('The evidence was substantial.');
    // Seconds, because that is the unit this route is billed in.
    expect(telemetry.snapshot().secondsTranscribed).toBe(4.3);
    expect(telemetry.snapshot().dictations).toBe(1);
  });

  it('claims nothing when the provider does not report a duration', async () => {
    const telemetry = new TelemetryService();
    listen.mockResolvedValue({ text: 'Something said.' });

    await new DictateService(telemetry).dictate(audio);

    expect(telemetry.snapshot().secondsTranscribed).toBe(0);
    expect(telemetry.snapshot().dictations).toBe(1);
  });

  /**
   * Silence is a refusal we mean, so it is checked outside the catch — a
   * transcript of nothing is not an upstream failure and should not read as
   * one to the person who recorded it.
   */
  it('separates silence from a provider that failed', async () => {
    const telemetry = new TelemetryService();
    listen.mockResolvedValue({ text: '   ', durationInSeconds: 2 });

    const silent = await errorOf(() =>
      new DictateService(telemetry).dictate(audio),
    );
    expect(silent.code).toBe('no_speech_detected');

    listen.mockRejectedValue(new Error('provider down'));
    const failed = await errorOf(() =>
      new DictateService(telemetry).dictate(audio),
    );
    expect(failed.code).toBe('upstream_failed');

    expect(telemetry.snapshot().dictationsFailed).toBe(2);
    expect(telemetry.snapshot().dictations).toBe(0);
  });

  /**
   * A three-minute lesson answer takes longer to transcribe than a one-minute
   * turn, and the old twenty seconds was sized for the turn. One retry, as
   * before: the timeout grew, the number of attempts did not.
   */
  it('gives a long recording time to transcribe, with one retry', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    listen.mockResolvedValue({ text: 'Said.' });

    await new DictateService(new TelemetryService()).dictate(audio);

    expect(timeout).toHaveBeenCalledWith(45_000);
    expect(listen).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 1 }),
    );
    timeout.mockRestore();
  });
});
