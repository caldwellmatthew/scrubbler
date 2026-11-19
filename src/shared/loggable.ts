import { isAxiosError } from 'axios';

/**
 * Reduce an error to something safe to log. An axios error carries its whole
 * request, auth headers and form body included, so it is summarized as the
 * request line and the response; any other error is returned unchanged.
 */
export function loggable(err: unknown): unknown {
  if (!isAxiosError(err)) return err;

  const method = err.config?.method?.toUpperCase() ?? 'request';
  // Query strings can carry keys and signatures, so only the path is kept
  const url = (err.config?.url ?? '').split('?')[0];
  const target = `${method} ${url}`.trim();

  if (err.response) {
    const body = err.response.data;
    const detail = typeof body === 'string' ? body : JSON.stringify(body);
    return `${target} failed with ${err.response.status}${detail ? `: ${detail}` : ''}`;
  }

  // No response: a network failure, whose message can be empty (e.g. an AggregateError)
  const inner = (err.cause as { errors?: unknown } | undefined)?.errors;
  const causes = Array.isArray(inner)
    ? inner.map((e: unknown) => (e instanceof Error ? e.message : String(e)))
    : [];
  const reason = [err.code, err.message, ...causes].filter(Boolean).join(' — ');
  return `${target} failed without a response: ${reason || 'unknown error'}`;
}
