/** SDK ApiError has status plus the JSON response body in message; fetch supplies that body directly. */
export function classifyQuotaError(value: unknown): 'RATE_LIMITED' | 'DAILY_EXHAUSTED' | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as { status?: number; message?: string; error?: unknown };
  let body: unknown = input.error;
  if (!body && typeof input.message === 'string' && input.message.length <= 65536) {
    try { body = JSON.parse(input.message); } catch { body = { message: input.message }; }
  }
  if (body && typeof body === 'object' && 'error' in body) body = (body as { error: unknown }).error;
  const error = body && typeof body === 'object' ? body as { code?: number; message?: string; details?: unknown[] } : {};
  if ((input.status ?? error.code) !== 429) return null;
  // Daily evidence takes priority over RetryInfo, which can accompany a daily violation.
  const details = Array.isArray(error.details) ? JSON.stringify(error.details).slice(0, 65536) : '';
  if (/per[\s_-]*day|daily|requests?\s+per\s+day/i.test(`${error.message ?? ''} ${details}`)) return 'DAILY_EXHAUSTED';
  return 'RATE_LIMITED'; // Per-minute, short retry delays and unknown 429s are transient.
}
