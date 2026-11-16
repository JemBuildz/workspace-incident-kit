import type { Finding, HarEntry } from './har';
import { formatDuration, formatSafeUrl } from './har';

export function createIncidentReport(
  entries: HarEntry[],
  findings: Finding[],
  redactedIds: ReadonlySet<string>,
  generatedAt = new Date(),
): string {
  const failed = entries.filter((entry) => entry.status !== null && entry.status >= 400).length;
  const slow = entries.filter((entry) => entry.timeMs !== null && entry.timeMs >= 2_000).length;
  const lines = [
    '# Workspace incident report',
    '',
    `Generated locally: ${generatedAt.toISOString()}`,
    '',
    '> This report contains request metadata only. Request and response bodies and captured headers are never included. Review every URL before sharing; redaction detection is best-effort.',
    '',
    '## Capture summary',
    '',
    `- Requests inspected: ${entries.length}`,
    `- HTTP error responses (4xx/5xx): ${failed}`,
    `- Requests at or above 2,000 ms: ${slow}`,
    '',
    '## Findings',
    '',
  ];

  if (findings.length === 0) {
    lines.push('No failed or slow requests matched the current checks. This does not prove the capture is error-free.');
  } else {
    findings.forEach((finding) => {
      const entry = entries[finding.entryIndex];
      const safeUrl = entry ? formatSafeUrl(entry.url, finding.entryIndex, redactedIds) : 'Request unavailable';
      lines.push(`- **${finding.title}** — request ${finding.entryIndex + 1}: \`${entry?.method ?? 'Request'} ${safeUrl}\`. ${finding.detail}`);
    });
  }

  lines.push('', '## Request evidence', '');
  entries.forEach((entry, index) => {
    const status = entry.status === null ? 'Status not recorded' : `HTTP ${entry.status}${entry.statusText ? ` ${entry.statusText}` : ''}`;
    const safeUrl = formatSafeUrl(entry.url, index, redactedIds);
    lines.push(`${index + 1}. \`${entry.method} ${safeUrl}\` — ${status}; duration: ${formatDuration(entry.timeMs)}.`);
  });

  lines.push(
    '',
    '## Review before sharing',
    '',
    'Findings are deterministic indicators based on this capture, not proof of root cause. Check the surrounding system state and compare against a known-good capture. Redaction rules may miss sensitive values in paths, unusual parameter names, or unrecognized formats. This tool is independent and is not affiliated with Google.',
    '',
  );

  return lines.join('\n');
}
