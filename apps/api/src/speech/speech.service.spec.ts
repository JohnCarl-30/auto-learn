// `ai` and both provider packages are ESM-only; jest's CJS runtime cannot load
// them. `@ai-sdk/openai` is here because llm/models.ts imports it too — the
// text calls and the voice calls share that file.
jest.mock('ai', () => ({ generateSpeech: jest.fn() }));
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }));
jest.mock('@ai-sdk/elevenlabs', () => ({
  elevenLabs: { speech: jest.fn(), transcription: jest.fn() },
}));

import { HttpException } from '@nestjs/common';
import { generateSpeech } from 'ai';
import type { ApiError } from '@auto-learn/shared';
import { SpeechService } from './speech.service';

const speak = generateSpeech as unknown as jest.Mock;

const audio = (base64: string) => ({
  audio: { base64, mediaType: 'audio/mpeg' },
});

const errorOf = async (fn: () => Promise<unknown>): Promise<ApiError> => {
  try {
    await fn();
    throw new Error('expected a rejection');
  } catch (error) {
    return (error as HttpException).getResponse() as ApiError;
  }
};

beforeEach(() => {
  process.env.ELEVENLABS_VOICE_ID = 'voice-one';
  speak.mockReset();
  speak.mockResolvedValue(audio('bGlzdGVu'));
});

describe('SpeechService', () => {
  it('says the word', async () => {
    const result = await new SpeechService().speak('ubiquitous');

    expect(result).toEqual({
      word: 'ubiquitous',
      audio: 'bGlzdGVu',
      mediaType: 'audio/mpeg',
    });
  });

  /**
   * The reason the cache exists. Academic vocabulary repeats heavily across
   * readers, and a word's pronunciation is the same for all of them — so the
   * second person to meet "ubiquitous" should cost nothing.
   */
  it('only pays for a word once', async () => {
    const service = new SpeechService();

    await service.speak('ubiquitous');
    const second = await service.speak('ubiquitous');

    expect(speak).toHaveBeenCalledTimes(1);
    expect(second.audio).toBe('bGlzdGVu');
  });

  it('treats the same word in different cases as the same word', async () => {
    const service = new SpeechService();

    await service.speak('ubiquitous');
    await service.speak('Ubiquitous');

    expect(speak).toHaveBeenCalledTimes(1);
  });

  /**
   * Voice belongs in the cache key, not just the word. Without it, changing
   * ELEVENLABS_VOICE_ID in a deploy would keep serving the previous voice for
   * a week — long enough that nobody would connect the two.
   */
  it('does not serve the old voice after the voice changes', async () => {
    const service = new SpeechService();
    await service.speak('ubiquitous');

    process.env.ELEVENLABS_VOICE_ID = 'voice-two';
    speak.mockResolvedValue(audio('c3BlYWs='));
    const after = await service.speak('ubiquitous');

    expect(speak).toHaveBeenCalledTimes(2);
    expect(after.audio).toBe('c3BlYWs=');
  });

  it('reports a provider failure as an upstream failure, not a bad request', async () => {
    speak.mockRejectedValue(new Error('elevenlabs is down'));

    const error = await errorOf(() => new SpeechService().speak('ubiquitous'));

    expect(error.code).toBe('upstream_failed');
  });

  it('does not cache a failure', async () => {
    const service = new SpeechService();
    speak.mockRejectedValueOnce(new Error('transient'));

    await errorOf(() => service.speak('ubiquitous'));
    const recovered = await service.speak('ubiquitous');

    expect(recovered.audio).toBe('bGlzdGVu');
  });

  /**
   * Without a voice id there is nothing to ask the provider for. Failing here
   * rather than sending an empty voice keeps a configuration mistake out of
   * the provider's error messages, where it reads as their fault.
   */
  it('refuses before calling out when no voice is configured', async () => {
    delete process.env.ELEVENLABS_VOICE_ID;

    const error = await errorOf(() => new SpeechService().speak('ubiquitous'));

    expect(error.code).toBe('upstream_failed');
    expect(speak).not.toHaveBeenCalled();
  });
});
