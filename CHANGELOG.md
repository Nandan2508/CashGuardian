# Changelog

All notable changes to CashGuardian CLI are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.1.0] — 2026-04-12 (Luminous Edition Overhaul)

### Added
- **Premium Web UI**: Launched the "Warm Notebook" interface—a single-file Vanilla JS platform with a human-centric "warm" aesthetic (Inter font, amber accents).
- **Dataset-Agnostic Intelligence**: Implemented dynamic file ingestion for CSV and JSON, allowing users to "talk to any data" instead of just the demo business.
- **Contextual Grounding Engine**: Refactored `queryAgent.js` to sample and ground AI reasoning in user-uploaded data samples.
- **Express API Bridge**: Added `server.js` to provide REST endpoints for the web interface (`/api/query`, `/api/upload`, `/api/snapshot`).
- **Visual Analytics**: Integrated real-time Chart.js visualizations for the 13-week cash flow ledger in the browser.
- **Transparency Logs**: Added "How was this answered?" feature in the UI to expose intent classification and grounding logic to the user.
- **Documentation 2.0**: Overhauled technical docs with interactive Mermaid flowcharts for Architecture, Methodology, and Risk Scoring.

### Changed
- **Dual-Interface Support**: Refactored the engine to support both high-performance CLI and a graphical Web UI simultaneously.
- **README Overhaul**: Completely updated the project entry-point with modern branding and technical depth.

### Removed
- **Legacy Components**: Deleted the previous React-based dashboard and redundant CLI "Benchmark" views to focus on the human-centric "Talk to Data" experience.

---

## [1.0.0] — 2025-04-26 (Hackathon Release)

### Added
- Natural language query interface via CLI (`readline`)
- Hybrid intent classifier — keyword matching + AI fallback
- AI integration via free-tier provider abstraction (Gemini / Groq / OpenRouter — switch via .env)
- Cash flow summary and current balance
- Overdue invoice detection and listing
- Client risk scoring engine (formula-based, three risk levels)
- 30-day cash flow prediction (rolling average projection)
- Anomaly detection (25% deviation threshold, severity scoring)
- Weekly and monthly narrative summary generation
- Period comparison engine (WoW, MoM with % deltas)
- Expense breakdown by category
- Payment reminder emails via Nodemailer (SMTP)
- Realistic synthetic dataset for Mehta Wholesale Traders (validated against IBM Finance Factoring, UCI Online Retail II, World Bank MSME datasets)
- Benchmark suite: 13 ground-truth Q&A pairs, max score 55 (`BENCHMARK.md`)
- Full formatter utility with Indian Rupee (₹) support
- Date utility wrapper around `date-fns`
- Jest test suite (45+ test cases)
- Full documentation suite (README, architecture, methodology, data model, CLI usage)

### Architecture
- Layered design: CLI → Agent → Services → Data → Formatter
- AI provider abstracted — swap Gemini/Groq/OpenRouter by changing one env var
- All secrets via `.env` / environment variables

---

## [0.1.0] — Initial Scaffold

### Added
- Project structure and folder layout
- Placeholder files for all modules
- `.env.example` with all required keys
- `package.json` with `start`, `test`, `lint` scripts