# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 1.0.x | ✅ Yes |
| < 1.0 | ❌ No |

## Reporting a Vulnerability

If you discover a security vulnerability in CashGuardian CLI, please **do not open a public GitHub issue**.

Instead, report it privately:

1. Email the maintainer directly (see `package.json` for contact)
2. Include a clear description of the vulnerability
3. Include steps to reproduce if possible
4. We will respond within 72 hours

## What We Care About

- **API key exposure** — keys must never be committed or logged
- **Email credential leakage** — SMTP credentials via env only
- **Dependency vulnerabilities** — run `npm audit` before submitting PRs

## Our Commitment

We take security seriously. Confirmed vulnerabilities will be patched and disclosed responsibly.