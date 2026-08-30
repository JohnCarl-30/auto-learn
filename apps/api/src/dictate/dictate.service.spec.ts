jest.mock('ai', () => ({ transcribe: jest.fn() }));
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }));
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
});
