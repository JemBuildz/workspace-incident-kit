# Contributing

Thanks for helping make troubleshooting clearer and safer. This project is licensed under MIT; code contributions are accepted on that basis. Suggestions, discussions, and synthetic bug reports are welcome. The most useful early improvements are synthetic HAR fixtures, parser edge cases, redaction tests, accessibility fixes, and explanations tied to observable evidence.

## Before opening a pull request

- Open an issue or discussion first for larger features so scope and privacy impact are clear.
- Never submit a real HAR file, email header, access token, cookie, customer record, or production hostname. Use synthetic data with `.test` domains and obviously fake values.
- Keep analysis deterministic. Do not add a cloud AI call, analytics, telemetry, upload endpoint, or raw-capture persistence without an explicit product and privacy review.
- Keep findings evidence-linked and cautious. A status or timing observation is not proof of root cause.
- Run `pnpm check`, `pnpm test`, and `pnpm build` before requesting review.
- Describe the behavior changed, the synthetic fixture/test added, and any privacy consequences.

## Development

The app is a static React + TypeScript + Vite project. Core parsing and report helpers live in `src/lib/`; browser UI is under `src/`; synthetic fixtures live in `src/data/` and `tests/fixtures/`.

```bash
pnpm install
pnpm dev
pnpm check
pnpm test
pnpm build
```

Do not add real diagnostic artifacts to the repository, even in private branches or screenshots.
