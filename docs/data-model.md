# Data Model & Dataset Documentation

> This document describes the three data files used by CashGuardian CLI,
> their schema, contents, and the public datasets used to validate them.

---

## The Business: Mehta Wholesale Traders

A fictional wholesale goods distributor based in Punjab, India.
The dataset covers **90 days of financial activity** (January–April 2026).

This is a **synthetic dataset** — purpose-built for this project.
It was validated for realism against three public datasets (see bottom of this document).

---

## `data/transactions.json`

All income and expense transactions for the last 90 days.

### Schema

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique ID — format `TXN0001` |
| `date` | string | `YYYY-MM-DD` |
| `type` | `"income"` \| `"expense"` | Direction of cash flow |
| `amount` | number | Indian Rupees (₹), always positive |
| `category` | string | See categories below |
| `description` | string | Human-readable label |
| `client` | string \| null | Client name for income; `null` for expenses |

### Income categories

| Category | Description |
|---|---|
| `sales` | Product sales to wholesale clients |
| `consulting` | Advisory or consulting fees |
| `refund` | GST refunds or returns received |

### Expense categories

| Category | Description |
|---|---|
| `salaries` | Monthly staff payroll |
| `rent` | Office and warehouse rent |
| `logistics` | Courier, delivery, and freight charges |
| `utilities` | Electricity, internet, phone |
| `marketing` | Digital ads and promotions |
| `miscellaneous` | Office supplies and sundry |

### Ground truth figures

| Metric | Value |
|---|---|
| Total records | 51 |
| Total income | ₹9,25,500 |
| Total expenses | ₹9,38,000 |
| **Net balance** | **₹−12,500** |
| Top expense: salaries | ₹3,60,000 (38%) |
| Second: logistics | ₹3,18,000 (34%) |
| Third: rent | ₹1,80,000 (19%) |
| Fourth: marketing | ₹37,500 (4%) |
| Fifth: utilities | ₹33,500 (4%) |
| Sixth: miscellaneous | ₹9,000 (1%) |

### Deliberate anomalies (for anomaly detection testing)

| Anomaly | Week | Actual | Expected avg | Deviation |
|---|---|---|---|---|
| Logistics cost spike | 2026-W08 | ₹36,000 | ~₹21,000 | +72% → severity `high` |
| Revenue/sales spike | 2026-W10 | ₹1,05,000 | ~₹64,000 | +64% → severity `medium` |

---

## `data/invoices.json`

All client invoices raised by Mehta Wholesale Traders.

### Schema

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique ID — format `INV001` |
| `client` | string | Client business name |
| `amount` | number | Invoice value in ₹ |
| `issueDate` | string | `YYYY-MM-DD` — date invoice was raised |
| `dueDate` | string | `YYYY-MM-DD` — payment deadline |
| `status` | `"paid"` \| `"unpaid"` \| `"overdue"` | Current status |
| `paymentHistory` | string[] | ISO dates of payments received (empty if unpaid) |

### Status definitions

| Status | Meaning |
|---|---|
| `paid` | Settled — check `paymentHistory[0]` vs `dueDate` for lateness |
| `unpaid` | Not yet due — upcoming invoice |
| `overdue` | Past `dueDate` with no payment |

### Late payment detection

An invoice counts as **late** if: `paymentHistory[0] > dueDate`

### Invoice breakdown

| Status | Count | Total Value |
|---|---|---|
| Paid on time | 8 | — |
| Paid late | 5 | — |
| **Overdue** | **4** | **₹2,15,500** |
| Upcoming (unpaid) | 3 | ₹1,81,000 |

### Overdue invoice detail

| Client | Invoice | Amount | Days Overdue |
|---|---|---|---|
| Sharma Retail | INV014 | ₹96,000 | 20 days |
| Gupta Enterprises | INV015 | ₹54,000 | 14 days |
| Patel Distributors | INV016 | ₹38,500 | 8 days |
| Verma & Sons | INV017 | ₹27,000 | 4 days |

### Client risk profile

| Client | Late Payments | Current Overdue | Risk Level |
|---|---|---|---|
| **Sharma Retail** | 3 of 4 | ₹96,000 | **HIGH** |
| Patel Distributors | 1 of 3 | ₹38,500 | MEDIUM |
| Gupta Enterprises | 0 of 3 | ₹54,000 | MEDIUM |
| Verma & Sons | 0 of 3 | ₹27,000 | LOW-MEDIUM |
| Kapoor Traders | 0 of 3 | None | LOW |

---

## `data/metrics.json`

Weekly KPI snapshots used by the comparison and summary features.

### Schema

| Field | Type | Description |
|---|---|---|
| `week` | string | e.g. `"2026-03-W09"` |
| `weekEndDate` | string | `YYYY-MM-DD` — Saturday of that week |
| `revenue` | number | Total income that week (₹) |
| `expenses` | number | Total expenses that week (₹) |
| `newClients` | number | New clients added |
| `overdueCount` | number | Overdue invoices at week end |
| `avgDaysToPayment` | number | Mean days from invoice issue to payment |

### Coverage

- 13 weekly snapshots (weeks 1–13 of the dataset period)
- Used by: `services/summaryService.js`, `services/cashFlowService.comparePeriods()`

---

## Public Datasets Used for Validation

The synthetic data was cross-validated against three public datasets to ensure realism:

### 1. IBM Finance Factoring — Late Payment Histories
- **Source:** Kaggle — `kaggle.com/datasets/hhenry/finance-factoring-ibm-late-payment-histories`
- **What it is:** Real accounts receivable data with invoice dates, due dates, and actual payment dates from B2B transactions
- **How we used it:** Confirmed that 3 late payments out of 4 invoices is a realistic signal for HIGH-risk client classification. Validated our risk score formula thresholds (score ≥ 60 = HIGH).
- **License:** Public / Kaggle Open

### 2. UCI Online Retail II
- **Source:** `archive.ics.uci.edu/dataset/502/online+retail+ii`
- **What it is:** 1M+ real wholesale transactions from a UK SME (2009–2011). Columns: InvoiceNo, InvoiceDate, CustomerID, Quantity, UnitPrice.
- **How we used it:** Validated that weekly sales of ₹30,000–₹1,05,000 are realistic for a wholesale SME at this scale (converted from GBP). Confirmed that 3–5 clients account for most revenue.
- **License:** CC BY 4.0

### 3. World Bank MSME Country Indicators
- **Source:** Kaggle — `kaggle.com/datasets/theworldbank/msme-country-indicators-and-sources`
- **What it is:** Macro-level data on MSME financial health, payment delays, and cost structures across countries including India.
- **How we used it:** Confirmed that salaries + logistics = ~70% of operating costs is realistic for Indian SMEs. Confirmed that 4–6 week payment delays are common in the sector.
- **License:** World Bank Open Data License

---

## Why not use a public dataset directly?

Public datasets don't have:
- Indian Rupee (₹) amounts at SME scale
- Named Indian clients (Sharma Retail, Gupta Enterprises, etc.)
- Invoice-level detail paired with transaction records
- Deliberately seeded anomalies to test detection

The synthetic approach lets us **design for all features** while still being **grounded in real patterns** via the validation above.

---

## Schema rules (enforced by AGENTS.md)

1. Never modify these files — they are benchmark-locked
2. All amounts are positive integers in Indian Rupees
3. All dates are `YYYY-MM-DD` strings (not Date objects)
4. `paymentHistory` is always an array (empty `[]` if no payments)
5. `client` in transactions is `null` for expense records, never an empty string