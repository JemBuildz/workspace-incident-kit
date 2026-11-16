import { describe, expect, it } from 'vitest';
import sample from '../src/data/sample.har.json';
import { findRedactionCandidates, formatSafeUrl, parseHarText, summarizeFindings } from '../src/lib/har';
import { createIncidentReport } from '../src/lib/report';

const sampleText = JSON.stringify(sample);

describe('HAR inspection', () => {
  it('parses request metadata without depending on optional fields', () => {
    const entries = parseHarText(sampleText);
    expect(entries).toHaveLength(5);
    expect(entries[0]).toMatchObject({ method: 'GET', status: 200, timeMs: 184 });
  });

  it('rejects invalid or empty captures with a useful message', () => {
    expect(() => parseHarText('{')).toThrow(/valid JSON/i);
    expect(() => parseHarText(JSON.stringify({ log: { entries: [] } }))).toThrow(/no requests/i);
  });

  it('detects synthetic sensitive headers and query values', () => {
    const entries = parseHarText(sampleText);
    const candidates = findRedactionCandidates(entries);
    expect(candidates.some((candidate) => candidate.label.toLowerCase() === 'authorization')).toBe(true);
    expect(candidates.some((candidate) => candidate.label === '?access_token')).toBe(true);
    expect(candidates.some((candidate) => candidate.label === '?recipient')).toBe(true);
    expect(candidates.some((candidate) => candidate.label === '?key')).toBe(true);
  });

  it('masks selected query values while preserving ordinary parameters', () => {
    const entries = parseHarText(sampleText);
    const candidates = findRedactionCandidates(entries);
    const selected = new Set(candidates.filter((candidate) => candidate.kind === 'query').map((candidate) => candidate.id));
    const safeUrl = formatSafeUrl(entries[0].url, 0, selected);
    expect(safeUrl).toContain('view=week');
    expect(safeUrl).toContain('access_token=%5BREDACTED%5D');
    expect(safeUrl).not.toContain('synthetic-demo-token');
  });

  it('includes an explicitly unredacted query only after the user opts out, but never exports headers', () => {
    const entries = parseHarText(sampleText);
    const report = createIncidentReport(entries, summarizeFindings(entries), new Set(), new Date('2026-11-16T21:00:00.000Z'));
    expect(report).toContain('synthetic-demo-token-839201');
    expect(report).not.toContain('synthetic-token-do-not-use');
    expect(report).not.toContain('synthetic-cookie-value');
  });

  it('creates evidence-linked failed and slow request findings', () => {
    const findings = summarizeFindings(parseHarText(sampleText));
    expect(findings.some((finding) => finding.id === 'failed:1' && finding.title.includes('503'))).toBe(true);
    expect(findings.some((finding) => finding.id === 'slow:1')).toBe(true);
    expect(findings.some((finding) => finding.id === 'failed:3' && finding.title.includes('404'))).toBe(true);
  });

  it('omits captured headers and bodies and redacts report URLs by default', () => {
    const entries = parseHarText(sampleText);
    const findings = summarizeFindings(entries);
    const candidates = findRedactionCandidates(entries);
    const selected = new Set(candidates.map((candidate) => candidate.id));
    const report = createIncidentReport(entries, findings, selected, new Date('2026-11-16T21:00:00.000Z'));
    expect(report).toContain('access_token=%5BREDACTED%5D');
    expect(report).not.toContain('synthetic-demo-token');
    expect(report).not.toContain('synthetic-token-do-not-use');
    expect(report).not.toContain('synthetic-cookie-value');
    expect(report).not.toContain('synthetic sample only');
    expect(report).toContain('not proof of root cause');
  });
});
