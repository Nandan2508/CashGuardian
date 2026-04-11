# Methodology

## Risk Scoring Formula

CashGuardian scores payment risk with the fixed Phase 2 formula:

```text
riskScore = (latePaymentCount × 30) + (avgDaysLate × 2) + (hasCurrentOverdue ? 10 : 0)
```

Where:

- `latePaymentCount` is the number of invoices whose first payment date is later than `dueDate`
- `avgDaysLate` is the average number of days late across those late invoices
- `hasCurrentOverdue` adds 10 points when the client currently has any overdue invoice

Risk bands:

- `HIGH` for scores `>= 60`
- `MEDIUM` for scores `30-59.99`
- `LOW` for scores `< 30`

Recommendations:

- `HIGH` -> `Require advance payment or stop credit`
- `MEDIUM` -> `Send immediate payment reminder`
- `LOW` -> `Monitor - no action needed`
