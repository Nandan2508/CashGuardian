# AGENTS.md

> Codex agent instructions for CashGuardian CLI — "Talk to Data" Hackathon Edition.
> Run any phase/task combination with: `build phase <X> task <Y>`

---

## Project: CashGuardian CLI

**Hackathon Theme:** Talk to Data — Seamless Self-Service Intelligence
**Stack:** Node.js, Free AI API (Gemini / Groq / OpenRouter), readline, Nodemailer, date-fns, dotenv

---

## Agent Capabilities

This agent can scaffold, implement, test, and document any part of the CashGuardian CLI project. It operates across 4 phases:

| Phase | Name | Focus |
|---|---|---|
| 1 | Foundation | Project scaffold, data models, folder structure |
| 2 | Core Intelligence | NLP query engine, AI API integration, financial services |
| 3 | Insights Engine | Prediction, anomaly detection, risk scoring, summaries |
| 4 | Polish & Submission | Tests, README, architecture diagram, cleanup |

---

## Environment & Constraints

- **Working directory:** project root (`cashguardian-cli/`)
- **Node.js version:** 18+
- **Package manager:** npm
- **Secrets:** never hardcode — always use `process.env.*` via dotenv
- **Coding style:** descriptive names, JSDoc on all exported functions, no stray `console.log` in production paths
- **File creation rule:** never put all logic in one file — follow the layered architecture below

### Layered Architecture (enforced)

```
User Input (CLI)
      ↓
  agent/queryAgent.js       ← intent parsing + AI API routing
      ↓
  services/*.js             ← pure business logic, no I/O
      ↓
  data/*.json               ← flat-file simulated database (pre-generated, do not modify)
      ↓
  utils/formatter.js        ← all terminal output formatting
```

---

## Agent Rules

1. **Read `tasks.md` before writing any code.** Each task has explicit acceptance criteria.
2. **Check existing files before creating new ones** — extend, don't duplicate.
3. **After every file write, run `node --check <file>`** to verify syntax.
4. **After Phase 2+, run `npm test`** if tests exist.
5. **Never modify `data/*.json`** — schema and contents are pre-generated and benchmark-locked. Only update `docs/data-model.md` if you add a new field.
6. **Commit message format:** `feat(phaseX-taskY): short description` — signed off with `-s`.
7. **If a task is blocked** (missing dep, unclear spec), surface the blocker clearly and stop.

---

## File Map (target state after all phases)

```
cashguardian-cli/
├── index.js                        # CLI entry point
├── .env.example                    # env template (no real secrets)
├── package.json
├── jest.config.js
│
├── agent/
│   ├── queryAgent.js               # Intent classifier + AI API router
│   └── intentMap.js                # Keyword → intent mapping table
│
├── services/
│   ├── cashFlowService.js          # Balance, income, expense calcs
│   ├── invoiceService.js           # Overdue detection
│   ├── riskService.js              # Client risk scoring
│   ├── predictionService.js        # 30-day cash projection
│   ├── anomalyService.js           # Spike/drop anomaly detection
│   ├── summaryService.js           # Weekly/monthly narrative gen
│   └── emailService.js             # Nodemailer SMTP
│
├── data/
│   ├── transactions.json           # ✅ Pre-generated — do not modify
│   ├── invoices.json               # ✅ Pre-generated — do not modify
│   └── metrics.json                # ✅ Pre-generated — do not modify
│
├── utils/
│   ├── formatter.js                # Terminal output helpers
│   └── dateUtils.js                # Date helpers (wraps date-fns)
│
├── tests/
│   ├── cashFlowService.test.js
│   ├── invoiceService.test.js
│   ├── riskService.test.js
│   ├── predictionService.test.js
│   ├── anomalyService.test.js
│   ├── intentMap.test.js
│   ├── dateUtils.test.js
│   └── benchmark.js                # Automated benchmark runner
│
└── docs/
    ├── README.md
    ├── AGENTS.md                   ← this file
    ├── tasks.md
    ├── BENCHMARK.md
    ├── AI_PROVIDER_SETUP.md
    ├── architecture.md
    ├── data-model.md
    ├── methodology.md
    └── cli-usage.md
```

---

## ⚠️ AI API — No paid key required

The AI call happens in **one file only:** `agent/queryAgent.js`.
Provider is selected via the `AI_PROVIDER` env var. All three options have a free tier.

| Provider | Free Tier | Model to use | Get key |
|---|---|---|---|
| **Gemini** ⭐ recommended | 1M tokens/day, no card | `gemini-1.5-flash` | aistudio.google.com |
| **Groq** | 30 req/min, no card | `llama3-8b-8192` | console.groq.com |
| **OpenRouter** | Many free models | `mistralai/mistral-7b-instruct:free` | openrouter.ai |

**Use Gemini.** Most generous free tier, fastest for financial Q&A, no credit card.

### .env.example — Codex must generate this exactly

