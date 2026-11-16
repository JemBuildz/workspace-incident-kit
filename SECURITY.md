# Security policy

## Reporting a vulnerability

Please do not publish a suspected vulnerability together with a real HAR file, token, cookie, customer record, or other sensitive diagnostic artifact.

This repository does not yet have a private vulnerability-reporting channel configured. Until one is available, contact the maintainer through the GitHub profile or organization associated with this repository and ask for a private reporting route. Do not include exploit details or secrets in a public issue.

## Scope and expectations

Security reports are especially useful when they demonstrate that selected file contents or derived request data leave the browser, that an exported report includes a detected value despite its redaction choice, or that a malformed HAR can execute code or compromise the app.

The project is an early MVP. Redaction is best-effort and must not be treated as a guarantee that a HAR is safe to share.
