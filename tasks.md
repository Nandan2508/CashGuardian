# tasks.md

> Complete task list for CashGuardian CLI — "Talk to Data" Hackathon.
> Usage: `build phase <X> task <Y>`
> Each task is atomic, testable, and maps to a single concern.
>
> **AI API note:** All AI calls use free-tier providers (Gemini / Groq / OpenRouter).
> See `AI_PROVIDER_SETUP.md` for setup. The API call happens only in Phase 2 Task 5.
>
> **Dataset note:** `data/` files are pre-generated and benchmark-locked — do NOT regenerate them.
> They were designed to trigger every feature and validated against real public datasets.

---

## Phase 1 — Foundation

**Goal:** Working scaffold, data in place, CLI loop running end-to-end.

---

### Task 1.1 — Project Scaffold

**Prompt:** `build phase 1 task 1`

**What to build:**
- Initialise `package.json` with scripts: `start`, `test`, `lint`
- Install dependencies: `dotenv`, `date-fns`, `nodemailer`
- Install dev dependencies: `jest`
- Create `jest.config.js`
- Create `.env.example` exactly as specified in `AGENTS.md` (AI_PROVIDER, AI_API_KEY, AI_MODEL, email fields)
- Create empty placeholder files for every file in the AGENTS.md file map, each with a one-line JSDoc comment

**Acceptance criteria:**
- [ ] `npm install` completes with no errors
- [ ] `node index.js` starts a readline prompt without crashing
- [ ] `npm test` runs (0 tests, exits 0)
- [ ] `.env.example` has AI_PROVIDER, AI_API_KEY, AI_MODEL — no real values
- [ ] No secrets in any file

---

### Task 1.2 — Verify Pre-generated Data Files

**Prompt:** `build phase 1 task 2`

**What to do:**
The `data/` files (`transactions.json`, `invoices.json`, `metrics.json`) are already pre-generated and committed to the repo. Do NOT overwrite them.

Verify they are valid and match the schema in `AGENTS.md`:

```js
// Run this verification script:
const txns = require('./data/transactions.json');
const invs  = require('./data/invoices.json');
const mets  = require('./data/metrics.json');

console.assert(Array.isArray(txns), 'transactions must be array');
console.assert(txns.every(t => t.id && t.date && t.type && t.amount), 'tx schema ok');
console.assert(Array.isArray(invs), 'invoices must be array');
console.assert(invs.filter(i => i.status === 'overdue').length >= 4, 'need 4 overdue');
console.assert(Array.isArray(mets), 'metrics must be array');
console.log('✅ All data files valid');
```

**Key facts to confirm (from BENCHMARK.md ground truth):**
- `transactions.json`: 51 records, net balance = income − expenses = ₹−12,500
- `invoices.json`: 4 overdue invoices totalling ₹2,15,500; Sharma Retail has 3/4 late
- `metrics.json`: 13 weekly snapshots

**Acceptance criteria:**
- [ ] Verification script runs with no assertion errors
- [ ] No data files were modified

---

### Task 1.3 — CLI Entry Point & readline Loop

**Prompt:** `build phase 1 task 3`

**What to build:**
`index.js` — the main CLI entry point. Banner:

```
╔══════════════════════════════════════════════════╗
║         CashGuardian CLI  💼                     ║
║   Talk to your finances in plain English         ║
║   Powered by free AI  |  Indian SME Edition      ║
╚══════════════════════════════════════════════════╝
Type your question or "help". Type "exit" to quit.

>
```

- Read user input via Node.js `readline`
- Pass input to `agent/queryAgent.js` (stub: returns `"Query received: <input>"`)
- Print response, loop until `exit`
- Handle Ctrl+C gracefully (no stack trace)

**Acceptance criteria:**
- [ ] Banner displays correctly on `node index.js`
- [ ] Typing any query echoes "Query received: <query>"
- [ ] `exit` and Ctrl+C both quit cleanly

