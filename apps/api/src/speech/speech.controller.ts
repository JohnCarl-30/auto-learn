import { Controller, Get, Param, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { SpeakWord, type SpeakResponse } from '@auto-learn/shared';
import { RATE_LIMITS } from '../common/rate-limit';
import { ZodBody } from '../common/zod.pipe';
import { SpeechService } from './speech.service';

@Controller('speak')
export class SpeechController {
  constructor(private readonly service: SpeechService) {}

  /**
   * A GET, because saying a word is a pure read of something keyed entirely by
   * that word — no session, no side effects, the same answer for everybody.
   *
   * That is worth more than it looks: it lets the browser keep the audio across
   * page loads and sessions for free, which is the whole reason there is no
   * client-side audio store to build and keep migrated.
   *
   * The header is set here rather than declared with `@Header`, and that
   * difference matters. Declared, it is attached to every response including
   * the failures — and an explicit `max-age` makes even a 502 cacheable, so a
   * single bad minute at the provider would leave that word silent for a day in
   * every browser that asked during it. Set after the call returns, only
   * answers worth keeping are kept.
   */
  @Throttle({ default: RATE_LIMITS.speak })
  @Get(':word')
  async speak(
    @Param('word', new ZodBody(SpeakWord)) word: SpeakWord,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SpeakResponse> {
    const spoken = await this.service.speak(word);
    response.setHeader('Cache-Control', 'public, max-age=86400');
    return spoken;
  }
}
