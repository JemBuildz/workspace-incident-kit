import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, ReactNode } from 'react';
import sampleHar from './data/sample.har.json';
import {
  findRedactionCandidates,
  formatDuration,
  parseHarText,
  safeHostPath,
  SLOW_REQUEST_THRESHOLD_MS,
  summarizeFindings,
} from './lib/har';
import type { HarEntry, RedactionCandidate } from './lib/har';
import { createIncidentReport } from './lib/report';

type WorkerReply = {
  ok: boolean;
  entries?: HarEntry[];
  error?: string;
};

const MAX_FILE_SIZE = 15 * 1024 * 1024;

function Icon({ name, size = 18 }: { name: 'shield' | 'upload' | 'download' | 'copy' | 'close' | 'check' | 'arrow' | 'file' | 'spark'; size?: number }) {
  const paths: Record<typeof name, ReactNode> = {
    shield: <><path d="M12 3 19 6v5c0 4.4-2.9 7.7-7 10-4.1-2.3-7-5.6-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></>,
    upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 14v5h14v-5" /></>,
    download: <><path d="M12 4v12" /><path d="m7 11 5 5 5-5" /><path d="M5 20h14" /></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <><path d="M7 17 17 7" /><path d="M8 7h9v9" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></>,
    spark: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 34 34" fill="none">
        <path d="M9 4.5h11l6 6V28a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z" />
        <path d="M20 4.5v6h6M12 16h10M12 21h10M12 26h6" />
        <circle cx="10" cy="16" r=".8" /><circle cx="10" cy="21" r=".8" /><circle cx="10" cy="26" r=".8" />
      </svg>
    </span>
  );
}

function parseInWorker(text: string): Promise<HarEntry[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./workers/har.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      worker.terminate();
      if (event.data.ok && event.data.entries) resolve(event.data.entries);
      else reject(new Error(event.data.error ?? 'Unable to inspect this capture.'));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error('The local analysis worker stopped unexpectedly. Please try a smaller HAR file.'));
    };
    worker.postMessage(text);
  });
}

function statusLabel(status: number | null): string {
  return status === null ? '—' : String(status).padStart(3, '0');
}

function statusTone(status: number | null): string {
  if (status === null) return 'neutral';
  if (status >= 500) return 'danger';
  if (status >= 400) return 'warning';
  if (status >= 200 && status < 300) return 'success';
  return 'neutral';
}

function maskValue(_value: string): string {
  return '••••••••••••';
}