---

### Task 1.4 — Formatter Utility

**Prompt:** `build phase 1 task 4`

**What to build:**
`utils/formatter.js`:

```js
printHeader(title)          // ══════ TITLE ══════
printRow(label, value)      //  • Label:  ₹value
printTable(rows, columns)   // ASCII table
printAlert(message, level)  // level: 'info'|'warn'|'danger'
printDivider()              // ─────────────────────
formatCurrency(amount)      // "₹9,25,500" (Indian lakh style)
formatDate(dateStr)         // "11 Apr 2026"
```

**Acceptance criteria:**
- [ ] Each function has JSDoc with `@param` and `@returns`
- [ ] `printAlert` prefix: `🟢` info, `🟡` warn, `🔴` danger
- [ ] `formatCurrency(925500)` returns `"₹9,25,500"` — Indian number system (not Western)
- [ ] `formatCurrency(-12500)` returns `"−₹12,500"` (negative shown clearly)

---

### Task 1.5 — Date Utility Wrapper

**Prompt:** `build phase 1 task 5`

**What to build:**
`utils/dateUtils.js` — wraps `date-fns`:

```js
isOverdue(dueDateStr)        // true if dueDate < today (strict less than)
daysPastDue(dueDateStr)      // integer days overdue (0 if not overdue)
daysUntil(futureDateStr)     // integer days from today
getDateRange(days)           // { from: Date, to: Date } for last N days
formatForDisplay(dateStr)    // "11 Apr 2026"
getCurrentWeekLabel()        // "2026-W15"
```

**Acceptance criteria:**
- [ ] All functions have JSDoc
- [ ] `isOverdue` returns `false` for today's date (not overdue until tomorrow)
- [ ] Tests in `tests/dateUtils.test.js` with ≥6 meaningful test cases

---

## Phase 2 — Core Intelligence

**Goal:** Real AI API integration. Users ask financial questions in plain English and get accurate, data-grounded answers.

> **Where the API call happens: Task 2.5 only.**
> Everything before Task 2.5 is pure logic — no external calls.
> Set up your free API key before starting Task 2.5. See `AI_PROVIDER_SETUP.md`.

---

### Task 2.1 — Intent Classifier

**Prompt:** `build phase 2 task 1`

**What to build:**
`agent/intentMap.js` — deterministic keyword → intent mapping:

```js
const INTENTS = {
  CASH_BALANCE:      "cash_balance",
  CASH_SUMMARY:      "cash_summary",
  OVERDUE_INVOICES:  "overdue_invoices",
  RISK_CLIENTS:      "risk_clients",
  PREDICTION:        "cash_prediction",
  EXPENSE_BREAKDOWN: "expense_breakdown",
  SEND_REMINDER:     "send_reminder",
  ANOMALY:           "anomaly_detect",
  WEEKLY_SUMMARY:    "weekly_summary",
  COMPARE:           "compare",
  HELP:              "help",
  UNKNOWN:           "unknown"
};
```

**Keyword rules (case-insensitive, checked in order):**

| Keywords | Intent |
|---|---|
| "balance", "how much cash", "current cash" | `cash_balance` |
| "summary", "overview", "cash flow" | `cash_summary` |
| "overdue", "unpaid", "late invoice" | `overdue_invoices` |
| "risk", "at risk", "won't pay", "bad client" | `risk_clients` |
| "predict", "forecast", "next 30", "future" | `cash_prediction` |
| "expense", "spending", "costs", "breakdown" | `expense_breakdown` |
| "send", "remind", "email", "reminder" | `send_reminder` |
| "anomaly", "spike", "unusual", "weird", "sudden" | `anomaly_detect` |
| "weekly", "this week", "digest" | `weekly_summary` |
| "compare", "vs", "versus", "last month", "this month" | `compare` |
| "help", "what can you", "commands" | `help` |

Export: `classifyIntent(userInput: string): string`