```env
# ─── AI Provider (free tier — no credit card needed) ─────────────────────────
# Options: gemini | groq | openrouter
AI_PROVIDER=gemini

# Free API key from your chosen provider
AI_API_KEY=your-api-key-here

# Model string — must match provider
# gemini-1.5-flash  (for Gemini)
# llama3-8b-8192    (for Groq)
# mistralai/mistral-7b-instruct:free  (for OpenRouter)
AI_MODEL=gemini-1.5-flash

# ─── Email / Nodemailer ───────────────────────────────────────────────────────
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=CashGuardian <your-email@gmail.com>
```

### AI call pattern — implement exactly as shown in queryAgent.js

```js
/**
 * Routes AI call to the configured provider.
 * @param {string} systemPrompt  - Financial snapshot injected as context
 * @param {string} userQuery     - Raw user input from CLI
 * @returns {Promise<string>}    - AI response text
 */
async function callAI(systemPrompt, userQuery) {
  const provider = process.env.AI_PROVIDER || "gemini";
  try {
    if (provider === "gemini") return await callGemini(systemPrompt, userQuery);
    return await callOpenAICompat(systemPrompt, userQuery);
  } catch (err) {
    return fallbackResponse();
  }
}

async function callGemini(systemPrompt, userQuery) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${process.env.AI_MODEL}:generateContent?key=${process.env.AI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + userQuery }] }],
      generationConfig: { maxOutputTokens: 500, temperature: 0.3 }
    })
  });
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

async function callOpenAICompat(systemPrompt, userQuery) {
  const baseUrl = process.env.AI_PROVIDER === "groq"
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://openrouter.ai/api/v1/chat/completions";
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.AI_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userQuery }
      ],
      max_tokens: 500,
      temperature: 0.3
    })
  });
  const data = await res.json();
  return data.choices[0].message.content;
}

function fallbackResponse() {
  return "AI service unavailable. Check AI_API_KEY and AI_PROVIDER in .env. " +
    "Financial data is still accessible — type 'help' for rule-based commands.";
}
```

### System prompt pattern — CRITICAL: inject real data to prevent hallucination

```js
function buildSystemPrompt(snapshot) {
  return `You are CashGuardian, a financial assistant for Mehta Wholesale Traders (Indian SME).
Today is ${new Date().toDateString()}.

=== LIVE FINANCIAL DATA ===
Net Cash Balance:      ₹${snapshot.netBalance.toLocaleString('en-IN')}
Total Income (90d):    ₹${snapshot.totalIncome.toLocaleString('en-IN')}
Total Expenses (90d):  ₹${snapshot.totalExpenses.toLocaleString('en-IN')}
Overdue Invoices:      ${snapshot.overdueCount} invoices worth ₹${snapshot.overdueTotal.toLocaleString('en-IN')}
High-Risk Clients:     ${snapshot.highRiskClients.join(', ')}
Top Expense Category:  ${snapshot.topExpenseCategory}
===========================

Rules:
- Answer ONLY from the data above. Never invent numbers.
- Be concise. Use plain English. Format money as ₹X,XX,XXX (Indian style).
- End with one actionable recommendation when relevant.`;
}
```

---

## Dataset (pre-generated — do not regenerate)

The `data/` folder is pre-built and benchmark-locked. Contents:

| File | Records | Key design facts |
|---|---|---|
| `transactions.json` | 51 records, 90 days | Net ₹−12,500; logistics anomaly W08 (+72%); revenue anomaly W10 (+38%) |
| `invoices.json` | 20 invoices | 4 overdue (₹2,15,500 total); Sharma Retail = HIGH risk (3/4 late) |
| `metrics.json` | 13 weekly snapshots | Powers WoW/MoM comparison feature |

**Public datasets used to validate and inform synthetic data design:**
- **IBM Finance Factoring — Late Payment Histories** (Kaggle: `hhenry/finance-factoring-ibm-late-payment-histories`) — validated risk score thresholds and late-payment detection logic
- **UCI Online Retail II** (archive.ics.uci.edu/dataset/502) — validated wholesale transaction amount ranges (CC BY 4.0)
- **World Bank MSME Country Indicators** (Kaggle: `theworldbank/msme-country-indicators-and-sources`) — validated Indian SME expense category proportions

See `BENCHMARK.md` for all ground-truth numbers and `docs/data-model.md` for full schema.

---

## Data Schema (read-only reference)

### transactions.json
```json
[{
  "id":          "TXN0001",
  "date":        "YYYY-MM-DD",
  "type":        "income | expense",
  "amount":      123000,
  "category":    "sales | consulting | refund | rent | salaries | logistics | utilities | marketing | miscellaneous",
  "description": "Human-readable label",
  "client":      "Client Name | null"
}]
```

### invoices.json
```json
[{
  "id":             "INV001",
  "client":         "Client Name",
  "amount":         96000,
  "issueDate":      "YYYY-MM-DD",
  "dueDate":        "YYYY-MM-DD",
  "status":         "paid | unpaid | overdue",
  "paymentHistory": ["YYYY-MM-DD"]
}]
```

### metrics.json
```json
[{
  "week":             "2026-03-W09",
  "weekEndDate":      "YYYY-MM-DD",
  "revenue":          76000,
  "expenses":         52000,
  "newClients":       1,
  "overdueCount":     2,
  "avgDaysToPayment": 11
}]
```