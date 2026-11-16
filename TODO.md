# TODO — Workspace Incident Kit MVP

## Local HAR import, synthetic sample, and request timeline

- [x] Load an exported HAR file from the local device or open a bundled synthetic sample built only from synthetic fixture data. The app accepts a local `.har` up to 15 MB and the demo uses `.test` hosts and fake values.
- [x] Keep the selected capture and all analysis exclusively in browser memory for the active session, with no account, backend upload, OAuth, AI processing, telemetry, or persistence of raw captures. The app contains no upload, analytics, telemetry, local-storage, session-storage, or IndexedDB calls; platform-injected analytics and the Manus badge are disabled.
- [x] Present HAR requests in a responsive, searchable, and filterable timeline with clear request metadata and details.

## Evidence-based analysis and shareable report

- [x] Generate deterministic findings for failed and slow requests, linking every finding to the specific supporting request evidence. Current checks flag HTTP 4xx/5xx and durations of at least 2,000 ms.
- [x] Clearly label analysis as best-effort and explain that findings are indicators rather than proof of root cause.
- [x] Detect likely sensitive header values and query parameters, mask them by default, and provide a user-reviewable redaction flow. Captured headers are never exported; detected query values are redacted by default and require confirmation before opting out.
- [x] Preview a sanitized Markdown incident report assembled from the reviewed findings and redactions, then download it locally. Copy is also supported; captured headers and bodies are omitted.

## Privacy, accessibility, and project identity

- [x] Provide a keyboard-accessible interface with a calm technical field-notebook aesthetic across desktop and smaller screens.
- [x] Include a privacy statement, an independent non-affiliation notice, and a roadmap that identifies email-header parsing and DNS checks as later items.