**Acceptance criteria:**
- [ ] All INTENTS exported as named constants
- [ ] `classifyIntent` returns correct intent for all rows above
- [ ] Returns `UNKNOWN` for unrecognised input
- [ ] Unit tests in `tests/intentMap.test.js` with ≥15 test cases

---

### Task 2.2 — Cash Flow Service

**Prompt:** `build phase 2 task 2`

**What to build:**
`services/cashFlowService.js`:

```js
/**
 * Returns current net cash position.
 * Ground truth: income=925500, expenses=938000, net=-12500
 * @returns {{ totalIncome: number, totalExpenses: number, netBalance: number }}
 */
getCashBalance()

/**
 * Returns cash flow summary for last N days.
 * @param {number} days - default 30
 * @returns {{ period: string, income: number, expenses: number, net: number, topExpenseCategory: string }}
 */
getCashSummary(days = 30)

/**
 * Returns expenses grouped by category with percentages.
 * Ground truth: salaries=360000(38%), logistics=318000(34%), rent=180000(19%)
 * @returns {Array<{ category: string, total: number, percentage: string }>}
 */
getExpenseBreakdown()

/**
 * Compares current period vs previous period.
 * @param {'week' | 'month'} period
 * @param {number} unitsBack - default 1
 * @returns {{ current, previous, deltas: { income, expenses, net }, narrative: string }}
 */
comparePeriods(period, unitsBack = 1)
```

**Acceptance criteria:**
- [ ] Reads `data/transactions.json` synchronously — no async
- [ ] `getCashBalance()` returns netBalance of exactly −12500
- [ ] `getExpenseBreakdown()` sorted descending by total
- [ ] Tests in `tests/cashFlowService.test.js` with ≥6 test cases

---

### Task 2.3 — Invoice Service

**Prompt:** `build phase 2 task 3`

**What to build:**
`services/invoiceService.js`:

```js
/**
 * Returns all overdue invoices sorted by days overdue descending.
 * Ground truth: 4 overdue invoices, total ₹215500
 * @returns {Array<{ id, client, amount, dueDate, daysOverdue }>}
 */
getOverdueInvoices()

/**
 * Returns all invoices for a named client.
 * @param {string} clientName
 * @returns {Array<invoice>}
 */
getInvoicesByClient(clientName)

/**
 * Returns invoices due within N days (upcoming, not yet overdue).
 * @param {number} days - default 7
 */
getUpcomingDue(days = 7)
```

**Acceptance criteria:**
- [ ] `getOverdueInvoices` uses `dateUtils.isOverdue` — no duplicate date logic
- [ ] Returns empty array (not error) when no overdue invoices
- [ ] `getInvoicesByClient("Sharma Retail")` returns 4 invoices
- [ ] Tests in `tests/invoiceService.test.js` with ≥5 test cases

---

### Task 2.4 — Risk Service

**Prompt:** `build phase 2 task 4`

**What to build:**
`services/riskService.js` using this exact formula:

```
riskScore = (latePaymentCount × 30) + (avgDaysLate × 2) + (hasCurrentOverdue ? 10 : 0)
```

Where:
- `latePaymentCount` = invoices where `paymentHistory[0] > dueDate`
- `avgDaysLate` = mean days between dueDate and actual payment across late invoices
- `hasCurrentOverdue` = client has a currently overdue invoice

Risk label:
- score ≥ 60 → `HIGH`
- score 30–59 → `MEDIUM`
- score < 30 → `LOW`

```js
/**
 * Returns risk assessment for all clients.
 * Ground truth: Sharma Retail = HIGH (score ~116), Patel Distributors = MEDIUM
 * @returns {Array<{ client, riskScore, riskLevel, latePayments, overdueAmount, recommendation }>}
 */
getRiskReport()

/**
 * @param {string} clientName
 */
getClientRisk(clientName)
```

