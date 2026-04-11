# CashGuardian CLI

Talk to your business finances in plain English.

## Problem Statement

Indian SMEs often run on delayed payments, thin buffers, and spreadsheet-heavy follow-up. World Bank MSME indicators and payment-delay datasets show that payment friction, poor visibility, and slow collections directly increase cash stress for smaller businesses. CashGuardian CLI is built for that exact operating reality: a small business owner should be able to ask a plain-English question and get a grounded answer fast.

## Solution

CashGuardian maps to the hackathon pillars like this:

| Pillar | How CashGuardian supports it |
|---|---|
| Clarity | Plain-English answers for balance, overdue invoices, breakdowns, anomalies, and summaries |
| Trust | Locked synthetic dataset, benchmarked outputs, deterministic services, and context injection for AI |
| Speed | CLI-first workflow, instant calculations, and provider abstraction across free AI tiers |

## Use Case Coverage

| Use Case | Command examples | Backing services |
|---|---|---|
| Understand what changed | `Give me a weekly summary`, `Are there any unusual patterns in my spending?` | `summaryService`, `anomalyService` |
| Compare | `Compare this month vs last month` | `cashFlowService.comparePeriods()` |
| Breakdown | `Show me expense breakdown`, `Show me all overdue invoices` | `cashFlowService`, `invoiceService` |
| Summarise | `Give me a cash flow summary`, `What is my current cash balance?` | `cashFlowService`, `riskService`, `queryAgent` |

## Technical Depth

### AI approach

CashGuardian uses a provider abstraction over free-tier AI options:

- Gemini: `gemini-1.5-flash`
- Groq: `llama3-8b-8192`
- OpenRouter: `mistralai/mistral-7b-instruct:free`

The application selects the provider through `AI_PROVIDER` and `AI_MODEL`, so the calling code stays the same while the backend can switch.

### Why context injection instead of fine-tuning

The system prompt injects a live financial snapshot generated from local services. This keeps answers tied to current data instead of model memory, reduces hallucinations, and makes benchmark verification possible. The AI is used for explanation and summarisation, not for inventing numbers.

### ASCII architecture diagram

```text
User
  |
  v
index.js (CLI / readline)
  |
  v
agent/queryAgent.js
  |
  +--> intentMap.js
  |
  +--> services/
       |--> cashFlowService.js
       |--> invoiceService.js
       |--> riskService.js
       |--> predictionService.js
       |--> anomalyService.js
       |--> summaryService.js
       |--> emailService.js
  |
  v
AI provider adapter (Gemini / Groq / OpenRouter)
  |
  v
utils/formatter.js -> terminal output
```

### Data flow

```text
Query -> intent classification -> deterministic service calls -> snapshot build
     -> AI narrative or rule-based fallback -> formatter -> user
```

### Dataset design

The project uses synthetic business data designed to exercise every feature, then validates its realism against:

- IBM Finance Factoring late-payment histories
- UCI Online Retail II
- World Bank MSME Country Indicators

## Features

| Feature | Outcome |
|---|---|
| Cash balance and summary | Shows total income, expenses, and net cash position |
| Expense breakdown | Groups costs by category with Indian-style currency formatting |
| Invoice tracking | Lists overdue invoices and upcoming dues |
| Risk scoring | Flags risky clients using a fixed scoring formula |
| 30-day prediction | Projects four weekly balances and runway risk |
| Anomaly detection | Spots unusual sales and logistics movements |
| Narrative summary | Generates readable weekly/monthly business summaries |
| Email reminders | Sends payment reminders through Nodemailer SMTP |

## Installation

```bash
npm install
copy .env.example .env
npm test
npm start
```

Then update `.env`:

1. Set `AI_PROVIDER` to `gemini`, `groq`, or `openrouter`
2. Paste a free API key into `AI_API_KEY`
3. Keep `AI_MODEL` aligned with the provider
4. Add SMTP settings for reminder emails

Full provider setup is documented in [AI_PROVIDER_SETUP.md](C:\Users\sapan.nv\OneDrive\Desktop\natwest\CashGuardian\AI_PROVIDER_SETUP.md).

## Usage Examples

```text
> What is my current cash balance?
Current net cash balance is −₹12,500.
Income: ₹9,25,500 | Expenses: ₹9,38,000

> Show me all overdue invoices
4 invoices are overdue, totalling ₹2,15,500.
Highest exposure: Sharma Retail - ₹96,000

> What will my cash look like in 30 days?
Starting balance: −₹12,500
Week 2026-W16 projected balance: ₹47,625
Week 2026-W17 projected balance: ₹46,750
Week 2026-W18 projected balance: ₹1,22,875
Week 2026-W19 projected balance: ₹1,65,000
```

## Tech Stack

| Layer | Tools |
|---|---|
| Runtime | Node.js 18+ |
| CLI | `readline` |
| AI | Gemini / Groq / OpenRouter |
| Dates | `date-fns` |
| Email | `nodemailer` |
| Config | `dotenv` |
| Testing | `jest` |

## Benchmark

CashGuardian uses the benchmark set in [BENCHMARK.md](C:\Users\sapan.nv\OneDrive\Desktop\natwest\CashGuardian\BENCHMARK.md). The benchmark contains 13 ground-truth prompts with a maximum score of 55.

## Limitations

- Some task-sheet benchmark claims differ slightly from the locked JSON data, so code is grounded in the dataset first
- Full AI answer quality still depends on the configured provider and API availability
- The current CLI router is still lighter than the full target architecture described in the task sheet

## Future Improvements

- Finish the full AI query router for all intents
- Add richer client extraction for reminder flows
- Add snapshot regression tests for CLI responses
- Extend benchmark automation to score deterministic outputs automatically

## License

Apache 2.0. See [LICENSE](C:\Users\sapan.nv\OneDrive\Desktop\natwest\CashGuardian\LICENSE).
