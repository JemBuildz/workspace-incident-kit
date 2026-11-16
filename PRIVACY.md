# Privacy notes

Workspace Incident Kit is intended to analyze HAR captures in the browser. The selected file is read by the page and passed to a short-lived Web Worker for parsing. The current app has no API server, account, OAuth flow, analytics package, telemetry endpoint, or runtime AI call. It does not store the raw capture in local storage or IndexedDB. Clearing the capture removes the app’s references to its analysis state; as with other browser software, this cannot guarantee immediate physical memory erasure.

The app’s own static assets are delivered by the hosting origin. This is separate from sending the selected diagnostic file. The project should keep the no-upload behavior auditable and re-check network requests when adding any dependency or capability.

## What the report contains

The Markdown report includes request method, URL, status, duration, generated findings, and a summary. It never includes request or response bodies or captured request headers. Likely sensitive query values are masked by default. A user can turn off a detected query redaction, after a confirmation, and that value will then appear in the exported URL. Review the full report before sharing it.

The current detector flags common credential-bearing header names and query parameters whose keys or values resemble emails or long tokens. It is best-effort and may miss secrets in paths, unfamiliar parameter names, unusual encodings, or content the app does not inspect. Do not treat a “no likely secrets found” result as proof that a capture is safe to share.

Use synthetic examples for bug reports. Never attach a real capture, session token, cookie, or customer record to a public issue.

This project is independent and not affiliated with Google.