`recommendation` strings:
- HIGH → `"Require advance payment or stop credit"`
- MEDIUM → `"Send immediate payment reminder"`
- LOW → `"Monitor — no action needed"`

**Acceptance criteria:**
- [ ] Sharma Retail scores HIGH (3 late + 1 overdue = score ≥ 60)
- [ ] Kapoor Traders scores LOW (all paid on time)
- [ ] Formula is in `docs/methodology.md` — not just in code
- [ ] Tests in `tests/riskService.test.js` with ≥5 test cases

---

### Task 2.5 — Query Agent (AI API Integration)

**Prompt:** `build phase 2 task 5`

> ⚠️ **This task requires a free API key. Set AI_PROVIDER and AI_API_KEY in .env first.**
> Recommended: Gemini 1.5 Flash from aistudio.google.com (free, no credit card).
> Full setup instructions: `AI_PROVIDER_SETUP.md`

**What to build:**
`agent/queryAgent.js` — the brain of the CLI:

1. Receive raw user query string
2. Classify intent via `intentMap.classifyIntent()`
3. Fetch real data from the appropriate service(s)
4. Build a system prompt with injected financial snapshot (use `buildSystemPrompt` from AGENTS.md)
5. Call AI via `callAI(systemPrompt, userQuery)` (use provider pattern from AGENTS.md exactly)
6. Return response to CLI

**Intent routing table:**

| Intent | Services to call | AI call? |
|---|---|---|
| `cash_balance` | `cashFlowService.getCashBalance()` | ✅ yes |
| `cash_summary` | `cashFlowService.getCashSummary()` | ✅ yes |
| `overdue_invoices` | `invoiceService.getOverdueInvoices()` | ✅ yes |
| `risk_clients` | `riskService.getRiskReport()` | ✅ yes |
| `cash_prediction` | `predictionService.getCashPrediction()` | ✅ yes |
| `expense_breakdown` | `cashFlowService.getExpenseBreakdown()` | ✅ yes |
| `anomaly_detect` | `anomalyService.detectAnomalies()` | ✅ yes |
| `weekly_summary` | `summaryService.generateSummary('weekly')` | ✅ yes (inside service) |
| `compare` | `cashFlowService.comparePeriods()` | ✅ yes |
| `send_reminder` | `invoiceService` + `emailService` | ❌ no (direct action) |
| `help` | hardcoded help text | ❌ no |
| `unknown` | all services (build full snapshot) | ✅ yes — let AI interpret |

**Error handling:**
- If `AI_API_KEY` is not set → print `🔴 AI_API_KEY not set. Add it to .env (see AI_PROVIDER_SETUP.md)` — do not crash
- If AI call fails → call `fallbackResponse()` — do not crash
- If intent is `send_reminder` but no client name found in query → ask user to specify

**Acceptance criteria:**
- [ ] AI call uses the provider pattern from AGENTS.md exactly
- [ ] System prompt contains real numbers from services (not hardcoded)
- [ ] Works with Gemini, Groq, and OpenRouter (switching only requires `.env` change)
- [ ] Falls back gracefully when API is unavailable
- [ ] `send_reminder` triggers email, not AI

---

### Task 2.6 — Email Service

**Prompt:** `build phase 2 task 6`

**What to build:**
`services/emailService.js`:

```js
/**
 * Sends a payment reminder email to an overdue client.
 * @param {{ client: string, amount: number, daysOverdue: number, invoiceId: string }} invoiceData
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
sendPaymentReminder(invoiceData)
```

Email template (plain text):

```
Subject: Payment Reminder — Invoice #{invoiceId} Overdue by {daysOverdue} Days

Dear {client},

This is a friendly reminder that Invoice #{invoiceId} for ₹{amount}
was due {daysOverdue} days ago and remains unpaid.

Please arrange payment at your earliest convenience to avoid further delays.

Warm regards,
Mehta Wholesale Traders
(Sent via CashGuardian CLI)
```

