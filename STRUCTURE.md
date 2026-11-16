# Repository structure

This is the implemented v1 layout. It deliberately keeps the app as a static browser project: no backend, database, Workspace API client, or separate shared package is needed for the first HAR workflow.

```text
workspace-incident-kit/
├── README.md                    # product promise, setup, limits, roadmap
├── PRIVACY.md                   # data flow and redaction limits
├── CONTRIBUTING.md              # synthetic-only contribution rules
├── SECURITY.md                  # responsible vulnerability reporting
├── CODE_OF_CONDUCT.md
├── ROADMAP.md
├── TODO.md                      # outcome criteria and delivery status
├── STRUCTURE.md                 # this map
├── app.config.ts                # managed-project logo metadata
├── project-mark.svg             # original project mark
├── index.html
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml          # reviewed esbuild script permission
├── tsconfig*.json
├── vite.config.ts
├── public/
│   ├── favicon.svg
│   └── manus-routes.json
├── src/
│   ├── App.tsx                  # import flow, timeline, findings, redactions, report UI
│   ├── main.tsx
│   ├── styles.css
│   ├── data/sample.har.json     # synthetic `.test` demo only
│   ├── lib/
│   │   ├── har.ts               # parser, candidates, findings, URL redaction
│   │   └── report.ts            # sanitized Markdown export
│   └── workers/har.worker.ts    # local parsing worker
├── tests/har.test.ts            # parser, redaction, findings, report tests
├── docs/
│   ├── workbench-preview.png
│   └── mobile-preview.png
├── .github/
│   ├── ISSUE_TEMPLATE/          # safe bug/feature issue forms
│   ├── pull_request_template.md
│   └── workflows/ci.yml         # check, test, build
└── .gitignore
```

## Boundaries

`src/lib/har.ts` is deterministic and framework-independent. It normalizes HAR request metadata, flags selected header names and likely secret query parameters, and produces evidence-linked HTTP error/slow-request findings. `src/workers/har.worker.ts` parses the selected text locally. `src/lib/report.ts` creates Markdown from request metadata and the user’s redaction choices; it never serializes captured headers or bodies.

`src/App.tsx` owns transient view state only. Raw capture data is not written to local storage, IndexedDB, a database, or an application server. Tests and the bundled sample use synthetic values only. Future email-header or public DNS support should be added as separate deterministic modules with their own synthetic fixtures and limitations rather than broadening the first release into a general Workspace API client.

## GitHub hygiene

Before public release, choose a license, replace any remaining contact details with a real maintainer channel, configure private vulnerability reporting, and keep issue forms explicit about synthetic-only data. Do not include real captures in screenshots, bug reports, fixtures, or commits.
