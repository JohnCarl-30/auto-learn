import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { generateSpeech } from 'ai';
import { LRUCache } from 'lru-cache';
import type { ApiError, SpeakResponse } from '@auto-learn/shared';
import { TelemetryService } from '../telemetry/telemetry.service';
import {
  SPEECH_MODEL,
  speechModel,
  speechProviderOptions,
  speechVoice,
} from '../llm/models';

@Injectable()
export class SpeechService {
  private readonly logger = new Logger(SpeechService.name);

  constructor(private readonly telemetry: TelemetryService) {}

  /**
   * Sized in bytes rather than entries.
   *
   * The other caches in this app hold small objects, where a count is a fine
   * proxy for memory. Audio breaks that assumption — a few thousand clips is
   * tens of megabytes, and the number that matters is the total, not the
   * tally. Seven days rather than the usual twenty-four hours because a word's
   * pronunciation does not go stale, and amortising a paid call across every
   * learner who meets that word is the entire point of caching it.
   */
  private readonly cache = new LRUCache<string, SpeakResponse>({
    maxSize: 32 * 1024 * 1024,
    sizeCalculation: (value) => value.audio.length,
    ttl: 7 * 24 * 60 * 60 * 1000,
  });

  /**
   * Says one word.
   *
   * Deliberately knows nothing about sessions, sentences or cards. That is what
   * lets the response be cached by the browser and shared across every reader —
   * and it is why the route can be a plain GET.
   *
   * Known limitation: homographs. "lead", "read" and "record" have two
   * pronunciations apiece and this serves the dominant one. Fixing it means
   * keying on part of speech, which fragments the cache and drags a session id
   * into a route that is currently stateless. Worth noting that the free
   * dictionary recordings have exactly the same limitation, so this is the
   * state of the feature rather than something synthesis introduced.
   */
  async speak(word: string): Promise<SpeakResponse> {
    // Before anything can fail or hit the cache: this counts the asking, which
    // is what says whether the button is worth its paid call at all.
    this.telemetry.pronunciation();

    const voice = speechVoice();
    if (!voice) {
      this.logger.error('ELEVENLABS_VOICE_ID is not set; cannot synthesise.');
      throw this.fail(
        'upstream_failed',
        "I can't say words out loud right now.",
      );
    }

    // Model and voice belong in the key, not just the word: changing either in
    // a deploy would otherwise keep serving the previous voice for a week.
    const key = `${SPEECH_MODEL}:${voice}:${word.toLowerCase()}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    try {
      const result = await generateSpeech({
        model: speechModel(),
        text: word,
        voice,
        providerOptions: speechProviderOptions,
        // The reader is watching a button. The SDK default of two retries
        // triples the worst case on a path where a spinner that never resolves
        // is worse than a failure that does.
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(10_000),
      });

      const response: SpeakResponse = {
        word,
        audio: result.audio.base64,
        mediaType: result.audio.mediaType,
      };

      // Only what was really synthesised. A cache hit above costs nothing,
      // and counting it here would price the cache out of its own saving.
      this.telemetry.spoke(word.length);
      this.cache.set(key, response);
      return response;
    } catch (error) {
      this.logger.warn(`speech failed for "${word}"`, error);
      throw this.fail(
        'upstream_failed',
        "I couldn't say that one out loud just now.",
      );
    }
  }

  private fail(code: ApiError['code'], message: string): HttpException {
    const status =
      code === 'upstream_failed'
        ? HttpStatus.BAD_GATEWAY
        : HttpStatus.BAD_REQUEST;
    return new HttpException({ code, message } satisfies ApiError, status);
  }
}
