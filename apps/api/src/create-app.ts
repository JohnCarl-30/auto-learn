import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { authRoutes } from './auth/auth.routes';
import { cardRoutes } from './card/card.routes';
import { CardService } from './card/card.service';
import { HttpException, Logger } from './common/http';
import { converseRoutes } from './converse/converse.routes';
import { ConverseService } from './converse/converse.service';
import { dictateRoutes } from './dictate/dictate.routes';
import { DictateService } from './dictate/dictate.service';
import { DictionaryService } from './dictionary/dictionary.service';
import { healthRoutes } from './health/health.routes';
import { lessonRoutes } from './lesson/lesson.routes';
import { LessonService } from './lesson/lesson.service';
import { proposeRoutes } from './propose/propose.routes';
import { ProposeService } from './propose/propose.service';
import { createSessionStore } from './session/create-session-store';
import { speechRoutes } from './speech/speech.routes';
import { SpeechService } from './speech/speech.service';
import { telemetryRoutes } from './telemetry/telemetry.routes';
import { TelemetryService } from './telemetry/telemetry.service';

const logger = new Logger('App');

/**
 * The whole API, wired by hand. One instance of each service, shared the way
 * Nest's container shared them: the speaking partner and the daily lesson
 * review with the same ProposeService a paste does, and every route reports
 * to the same telemetry.
 */
export function createApp() {
  const telemetry = new TelemetryService();
  const sessions = createSessionStore();
  const dictionary = new DictionaryService();
  const propose = new ProposeService(sessions, telemetry);
  const converse = new ConverseService(propose, telemetry, dictionary);

  return (
    new Hono()
      .use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' }))
      // Express's JSON default, kept: a single request's cost stays bounded.
      // /dictate sets its own, larger limit for its multipart upload.
      .use(async (c, next) =>
        c.req.path.startsWith('/dictate')
          ? next()
          : bodyLimit({ maxSize: 100 * 1024 })(c, next),
      )
      .route('/health', healthRoutes)
      .route('/telemetry', telemetryRoutes(telemetry))
      .route('/me', authRoutes)
      .route('/propose', proposeRoutes(propose))
      .route(
        '/card',
        cardRoutes(new CardService(sessions, dictionary, telemetry)),
      )
      .route('/speak', speechRoutes(new SpeechService(telemetry)))
      .route('/dictate', dictateRoutes(new DictateService(telemetry)))
      .route('/converse', converseRoutes(converse))
      .route(
        '/lesson',
        lessonRoutes(
          new LessonService(propose, converse, telemetry, dictionary),
        ),
      )
      .onError((error, c) => {
        if (error instanceof HttpException) {
          const body = error.getResponse();
          const status = error.getStatus() as ContentfulStatusCode;
          return typeof body === 'string'
            ? c.json({ statusCode: status, message: body }, status)
            : c.json(body, status);
        }
        logger.error(`unhandled: ${error.message}`, error.stack);
        return c.json(
          { statusCode: 500, message: 'Internal server error' },
          500,
        );
      })
  );
}
