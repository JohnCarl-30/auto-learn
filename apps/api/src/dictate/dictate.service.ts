import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { transcribe } from 'ai';
import type { ApiError, DictateResponse } from '@auto-learn/shared';
import { transcribeModel, transcribeProviderOptions } from '../llm/models';
import { TelemetryService } from '../telemetry/telemetry.service';

@Injectable()
export class DictateService {
  private readonly logger = new Logger(DictateService.name);

  constructor(private readonly telemetry: TelemetryService) {}

  /**
   * Turns a recording into text, and stops there.
   *
   * Deliberately does not go on to propose. Transcription of accented English
   * is good rather than perfect, and the reader needs the chance to fix a
   * misheard word before it is spent on a model call — a wrong transcript
   * reviewed as if it were what they said produces corrections to a sentence
   * they never wrote. Stopping here also keeps the transform choice where it
   * belongs, in the buttons underneath.
   */
  async dictate(audio: Uint8Array): Promise<DictateResponse> {
    let text: string;

    try {
      const result = await transcribe({
        model: transcribeModel(),
        audio,
        providerOptions: transcribeProviderOptions,
        abortSignal: AbortSignal.timeout(20_000),
      });
      text = result.text;
    } catch (error) {
      this.logger.warn('transcription failed', error);
      throw this.fail(
        'upstream_failed',
        "I couldn't make out that recording. Try again in a moment.",
      );
    }

    // Outside the catch on purpose: silence is a refusal we mean, and throwing
    // it inside would have it caught and reported as an upstream failure.
    const transcript = text.trim();
    if (!transcript) {
      throw this.fail(
        'no_speech_detected',
        "I didn't hear anything in that recording.",
      );
    }

    this.telemetry.dictation();
    return { transcript };
  }

  private fail(code: ApiError['code'], message: string): HttpException {
    const status =
      code === 'upstream_failed'
        ? HttpStatus.BAD_GATEWAY
        : code === 'no_speech_detected'
          ? HttpStatus.UNPROCESSABLE_ENTITY
          : HttpStatus.BAD_REQUEST;
    return new HttpException({ code, message } satisfies ApiError, status);
  }
}
