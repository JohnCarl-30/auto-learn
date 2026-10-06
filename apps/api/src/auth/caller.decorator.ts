import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Caller } from '@auto-learn/shared';
import type { RequestWithCaller } from './caller.guard';

/**
 * The verified caller, for handlers behind `CallerGuard`.
 *
 * A decorator rather than reaching into the request, so a handler cannot read
 * `request.caller` on a route that forgot its guard and find `undefined` typed
 * as a `Caller`. This throws instead of lying about it.
 */
export const CurrentCaller = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Caller => {
    const request = context.switchToHttp().getRequest<RequestWithCaller>();

    if (!request.caller) {
      throw new Error(
        'CurrentCaller used on a route with no CallerGuard — nobody has been verified.',
      );
    }

    return request.caller;
  },
);
