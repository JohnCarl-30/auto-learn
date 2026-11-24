/**
 * What the services share for failing and for logging. A service throws an
 * `HttpException`; `create-app.ts` turns it into that status and body.
 */

export const HttpStatus = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  BAD_GATEWAY: 502,
} as const;

export class HttpException extends Error {
  constructor(
    private readonly body: string | object,
    private readonly status: number,
  ) {
    super(typeof body === 'string' ? body : JSON.stringify(body));
  }

  getStatus(): number {
    return this.status;
  }

  getResponse(): string | object {
    return this.body;
  }
}

/** The body the API has always sent for a 401, so anything reading `message` still finds it. */
export class UnauthorizedException extends HttpException {
  constructor(message: string) {
    super({ message, error: 'Unauthorized', statusCode: 401 }, 401);
    this.message = message;
  }
}

export class Logger {
  constructor(private readonly context: string) {}

  log(message: string, ...rest: unknown[]): void {
    console.log(`[${this.context}] ${message}`, ...rest);
  }

  warn(message: string, ...rest: unknown[]): void {
    console.warn(`[${this.context}] ${message}`, ...rest);
  }

  error(message: string, ...rest: unknown[]): void {
    console.error(`[${this.context}] ${message}`, ...rest);
  }
}