**Acceptance criteria:**
- [ ] All SMTP config from `process.env` only
- [ ] Returns `{ success: false, error }` on failure — never throws
- [ ] Uses `formatter.printAlert` to show result in CLI, not `console.log`

---

## Phase 3 — Insights Engine

**Goal:** Implement all 4 hackathon use cases: Understand what changed, Compare, Breakdown, Summarise.

---

### Task 3.1 — 30-Day Cash Flow Prediction

**Prompt:** `build phase 3 task 1`

**What to build:**
`services/predictionService.js`:

**Algorithm:**
1. Calculate average weekly income and expenses from last 8 weeks of `transactions.json`
2. Identify upcoming invoices from `invoices.json` (status = `unpaid`) as projected income
3. Project forward 4 weeks in weekly buckets
4. Flag `cashRunoutRisk: true` if any projected week balance drops below ₹10,000

```js
/**
 * Projects cash position for next 30 days.
 * @returns {{
 *   currentBalance: number,
 *   projections: Array<{ week: string, expectedIncome: number, expectedExpenses: number, projectedBalance: number }>,
 *   lowestPoint: { week: string, balance: number },
 *   cashRunoutRisk: boolean,
 *   riskMessage: string | null
 * }}
 */
getCashPrediction()
```

**Ground truth check:** `currentBalance` must equal the result of `cashFlowService.getCashBalance().netBalance` (−12,500). The 3 upcoming invoices total ₹1,81,000 and should appear as projected income.

**Acceptance criteria:**
- [ ] Returns exactly 4 weekly projections
- [ ] `cashRunoutRisk: true` because starting balance is already negative
- [ ] `currentBalance` matches cashFlowService (−12,500)
- [ ] Tests in `tests/predictionService.test.js` with ≥4 test cases

---

### Task 3.2 — Anomaly Detection Service

**Prompt:** `build phase 3 task 2`

**What to build:**
`services/anomalyService.js`:

**Algorithm:**
- For each category, compute 8-week rolling average
- Flag as anomaly if current week deviates > 25% from rolling average
- Severity: `low` 25–40%, `medium` 40–70%, `high` > 70%

```js
/**
 * Detects anomalies in income and expense patterns.
 * @returns {Array<{
 *   type: 'income' | 'expense',
 *   category: string,
 *   week: string,
 *   actual: number,
 *   expected: number,
 *   deviation: string,
 *   severity: 'low' | 'medium' | 'high',
 *   explanation: string
 * }>}
 */
detectAnomalies()
```

**Ground truth:** Must detect:
- Logistics spike in W08 (~72% above average → severity `high`)
- Sales spike in W10 (~38% above average → severity `medium`)

`explanation` example:
> "Logistics expenses in week 2026-W08 were ₹36,000 — 72% higher than the usual ₹21,000. This may indicate a one-off bulk shipment or rate increase."

**Acceptance criteria:**
- [ ] Both pre-seeded anomalies detected
- [ ] `explanation` uses actual numbers from the data
- [ ] Tests in `tests/anomalyService.test.js` with ≥4 test cases

---

### Task 3.3 — Summary Service

**Prompt:** `build phase 3 task 3`

**What to build:**
`services/summaryService.js`:

```js
/**
 * Generates a narrative summary using AI.
 * Calls the AI provider — falls back to rule-based if unavailable.
 * @param {'weekly' | 'monthly'} period
 * @returns {Promise<string>}
 */
generateSummary(period)
```

AI prompt must include:
- Period income, expenses, net
- Anomalies from `anomalyService.detectAnomalies()`
- Overdue count and total from `invoiceService.getOverdueInvoices()`
- Top risk client from `riskService.getRiskReport()`
- WoW or MoM delta from `cashFlowService.comparePeriods()`

Expected AI output style (narrative prose — not bullet points):
> "This week, Mehta Wholesale Traders brought in ₹42,000 and spent ₹65,000, resulting in a net outflow of ₹23,000. Revenue is down compared to last week. ⚠️ 4 invoices remain overdue totalling ₹2,15,500 — collecting from Sharma Retail (₹96,000) should be the immediate priority. No new spending anomalies detected this week."

