import { Controller, Get, UseGuards } from '@nestjs/common';
import type { Caller } from '@auto-learn/shared';
import { CurrentCaller } from './caller.decorator';
import { CallerGuard } from './caller.guard';

@Controller('me')
export class AuthController {
  /**
   * Who the API thinks is calling.
   *
   * Small on purpose, and not a placeholder: it is the only route that proves
   * the whole chain — session cookie, minted token, verified signature — works
   * end to end, and it is what the client will call to find out whether its
   * token is still good before it tries to sync anything.
   *
   * It returns the id the token asserted rather than anything looked up, because
   * there is nothing to look up: this service has no user table, and that is the
   * design rather than a gap in it.
   */
  @Get()
  @UseGuards(CallerGuard)
  me(@CurrentCaller() caller: Caller): Caller {
    return caller;
  }
}
