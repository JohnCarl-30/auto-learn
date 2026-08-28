import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

/**
 * Liveness, for the host's health check.
 *
 * Exempt from rate limiting, and that exemption is the whole reason this exists
 * separately: a platform health check polls every few seconds from a single
 * address, which walks straight into the per-IP limit. The host would then read
 * 429 as "unhealthy" and restart a service that was working perfectly — losing
 * every in-flight review session and resetting the telemetry counters with it.
 *
 * Deliberately says nothing about the model or the key. This answers "is the
 * process up", which is the only question a restart can fix.
 */
@Controller('health')
export class HealthController {
  @SkipThrottle()
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