**Acceptance criteria:**
- [ ] Output is narrative prose — not a bullet list
- [ ] All numbers are sourced from services — never hardcoded
- [ ] Rule-based fallback works when AI is unavailable

---

### Task 3.4 — Update Query Agent for Phase 3 Intents

**Prompt:** `build phase 3 task 4`

**What to do:**
Update `agent/queryAgent.js` to wire in Phase 3 services (anomaly, summary, prediction enhancement):

- `anomaly_detect` → call `anomalyService.detectAnomalies()`, pass results to AI for narrative explanation
- `weekly_summary` → call `summaryService.generateSummary('weekly')`
- `compare` → call `cashFlowService.comparePeriods()`, AI generates narrative
- `cash_prediction` → enhance: show `🔴 CASH RUNOUT RISK` alert if `cashRunoutRisk === true`

Update `help` text to include all new commands.

**Acceptance criteria:**
- [ ] All 4 intents produce data-grounded, readable CLI output
- [ ] `cash_prediction` shows red alert when `cashRunoutRisk === true`
- [ ] `help` output is updated with all 11 commands

---

## Phase 4 — Polish & Submission

**Goal:** Tests passing, docs complete, code clean, submission-ready.

---

### Task 4.1 — Full Test Suite

**Prompt:** `build phase 4 task 1`

Minimum coverage required:

| Test file | Min cases | Key things to test |
|---|---|---|
| `cashFlowService.test.js` | 6 | netBalance = −12500, top expense = salaries |
| `invoiceService.test.js` | 5 | exactly 4 overdue, Sharma has 4 invoices |
| `riskService.test.js` | 5 | Sharma = HIGH, Kapoor = LOW, formula correct |
| `predictionService.test.js` | 4 | 4 projections, cashRunoutRisk = true |
| `anomalyService.test.js` | 4 | logistics spike detected, sales spike detected |
| `intentMap.test.js` | 15 | all keyword rows, UNKNOWN fallback |
| `dateUtils.test.js` | 6 | isOverdue false for today, daysPastDue correct |

Tests must be meaningful assertions — not just `expect(x).toBeDefined()`.

**Acceptance criteria:**
- [ ] `npm test` passes with 0 failures
- [ ] ≥45 total test cases across all files

---

### Task 4.2 — README (Hackathon-Grade)

**Prompt:** `build phase 4 task 2`

Must contain in order:

1. Project name + one-line tagline
2. Problem statement (Indian SME context, cite World Bank MSME stat)
3. Solution — maps to 3 hackathon pillars: Clarity, Trust, Speed
4. Hackathon use case coverage table (all 4 use cases)
5. Technical depth:
   - AI approach: free-tier provider abstraction (Gemini/Groq/OpenRouter)
   - Why context injection prevents hallucination (not fine-tuning)
   - ASCII architecture diagram
   - Data flow diagram
   - Dataset: synthetic + validated against IBM Finance Factoring, UCI Online Retail II, World Bank MSME
6. Features table
7. Installation (copy-pasteable, includes AI_PROVIDER setup step)
8. Usage examples (real queries with real output using actual ₹ numbers from dataset)
9. Tech stack table
10. Benchmark summary (link to `BENCHMARK.md`, state max score 55)
11. Limitations (honest)
12. Future improvements
13. License: Apache 2.0

**Acceptance criteria:**
- [ ] All 4 hackathon use cases covered in table
- [ ] Dataset validation references included
- [ ] AI provider setup section present (free tier emphasis)
- [ ] Architecture diagram present

---

### Task 4.3 — Architecture & Methodology Docs

**Prompt:** `build phase 4 task 3`

