# Contributing to CashGuardian CLI

First off — thank you for taking the time to contribute! 🎉

CashGuardian CLI is an open-source project and we welcome contributions of all kinds: bug fixes, new features, documentation improvements, and ideas.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Get Started](#how-to-get-started)
- [Project Structure](#project-structure)
- [How to Contribute](#how-to-contribute)
- [Branch Naming](#branch-naming)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to uphold a welcoming and respectful environment for everyone.

---

## How to Get Started

```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/<your-username>/cashguardian-cli.git
cd cashguardian-cli

# 3. Install dependencies
npm install

# 4. Set up environment
cp .env.example .env
# Fill in your API keys (see .env.example for guidance)

# 5. Run the CLI
node index.js

# 6. Run tests
npm test
```

---

## Project Structure

See [AGENTS.md](./AGENTS.md) for the full file map and architecture overview. Each layer has a single responsibility — please respect that when adding code:

| Layer | Responsibility |
|---|---|
| `agent/` | Intent parsing and AI API routing only |
| `services/` | Pure business logic — no I/O, no printing |
| `data/` | JSON flat files — schema must not change without updating `docs/data-model.md` |
| `utils/` | Shared helpers — formatting, dates |
| `tests/` | Jest unit tests |
| `docs/` | All documentation |

---

## How to Contribute

### Option 1: Pick an open issue

Browse [Issues](https://github.com/your-org/cashguardian-cli/issues) and look for ones tagged:
- `good first issue` — ideal for first-time contributors
- `help wanted` — we actively need help here
- `documentation` — no code required

### Option 2: Fix something you found

If you find a bug or something that bothers you, open an issue first to discuss, then submit a PR.

### Option 3: Implement a planned feature

Check [tasks.md](./tasks.md) — each task is a well-scoped unit of work with acceptance criteria. Pick one and go.

---

## Branch Naming

Use this convention:

```
feat/phase2-task5-query-agent
fix/overdue-invoice-date-bug
docs/update-cli-usage
test/risk-service-coverage
refactor/formatter-currency
```

---

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(phase2-task5): add Claude API integration to query agent
fix(invoiceService): correct overdue detection for same-day due dates
docs(README): add architecture diagram
test(riskService): add 3 edge case tests for zero-invoice clients
refactor(formatter): extract currency formatting to shared util
```

**All commits must be signed off** (hackathon DCO requirement):

```bash
git commit -s -m "feat(phase2-task5): add query agent"
```

---

## Pull Request Process

1. Make sure `npm test` passes locally with 0 failures
2. Make sure there are no stray `console.log` statements in `services/` or `agent/`
3. Update relevant docs if you changed behaviour or added a feature
4. Fill in the PR template (auto-populated when you open a PR)
5. Request a review — a maintainer will respond within 48 hours

### PR Title Format

```
feat: add anomaly detection service
fix: handle missing client name in email reminder
docs: complete cli-usage.md with all 11 commands
```

---

## Coding Standards

- **Descriptive names** — `getOverdueInvoices()` not `getData()`
- **JSDoc on every exported function** — include `@param`, `@returns`, and a one-line description
- **No secrets in code** — always `process.env.VARIABLE_NAME`
- **No logic in `index.js`** — it only starts the CLI loop
- **No I/O in services** — services compute and return; they never print
- **Indian Rupee formatting** — always use `formatter.formatCurrency(amount)` for money values

---

## Reporting Bugs

Open an [Issue](https://github.com/your-org/cashguardian-cli/issues/new) with:

- A short, descriptive title
- Steps to reproduce
- What you expected to happen
- What actually happened
- Your Node.js version (`node --version`)
- Relevant error output (redact any secrets)

---

## Suggesting Features

Open an Issue with the `enhancement` label. Describe:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you considered

We especially welcome ideas around:
- Additional free AI providers (Ollama for local inference, Cohere, Together AI)
- Additional financial use cases
- Better output formatting
- Real bank/accounting API integrations

---

Thank you for contributing 🙏