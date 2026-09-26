export type GreenApiErrorKind =
  | 'unauthorized'
  | 'instanceNotFound'
  | 'instanceUnavailable'
  | 'accountSuspended'
  | 'webhookUrlConfigured'
  | 'invalidRequest'
  | 'rateLimited'
  | 'quotaExceeded'
  | 'phoneCheckLimit'
  | 'server'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'invalidResponse';

export class GreenApiError extends Error {
  readonly kind: GreenApiErrorKind;
  readonly status: number | null;
  /** Response text or validation summary, for development logs only. */
  readonly details: string | null;

  constructor(
    method: string,
    kind: GreenApiErrorKind,
    { status = null, details = null }: { status?: number | null; details?: string | null } = {},
  ) {
    super(`${method} failed: ${kind}${status === null ? '' : ` (HTTP ${status})`}`);
    this.name = 'GreenApiError';
    this.kind = kind;
    this.status = status;
    this.details = details;
  }
}

export function classifyHttpError(status: number, responseText: string): GreenApiErrorKind {
  const text = responseText.toLowerCase();

  if (status === 400) {
    if (text.includes('webhook url')) return 'webhookUrlConfigured';
    if (/not authorized|starting|expired|deleted/.test(text)) return 'instanceUnavailable';
    // CheckAccount: "check phone number timeout limit exceeded" is a temporary server-side failure.
    if (text.includes('timeout')) return 'server';
    return 'invalidRequest';
  }
  if (status === 401) return 'unauthorized';
  if (status === 403) return text.includes('suspended') ? 'accountSuspended' : 'instanceNotFound';
  if (status === 404) return 'instanceNotFound';
  if (status === 429) return 'rateLimited';
  if (status === 466) return 'quotaExceeded';
  if (status === 469) return 'phoneCheckLimit';
  if (status >= 500) return 'server';
  return 'invalidResponse';
}