**`docs/architecture.md`** must cover:
- Full layered diagram
- Query lifecycle: user → intentMap → services → AI → formatter → user
- AI provider abstraction diagram (how switching providers works)
- Secret handling: env vars only, never logged

**`docs/methodology.md`** must cover:
- Intent classification: keyword-first, AI fallback for UNKNOWN
- Risk scoring formula (exact as in Task 2.4)
- Anomaly detection: rolling average, 25%/40%/70% thresholds, rationale
- 30-day prediction: algorithm steps, how upcoming invoices are used
- Dataset: what public datasets informed the synthetic data (IBM, UCI, World Bank)

**Acceptance criteria:**
- [ ] Both files complete and well-structured markdown
- [ ] Risk formula shown explicitly in methodology.md
- [ ] Dataset validation section present in methodology.md

---

### Task 4.4 — Code Cleanup & Compliance

**Prompt:** `build phase 4 task 4`

- Remove all `console.log` from `services/` and `agent/` — replace with formatter calls
- Ensure `.env.example` has all keys (AI_PROVIDER, AI_API_KEY, AI_MODEL, email fields)
- Remove any temporary scripts or debug files
- Verify every exported function has JSDoc with `@param` and `@returns`
- Verify all file headers have a one-line description comment
- Run `npm test` — must pass 0 failures

**Acceptance criteria:**
- [ ] `grep -r "console.log" services/ agent/` returns nothing
- [ ] `.env.example` complete
- [ ] `npm test` passes

---

### Task 4.5 — CLI Usage Reference

**Prompt:** `build phase 4 task 5`

`docs/cli-usage.md` — full command reference with realistic sample outputs using actual dataset numbers.

Document all 11 commands with sample output:

1. `What is my current cash balance?` → shows ₹−12,500
2. `Give me a cash flow summary` → income ₹9,25,500 / expenses ₹9,38,000
3. `Show me all overdue invoices` → 4 invoices, ₹2,15,500 total
4. `Which clients are at risk of not paying?` → Sharma Retail HIGH
5. `What will my cash look like in 30 days?` → 4-week projection + 🔴 alert
6. `Show me expense breakdown` → salaries 38%, logistics 34%, rent 19%
7. `Are there any unusual patterns in my spending?` → logistics spike W08
8. `Give me a weekly summary` → narrative prose
9. `Compare this month vs last month` → deltas with % change
10. `Send a payment reminder to Sharma Retail` → email sent confirmation
11. `help` → full command list

**Acceptance criteria:**
- [ ] All 11 commands shown with realistic output
- [ ] All money formatted as ₹X,XX,XXX (Indian style)
- [ ] File under 250 lines

---

## Quick Reference — All Build Commands

```bash
# Phase 1 — Foundation
build phase 1 task 1   # Project scaffold + .env.example
build phase 1 task 2   # Verify pre-generated data files
build phase 1 task 3   # CLI entry point + readline loop
build phase 1 task 4   # Formatter utility
build phase 1 task 5   # Date utility wrapper

# Phase 2 — Core Intelligence  (API key needed from Task 5 onwards)
build phase 2 task 1   # Intent classifier (keyword mapping)
build phase 2 task 2   # Cash flow service
build phase 2 task 3   # Invoice service
build phase 2 task 4   # Risk service
build phase 2 task 5   # Query agent — FREE AI API integration ← API call lives here
build phase 2 task 6   # Email service (Nodemailer)

# Phase 3 — Insights Engine
build phase 3 task 1   # 30-day cash prediction
build phase 3 task 2   # Anomaly detection
build phase 3 task 3   # Summary service (AI narrative)
build phase 3 task 4   # Agent wiring for Phase 3 intents

# Phase 4 — Polish & Submission
build phase 4 task 1   # Full test suite (≥45 test cases)
build phase 4 task 2   # README (hackathon-grade)
build phase 4 task 3   # Architecture + methodology docs
build phase 4 task 4   # Code cleanup + compliance
build phase 4 task 5   # CLI usage reference
```