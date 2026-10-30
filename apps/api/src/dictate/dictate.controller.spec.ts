// The controller imports the service, which imports these ESM-only packages,
// and jest's CJS runtime cannot load them.
jest.mock('ai', () => ({ transcribe: jest.fn() }));
jest.mock('@ai-sdk/openai', () => ({
  openai: Object.assign(jest.fn(), { transcription: jest.fn() }),
}));
jest.mock('@ai-sdk/elevenlabs', () => ({
  elevenLabs: { speech: jest.fn(), transcription: jest.fn() },
}));

import type { DictateService } from './dictate.service';
import { DictateController } from './dictate.controller';

describe('DictateController', () => {
  /**
   * Safari records audio/mp4, not the audio/webm Chrome does, and the installed
   * iPhone app has no other way to dictate. A unit test that news the
   * controller does not run the interceptor's fileFilter or the guard — this
   * pins what happens after both: the recording reaches the service intact.
   */
  it('accepts an audio/mp4 recording, which is what Safari records', async () => {
    const dictate = jest.fn().mockResolvedValue({ transcript: 'Hello there.' });
    const controller = new DictateController({
      dictate,
    } as unknown as DictateService);
    const file = {
      mimetype: 'audio/mp4',
      buffer: Buffer.from([1, 2, 3]),
    } as Express.Multer.File;

    await expect(controller.dictate(file)).resolves.toEqual({
      transcript: 'Hello there.',
    });
    expect(dictate).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
  });
});