function App() {
  const [entries, setEntries] = useState<HarEntry[] | null>(null);
  const [candidates, setCandidates] = useState<RedactionCandidate[]>([]);
  const [redactedIds, setRedactedIds] = useState<Set<string>>(new Set());
  const [activeEntry, setActiveEntry] = useState(0);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      void loadText(JSON.stringify(sampleHar), 'Synthetic sample');
    }
  }, []);

  const findings = useMemo(() => entries ? summarizeFindings(entries) : [], [entries]);
  const queryCandidates = candidates.filter((candidate) => candidate.kind === 'query');
  const unredactedCount = queryCandidates.filter((candidate) => !redactedIds.has(candidate.id)).length;
  const report = useMemo(
    () => entries ? createIncidentReport(entries, findings, redactedIds) : '',
    [entries, findings, redactedIds],
  );

  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    return entries.map((entry, index) => ({ entry, index })).filter(({ entry, index }) => {
      const text = `${entry.method} ${safeHostPath(entry.url, index, redactedIds)} ${entry.status ?? ''}`.toLowerCase();
      const matchesQuery = text.includes(query.trim().toLowerCase());
      const matchesFilter = filter === 'all'
        || (filter === 'errors' && entry.status !== null && entry.status >= 400)
        || (filter === 'slow' && entry.timeMs !== null && entry.timeMs >= SLOW_REQUEST_THRESHOLD_MS);
      return matchesQuery && matchesFilter;
    });
  }, [entries, filter, query, redactedIds]);

  const selected = entries?.[activeEntry] ?? null;
  const failedCount = entries?.filter((entry) => entry.status !== null && entry.status >= 400).length ?? 0;
  const slowCount = entries?.filter((entry) => entry.timeMs !== null && entry.timeMs >= SLOW_REQUEST_THRESHOLD_MS).length ?? 0;

  async function loadText(text: string, source: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const parsed = source === 'Synthetic sample' ? parseHarText(text) : await parseInWorker(text);
      setEntries(parsed);
      const nextCandidates = findRedactionCandidates(parsed);
      setCandidates(nextCandidates);
      setRedactedIds(new Set(nextCandidates.map((candidate) => candidate.id)));
      setActiveEntry(0);
      setFilter('all');
      setQuery('');
      setReportOpen(false);
      setNotice(source === 'Synthetic sample' ? 'Synthetic demo loaded. Nothing was sent anywhere.' : 'Capture inspected locally. Raw request and response bodies are not shown or exported.');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to inspect this file.');
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file?: File) {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      setError('This file is larger than the 15 MB in-browser limit. Export a smaller capture and try again.');
      return;
    }
    setNotice('');
    setError('');
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = await parseInWorker(text);
      setEntries(parsed);
      const nextCandidates = findRedactionCandidates(parsed);
      setCandidates(nextCandidates);
      setRedactedIds(new Set(nextCandidates.map((candidate) => candidate.id)));
      setActiveEntry(0);
      setFilter('all');
      setQuery('');
      setReportOpen(false);
      setNotice('Capture inspected locally. Raw request and response bodies are not shown or exported.');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to inspect this file.');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function loadSample() {
    void loadText(JSON.stringify(sampleHar), 'Synthetic sample');
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0]);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.classList.remove('is-dragging');
    void handleFile(event.dataTransfer.files?.[0]);
  }

  function toggleRedaction(candidate: RedactionCandidate) {
    if (candidate.kind !== 'query') return;
    const currentlyRedacted = redactedIds.has(candidate.id);
    if (currentlyRedacted && !window.confirm('This detected value will be included in the report if you turn redaction off. Continue?')) return;
    setRedactedIds((current) => {
      const next = new Set(current);
      if (currentlyRedacted) next.delete(candidate.id);
      else next.add(candidate.id);
      return next;
    });
  }

  function clearCapture() {
    if (fileInput.current) fileInput.current.value = '';
    setEntries(null);
    setCandidates([]);
    setRedactedIds(new Set());
    setActiveEntry(0);
    setFilter('all');
    setQuery('');
    setError('');
    setNotice('');
    setReportOpen(false);
  }

  function downloadReport() {
    if (!report) return;
    const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'workspace-incident-report.md';
    link.click();
    URL.revokeObjectURL(url);
    setNotice('Sanitized Markdown report downloaded. Give it one last review before sharing.');
  }

  async function copyReport() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report);
      setNotice('Report copied. Review it before sharing.');
    } catch {
      setNotice('Clipboard access is unavailable here. Use Download report instead.');
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Workspace Incident Kit home" onClick={clearCapture}>
          <BrandMark />
          <span className="brand-copy"><strong>Incident Kit</strong><small>WORKSPACE DIAGNOSTICS</small></span>
        </a>
        <div className="topbar-right">
          <span className="privacy-pill"><span className="privacy-dot" /> LOCAL BY DESIGN</span>
          <a className="top-link" href="#privacy">Privacy notes <Icon name="arrow" size={14} /></a>
        </div>
      </header>

      <main id="top" className="main-shell">
        {!entries ? (
          <section className="welcome-layout" aria-labelledby="hero-title">
            <div className="welcome-copy">
              <div className="eyebrow"><span className="eyebrow-line" /> A calmer way to troubleshoot</div>
              <h1 id="hero-title">Make the capture<br /><em>make sense.</em></h1>
              <p className="hero-lede">Turn a noisy browser trace into evidence you can understand and a report you can share—without uploading the raw capture.</p>
              <div className="promise-row">
                <span><Icon name="shield" size={16} /> Your file stays in this browser</span>
                <span><Icon name="check" size={16} /> No account. No AI. No app analytics.</span>
              </div>
              <div className="mini-proof">
                <div className="proof-mark"><Icon name="spark" size={18} /></div>
                <div><strong>Evidence, not guesses</strong><p>Every flag points to a request in the capture. Findings are indicators—not proof of root cause.</p></div>
              </div>
            </div>

            <div className="import-card" onDragOver={(event) => { event.preventDefault(); event.currentTarget.classList.add('is-dragging'); }} onDragLeave={(event) => event.currentTarget.classList.remove('is-dragging')} onDrop={onDrop}>
              <div className="import-card-top"><span className="section-kicker">START WITH A CAPTURE</span><span className="step-mark">01 / 03</span></div>
              <div className="drop-icon"><Icon name="file" size={25} /></div>
              <h2>Inspect a HAR file</h2>
              <p className="import-description">Choose a browser network capture, or drop it here. HAR files can contain sensitive data—review the redactions before sharing.</p>
              <button className="button button-primary button-wide" onClick={() => fileInput.current?.click()} disabled={busy}>
                <Icon name="upload" /> {busy ? 'Inspecting locally…' : 'Choose a .har file'}
              </button>
              <button className="button button-secondary button-wide" onClick={loadSample} disabled={busy}>
                <Icon name="spark" /> Try the synthetic sample
              </button>
              <div className="drop-meta"><span>JSON HAR · up to 15 MB</span><span>Processed on this device</span></div>
              {error && <div className="alert alert-error" role="alert">{error}</div>}
              {busy && <div className="loading-line" aria-live="polite"><span /> Reading and analyzing in this browser…</div>}
            </div>
          </section>
        ) : (
          <>
            <section className="workspace-heading">
              <div>
                <div className="eyebrow"><span className="eyebrow-line" /> INCIDENT WORKBENCH</div>
                <h1 className="workspace-title">Capture <em>overview</em></h1>
                <p className="workspace-subtitle">A local read of {entries.length} requests. Clues are linked to the evidence that triggered them.</p>
              </div>
              <div className="heading-actions">
                <button className="button button-quiet" onClick={clearCapture}><Icon name="close" /> Clear capture</button>
                <button className="button button-primary" onClick={downloadReport}><Icon name="download" /> Download report</button>
              </div>
            </section>

            <div className="notice-row" role="status"><span className="notice-icon"><Icon name="shield" size={16} /></span><span>{notice || 'Local analysis is active. Selected capture data is not sent to a server.'}</span><span className="notice-tail">MEMORY ONLY</span></div>
            {error && <div className="alert alert-error" role="alert">{error}</div>}

            <section className="metrics" aria-label="Capture summary">
              <Metric label="Requests" value={String(entries.length).padStart(2, '0')} note="in this capture" tone="blue" />
              <Metric label="HTTP errors" value={String(failedCount).padStart(2, '0')} note="4xx / 5xx responses" tone={failedCount ? 'red' : 'green'} />
              <Metric label="Slow requests" value={String(slowCount).padStart(2, '0')} note="≥ 2,000 ms" tone={slowCount ? 'amber' : 'green'} />
              <Metric label="Private fields" value={String(candidates.length).padStart(2, '0')} note="flagged for review" tone={candidates.length ? 'amber' : 'green'} />
            </section>

            <section className="workbench-layout" aria-label="HAR analysis">
              <nav className="section-rail" aria-label="Analysis sections">
                <span className="rail-label">WORKFLOW</span>
                <a className="rail-item active" href="#requests"><span className="rail-num">01</span><span>Requests</span><span className="rail-count">{entries.length}</span></a>
                <a className="rail-item" href="#findings"><span className="rail-num">02</span><span>Findings</span><span className="rail-count">{findings.length}</span></a>
                <a className="rail-item" href="#redactions"><span className="rail-num">03</span><span>Redactions</span><span className="rail-count">{candidates.length}</span></a>
                <div className="rail-spacer" />
                <div className="rail-safety"><Icon name="shield" size={16} /><span>Capture stays<br />on this device.</span></div>
              </nav>

              <section className="request-panel panel" id="requests" aria-labelledby="requests-title">
                <div className="panel-heading request-panel-heading">
                  <div><span className="section-kicker">CAPTURE EVIDENCE</span><h2 id="requests-title">Request timeline</h2></div>
                  <span className="panel-count">{filteredEntries.length} <span>shown</span></span>
                </div>
                <div className="request-tools">
                  <label className="search-box"><span className="search-glyph">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter requests…" aria-label="Filter requests" /></label>
                  <label className="filter-select"><span className="visually-hidden">Filter requests by status</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All requests</option><option value="errors">HTTP errors</option><option value="slow">Slow ≥ 2 s</option></select></label>
                </div>
                <div className="request-list" role="list" aria-label="Requests in capture">
                  {filteredEntries.map(({ entry, index }) => {
                    const rowFinding = findings.find((finding) => finding.entryIndex === index);
                    return (
                      <button key={index} className={`request-row ${activeEntry === index ? 'selected' : ''}`} onClick={() => setActiveEntry(index)} role="listitem" aria-current={activeEntry === index ? 'true' : undefined}>
                        <span className="request-index">{String(index + 1).padStart(2, '0')}</span>
                        <span className="request-main"><span className="request-route"><span className="method-tag">{entry.method}</span><span className="route-text" title={safeHostPath(entry.url, index, redactedIds)}>{safeHostPath(entry.url, index, redactedIds)}</span></span><span className="request-meta">{rowFinding ? <span className={`finding-dot ${rowFinding.kind}`} /> : <span className="finding-dot none" />}{rowFinding ? rowFinding.title : 'No alert from current checks'}</span></span>
                        <span className={`status-code ${statusTone(entry.status)}`}>{statusLabel(entry.status)}</span>
                        <span className="request-time">{formatDuration(entry.timeMs)}</span>
                      </button>
                    );
                  })}
                  {filteredEntries.length === 0 && <div className="empty-filter"><strong>No matching requests</strong><span>Try another search or filter.</span></div>}
                </div>
                <div className="panel-footnote"><span className="footnote-mark">i</span><span>Raw bodies are never shown. Metadata is displayed locally and omitted where it may expose flagged query values.</span></div>
              </section>

              <aside className="inspector-column">
                <section className="panel inspector-panel" id="findings" aria-labelledby="findings-title">
                  <div className="panel-heading compact-heading"><div><span className="section-kicker">DETERMINISTIC CHECKS</span><h2 id="findings-title">Findings</h2></div><span className="panel-count">{findings.length}</span></div>
                  {findings.length ? <div className="finding-list">
                    {findings.map((finding) => <button key={finding.id} className={`finding-card ${finding.kind} ${finding.entryIndex === activeEntry ? 'current' : ''}`} onClick={() => setActiveEntry(finding.entryIndex)}>
                      <span className={`finding-symbol ${finding.kind}`}>{finding.kind === 'failed' ? '!' : '↗'}</span>
                      <span className="finding-copy"><strong>{finding.title}</strong><span>Request {String(finding.entryIndex + 1).padStart(2, '0')} · {finding.detail.replace(/^Request \d+ /, '')}</span></span>
                      <span className="evidence-arrow"><Icon name="arrow" size={14} /></span>
                    </button>)}
                  </div> : <div className="calm-empty"><span className="calm-check"><Icon name="check" size={17} /></span><div><strong>No current flags</strong><p>That doesn’t prove the capture is error-free. Checks are intentionally narrow.</p></div></div>}
                  <div className="disclaimer-note"><strong>Indicators, not diagnosis.</strong> Failed and slow requests can have many causes. Use the linked request as a starting point.</div>
                </section>

                <section className="panel redaction-panel" id="redactions" aria-labelledby="redactions-title">
                  <div className="panel-heading compact-heading"><div><span className="section-kicker">SHARE SAFELY</span><h2 id="redactions-title">Redaction review</h2></div><span className="redaction-badge">{candidates.length} flagged</span></div>
                  {candidates.length ? <>
                    <p className="redaction-intro">Likely private values are masked in the report by default. Request headers are never exported.</p>
                    <div className="candidate-list">
                      {candidates.map((candidate) => <div className="candidate-row" key={candidate.id}>
                        <span className="candidate-lock"><Icon name="shield" size={14} /></span>
                        <span className="candidate-copy"><span className="candidate-label">{candidate.label}<span className="candidate-request">REQ {String(candidate.entryIndex + 1).padStart(2, '0')}</span></span><span className="masked-value">{maskValue(candidate.value)}</span></span>
                        {candidate.kind === 'header' ? <span className="withheld-tag">WITHHELD</span> : <label className="toggle-label"><input type="checkbox" checked={redactedIds.has(candidate.id)} onChange={() => toggleRedaction(candidate)} aria-label={`Redact ${candidate.label} in request ${candidate.entryIndex + 1}`} /><span className="toggle-ui" /><span className="visually-hidden">Redact from report</span></label>}
                      </div>)}
                    </div>
                    {unredactedCount > 0 && <div className="alert alert-warning"><strong>{unredactedCount} detected query value{unredactedCount === 1 ? '' : 's'} will appear in the report.</strong> Review before sharing.</div>}
                  </> : <div className="calm-empty small"><span className="calm-check"><Icon name="check" size={17} /></span><div><strong>No likely secrets found</strong><p>Detection is best-effort. Review the report manually.</p></div></div>}
                  <p className="redaction-limit">Redaction may miss secrets in paths, unfamiliar fields, or unusual formats.</p>
                </section>

                <section className={`panel report-panel ${reportOpen ? 'expanded' : ''}`} aria-labelledby="report-title">
                  <button className="report-toggle" onClick={() => setReportOpen((open) => !open)} aria-expanded={reportOpen}>
                    <span className="report-icon"><Icon name="file" size={17} /></span><span className="report-toggle-copy"><span className="section-kicker">READY TO SHARE</span><strong id="report-title">Incident report</strong></span><span className="report-toggle-action">{reportOpen ? 'Hide' : 'Preview'}</span>
                  </button>
                  {reportOpen && <div className="report-content"><pre>{report}</pre><div className="report-buttons"><button className="button button-secondary button-small" onClick={() => void copyReport()}><Icon name="copy" size={15} /> Copy</button><button className="button button-primary button-small" onClick={downloadReport}><Icon name="download" size={15} /> Download .md</button></div></div>}
                </section>
              </aside>
            </section>

            <section className="detail-strip panel" aria-live="polite">
              <div className="detail-number">{String(activeEntry + 1).padStart(2, '0')}<span> / {String(entries.length).padStart(2, '0')}</span></div>
              {selected ? <>
                <div className="detail-main"><span className="section-kicker">SELECTED REQUEST</span><h2><span className="method-tag">{selected.method}</span> {safeHostPath(selected.url, activeEntry, redactedIds)}</h2><p>{selected.startedAt ? new Date(selected.startedAt).toLocaleString() : 'Start time not recorded'} <span className="detail-separator">·</span> {selected.status === null ? 'HTTP status not recorded' : `HTTP ${selected.status} ${selected.statusText}`} <span className="detail-separator">·</span> {formatDuration(selected.timeMs)}</p></div>
                <div className="timing-summary"><span className="section-kicker">RECORDED TIMING</span><div>{Object.entries(selected.timings).filter(([, value]) => value !== null && value >= 0).slice(0, 4).map(([name, value]) => <span key={name}><small>{name}</small><strong>{formatDuration(value)}</strong></span>)}{Object.values(selected.timings).every((value) => value === null) && <span className="timing-missing">No phase timings recorded</span>}</div></div>
              </> : <div className="detail-main"><span className="section-kicker">SELECT A REQUEST</span><h2>Choose a row to inspect its evidence.</h2></div>}
            </section>
          </>
        )}

        <footer className="page-footer" id="privacy">
          <div className="footer-brand"><BrandMark /><span>INCIDENT KIT <small>INDEPENDENT PROJECT</small></span></div>
          <p><strong>Privacy promise:</strong> the capture is analyzed in this browser’s memory. No upload, account, runtime AI, or app analytics. The app itself is delivered by a web host; this promise is about your selected diagnostic file.</p>
          <p className="footer-note">Not affiliated with or endorsed by Google. Redaction is best-effort; review every report before sharing.</p>
        </footer>
      </main>
      <input ref={fileInput} className="visually-hidden" type="file" accept=".har,application/json" onChange={onFileChange} aria-label="Choose a HAR file" />
    </div>
  );
}

function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone: 'blue' | 'red' | 'amber' | 'green' }) {
  return <div className={`metric-card ${tone}`}><span className="metric-label">{label}</span><strong>{value}</strong><span className="metric-note">{note}</span><span className="metric-mark" /></div>;
}

export default App;
