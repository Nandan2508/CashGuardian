# Methodology

Every insight in CashGuardian is derived from deterministic formulas before being narrated by AI. The AI explains — it does not calculate.

---

## Intent Classification

CashGuardian starts with deterministic keyword matching in `intentMap.js`. This keeps common finance questions predictable and fast. AI is used as a fallback for `UNKNOWN` or narrative-heavy queries, not as the source of truth for metrics.

Intent matching is:
- case-insensitive
- checked in documented rule order
- designed to map user phrasing into service calls before any AI formatting step

```mermaid
flowchart TD
    A[User Input] --> B[intentMap.js]
    B -->|keyword match| C[Service Layer]
    B -->|UNKNOWN| D[AI Provider]
    C --> E[Formatted Response]
    D --> E
```

---

## Risk Scoring

Risk scoring determines client reliability based on payment history.

```mermaid
flowchart TD
    A[Client Invoice Data] --> B{Calculate Score}
    B --> C[Late Payment Count x 30]
    B --> D[Avg Days Late x 2]
    B --> E[Current Overdue? +10]
    C & D & E --> F[Total Risk Score]
    F -->|>= 60| G[HIGH RISK]
    F -->|30 - 59| H[MEDIUM RISK]
    F -->|< 30| I[LOW RISK]
    G --> G1[Stop credit / require advance payment]
    H --> H1[Send immediate reminder]
    I --> I1[Monitor only]
```

The formula is fixed:

```text
riskScore = (latePaymentCount × 30) + (avgDaysLate × 2) + (hasCurrentOverdue ? 10 : 0)
```

Where:
- `latePaymentCount` — invoices where `paymentHistory[0] > dueDate`
- `avgDaysLate` — average days late across those invoices
- `hasCurrentOverdue` — adds 10 points if client has a currently overdue invoice

Risk bands:
- `HIGH` — score >= 60
- `MEDIUM` — score 30–59.99
- `LOW` — score < 30

---

## Anomaly Detection

Anomalies are detected using a rolling baseline to filter out normal operational noise.

```mermaid
flowchart LR
    L[Transaction Ledger] --> B[Weekly Categorisation]
    B --> W1[Previous weeks]
    B --> W2[Current week]
    W1 --> AVG[Rolling Average - up to 8 weeks]
    AVG --> COMP{Deviation from baseline?}
    COMP -->|> 70%| HIGH[High severity]
    COMP -->|40% - 70%| MED[Medium severity]
    COMP -->|25% - 40%| LOW[Low severity]
    COMP -->|< 25%| OK[Normal noise]
```

Algorithm:
1. Build weekly totals from the transaction ledger, grouped by `type + category`
2. For each week, calculate a rolling average from up to the previous 8 non-zero weeks
3. Flag an anomaly when the current week deviates more than 25% above baseline
4. Assign severity:

```text
low:    25% – 40%
medium: 40% – 70%
high:   > 70%
```

Rationale:
- 25% is large enough to ignore normal operating noise
- 40% indicates a materially unusual change that deserves attention
- 70% captures genuinely sharp operational spikes

---

## 30-Day Prediction

The predictor is intentionally simple and transparent — explainable and easy to benchmark.

Algorithm:
1. Calculate average weekly income and expenses from the last 8 transaction weeks
2. Identify upcoming invoices with `status = "unpaid"`
3. Spread forward into 4 weekly projection buckets
4. Add invoice due amounts into the matching future week as projected inflow
5. Flag `cashRunoutRisk` if the balance starts below or dips below ₹10,000

This is not a full forecasting model — it is a transparent projection that any user can verify manually.

---

## Context Injection

When AI is used, CashGuardian injects a live financial snapshot into the system prompt rather than asking the model to infer numbers from scratch.

```mermaid
flowchart TD
    Q[User Query] --> SVC[Service Calls]
    SVC --> SNAP[Metric Snapshot]
    SNAP --> P[System Prompt]
    P --> DATA[Live financial stats]
    P --> VAL[External validation context]
    DATA & VAL --> AI[AI Provider]
    AI --> RESP[Narrative Response]
```

The snapshot includes:
- cash balance
- total income and expenses
- overdue invoice totals
- high-risk clients
- top expense category

This approach was chosen over fine-tuning because it keeps answers deterministic and auditable — every number in the AI response traces back to a specific line in the local JSON files. The AI explains the numbers; it does not produce them.

CashGuardian also injects external validation notes from `data/externalValidation.json`:
- IBM Finance Factoring insights for late-payment realism
- UCI Online Retail II insights for sales-band realism
- World Bank MSME insights for cost-structure realism

These references do not replace the local financial dataset. They only provide grounded context for narrative quality.

---

## Dataset Validation

The synthetic dataset was informed by public sources:
- IBM Finance Factoring late-payment histories
- UCI Online Retail II
- World Bank MSME Country Indicators

These references were used to validate:
- realistic invoice delay patterns
- plausible wholesale sales levels
- SME cost structures where salaries and logistics dominate expenses

The project treats the locked local JSON files as the final source of truth when benchmark docs and raw data disagree.