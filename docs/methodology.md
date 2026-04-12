# Methodology

## Intent Classification

CashGuardian starts with deterministic keyword matching in `intentMap.js`. This keeps common finance questions predictable and fast. The intended architecture uses AI as a fallback for `UNKNOWN` or narrative-heavy queries, not as the source of truth for metrics.

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

## Risk Scoring

The Phase 2 risk score formula is fixed:

```text
riskScore = (latePaymentCount × 30) + (avgDaysLate × 2) + (hasCurrentOverdue ? 10 : 0)
```

Where:
- `latePaymentCount` is the number of invoices where `paymentHistory[0] > dueDate`
- `avgDaysLate` is the average number of days late across those invoices
- `hasCurrentOverdue` adds 10 points when a client currently has an overdue invoice

Risk bands:
- `HIGH` for scores `>= 60`
- `MEDIUM` for scores `30–59.99`
- `LOW` for scores `< 30`

Recommendations:
- `HIGH` → `Require advance payment or stop credit`
- `MEDIUM` → `Send immediate payment reminder`
- `LOW` → `Monitor — no action needed`

## Anomaly Detection

Anomaly detection uses weekly transaction buckets grouped by `type + category`.

Algorithm:
1. Build weekly totals from the transaction ledger
2. For each week, calculate a rolling average from up to the previous 8 non-zero weeks
3. Flag an anomaly when the current week is more than 25% above baseline
4. Assign severity bands:

```text
low:    25% – 40%
medium: 40% – 70%
high:   > 70%
```

Rationale:
- 25% is large enough to ignore normal operating noise
- 40% indicates a materially unusual change that deserves attention
- 70% captures genuinely sharp operational spikes

## 30-Day Prediction

The 30-day predictor is intentionally simple and transparent.

Algorithm:
1. Calculate average weekly income and expenses from the last 8 transaction weeks
2. Identify upcoming invoices with `status = "unpaid"`
3. Spread forward into 4 weekly projection buckets
4. Add invoice due amounts into the matching future week as projected inflow
5. Flag `cashRunoutRisk` if the business starts below or dips below the ₹10,000 buffer

This makes the projection explainable and easy to benchmark, even if it is not meant to be a full forecasting model.

## Context Injection

When AI is used, CashGuardian injects a live financial snapshot into the system prompt rather than asking the model to infer numbers from scratch. That snapshot includes:
- cash balance
- total income and expenses
- overdue invoice totals
- high-risk clients
- top expense category

This design prevents hallucinated finance facts and keeps the AI focused on explanation, not calculation. This approach was chosen over fine-tuning because it keeps answers deterministic and auditable — every number in the AI response traces back to a specific line in the local JSON files.

CashGuardian also injects external validation notes from `data/externalValidation.json`:
- IBM Finance Factoring insights for late-payment realism
- UCI Online Retail II insights for sales-band realism
- World Bank MSME insights for cost-structure realism

These references do not replace the local financial dataset. They only provide grounded context for narrative quality.

## Dataset Validation

The synthetic dataset was informed by public sources:
- IBM Finance Factoring late-payment histories
- UCI Online Retail II
- World Bank MSME Country Indicators

These references were used to validate:
- realistic invoice delay patterns
- plausible wholesale sales levels
- SME cost structures where salaries and logistics dominate expenses

The project still treats the locked local JSON files as the final source of truth when benchmark docs and raw data disagree.
