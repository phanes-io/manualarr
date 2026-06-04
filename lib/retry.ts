import "server-only";

/** Thrown by callers so withRetry knows an HTTP status is retryable (5xx) or not (4xx). */
export class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry transient failures with exponential backoff. Only network errors and
 * explicitly RetryableError (5xx) are retried; other errors (e.g. 4xx) throw
 * immediately. Used for upstream Lidarr/Navidrome calls that may blip during
 * restarts.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseDelayMs ?? 300;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const retryable = e instanceof RetryableError || e instanceof TypeError; // fetch network errors are TypeError
      if (!retryable || i === attempts - 1) throw e;
      await sleep(base * 2 ** i);
    }
  }
  throw lastErr;
}
