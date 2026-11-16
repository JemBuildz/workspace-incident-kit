export type HarHeader = {
  name: string;
  value: string;
};

export type HarEntry = {
  method: string;
  url: string;
  status: number | null;
  statusText: string;
  timeMs: number | null;
  startedAt: string;
  headers: HarHeader[];
  timings: Record<string, number | null>;
};

export type RedactionCandidate = {
  id: string;
  entryIndex: number;
  kind: 'header' | 'query';
  label: string;
  value: string;
};

export type Finding = {
  id: string;
  entryIndex: number;
  kind: 'failed' | 'slow';
  title: string;
  detail: string;
};

const SENSITIVE_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token)$/i;
const SENSITIVE_QUERY_NAME = /(token|secret|password|passwd|api[_-]?key|(^|[_-])key($|[_-])|auth|session|signature|(^|[_-])sig($|[_-])|email|e-mail|access[_-]?key|client[_-]?secret)/i;
const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LONG_TOKEN = /^[A-Za-z0-9_+/=-]{40,}$/;
export const SLOW_REQUEST_THRESHOLD_MS = 2_000;

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeHeaders(value: unknown): HarHeader[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((header) => {
    if (!header || typeof header !== 'object') return [];
    const record = header as Record<string, unknown>;
    const name = asString(record.name);
    if (!name) return [];
    const rawValue = record.value;
    return [{ name, value: typeof rawValue === 'string' ? rawValue : String(rawValue ?? '') }];
  });
}

export function parseHarText(text: string): HarEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON. Choose a HAR export and try again.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('The file does not contain a HAR object.');
  }
  const log = (parsed as Record<string, unknown>).log;
  if (!log || typeof log !== 'object' || !Array.isArray((log as Record<string, unknown>).entries)) {
    throw new Error('No HAR request entries were found. Check that this is a complete HAR export.');
  }

  const rawEntries = (log as { entries: unknown[] }).entries;
  if (rawEntries.length === 0) {
    throw new Error('This HAR contains no requests to inspect.');
  }

  return rawEntries.flatMap((rawEntry): HarEntry[] => {
    if (!rawEntry || typeof rawEntry !== 'object') return [];
    const entry = rawEntry as Record<string, unknown>;
    const request = entry.request && typeof entry.request === 'object'
      ? entry.request as Record<string, unknown>
      : {};
    const response = entry.response && typeof entry.response === 'object'
      ? entry.response as Record<string, unknown>
      : {};
    const rawTimings = entry.timings && typeof entry.timings === 'object'
      ? entry.timings as Record<string, unknown>
      : {};
    const timings: Record<string, number | null> = {};
    for (const [key, value] of Object.entries(rawTimings)) {
      timings[key] = asFiniteNumber(value);
    }

    const url = asString(request.url);
    if (!url) return [];

    return [{
      method: asString(request.method, 'GET').toUpperCase(),
      url,
      status: asFiniteNumber(response.status),
      statusText: asString(response.statusText),
      timeMs: asFiniteNumber(entry.time),
      startedAt: asString(entry.startedDateTime),
      headers: normalizeHeaders(request.headers),
      timings,
    }];
  });
}

export function findRedactionCandidates(entries: HarEntry[]): RedactionCandidate[] {
  const candidates: RedactionCandidate[] = [];

  entries.forEach((entry, entryIndex) => {
    entry.headers.forEach((header, headerIndex) => {
      if (SENSITIVE_HEADER.test(header.name) && header.value) {
        candidates.push({
          id: `h:${entryIndex}:${headerIndex}`,
          entryIndex,
          kind: 'header',
          label: header.name,
          value: header.value,
        });
      }
    });

    try {
      const url = new URL(entry.url);
      if (url.username || url.password) {
        candidates.push({
          id: `u:${entryIndex}`,
          entryIndex,
          kind: 'query',
          label: 'URL credentials',
          value: `${url.username}${url.password ? `:${url.password}` : ''}`,
        });
      }
      let paramIndex = 0;
      url.searchParams.forEach((value, key) => {
        if (SENSITIVE_QUERY_NAME.test(key) || EMAIL_VALUE.test(value) || LONG_TOKEN.test(value)) {
          candidates.push({
            id: `q:${entryIndex}:${paramIndex}`,
            entryIndex,
            kind: 'query',
            label: `?${key}`,
            value,
          });
        }
        paramIndex += 1;
      });
    } catch {
      // Invalid URLs remain visible as evidence but are not guessed at for redaction.
    }
  });

  return candidates;
}

export function formatSafeUrl(
  rawUrl: string,
  entryIndex: number,
  redactedIds: ReadonlySet<string>,
): string {
  try {
    const url = new URL(rawUrl);
    if (redactedIds.has(`u:${entryIndex}`)) {
      url.username = '';
      url.password = '';
    }

    const pairs = Array.from(url.searchParams.entries());
    url.search = '';
    pairs.forEach(([key, value], paramIndex) => {
      url.searchParams.append(key, redactedIds.has(`q:${entryIndex}:${paramIndex}`) ? '[REDACTED]' : value);
    });
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function summarizeFindings(entries: HarEntry[]): Finding[] {
  const findings: Finding[] = [];
  entries.forEach((entry, entryIndex) => {
    if (entry.status !== null && entry.status >= 400) {
      findings.push({
        id: `failed:${entryIndex}`,
        entryIndex,
        kind: 'failed',
        title: `HTTP ${entry.status}${entry.statusText ? ` ${entry.statusText}` : ''}`,
        detail: `Request ${entryIndex + 1} returned an HTTP error response. This is an observed status, not a confirmed root cause.`,
      });
    }
    if (entry.timeMs !== null && entry.timeMs >= SLOW_REQUEST_THRESHOLD_MS) {
      findings.push({
        id: `slow:${entryIndex}`,
        entryIndex,
        kind: 'slow',
        title: `Slow request · ${formatDuration(entry.timeMs)}`,
        detail: `Total recorded duration was at least ${SLOW_REQUEST_THRESHOLD_MS.toLocaleString()} ms. Check the timing phases and compare with a healthy capture.`,
      });
    }
  });
  return findings;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return 'Not recorded';
  if (ms < 1_000) return `${Math.round(ms)} ms`;
  return `${(ms / 1_000).toFixed(2)} s`;
}

export function safeHostPath(url: string, entryIndex: number, redactedIds: ReadonlySet<string>): string {
  const safeUrl = formatSafeUrl(url, entryIndex, redactedIds);
  try {
    const parsed = new URL(safeUrl);
    return `${parsed.hostname}${parsed.pathname}${parsed.search}`;
  } catch {
    return safeUrl;
  }
}
