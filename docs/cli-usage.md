# CLI Usage Reference

## Commands

### 1. Current balance

```text
> What is my current cash balance?
Current net cash balance is −₹12,500.
Income: ₹9,25,500 | Expenses: ₹9,38,000
Recommendation: prioritise overdue collections immediately.
```

### 2. Cash flow summary

```text
> Give me a cash flow summary
Over the latest tracked period, income was ₹2,60,000 and expenses were ₹2,92,500.
Net cash flow was −₹32,500, with salaries as the top expense category.
```

### 3. Overdue invoices

```text
> Show me all overdue invoices
4 invoices are overdue, totalling ₹2,15,500.
INV014 Sharma Retail        ₹96,000  20 days overdue
INV015 Gupta Enterprises    ₹54,000  14 days overdue
INV016 Patel Distributors   ₹38,500   8 days overdue
INV017 Verma & Sons         ₹27,000   4 days overdue
```

### 4. Risky clients

```text
> Which clients are at risk of not paying?
Sharma Retail is HIGH risk with score 134.67 and ₹96,000 currently overdue.
Patel Distributors is also elevated with score 62.
Recommendation: require advance payment or stop credit for the highest-risk accounts.
```

### 5. 30-day cash prediction

```text
> What will my cash look like in 30 days?
Starting balance: −₹12,500
🔴 CASH RUNOUT RISK — collect ₹2,15,500 in overdue invoices before expenses fall due.
2026-W16 -> income ₹1,32,313 | expenses ₹72,188 | balance ₹47,625
2026-W17 -> income ₹71,313   | expenses ₹72,188 | balance ₹46,750
2026-W18 -> income ₹1,48,313 | expenses ₹72,188 | balance ₹1,22,875
2026-W19 -> income ₹1,14,313 | expenses ₹72,188 | balance ₹1,65,000
```

### 6. Expense breakdown

```text
> Show me expense breakdown
Salaries      ₹3,60,000  38%
Logistics     ₹3,18,000  34%
Rent          ₹1,80,000  19%
Marketing       ₹37,500   4%
Utilities       ₹33,500   4%
Miscellaneous    ₹9,000   1%
```

### 7. Spending anomalies

```text
> Are there any unusual patterns in my spending?
Logistics expenses in week 2026-W08 were ₹36,000, which is 72% above the usual ₹21,000 baseline.
This suggests an operational spike worth reviewing.
```

### 8. Weekly summary

```text
> Give me a weekly summary
This week, Mehta Wholesale Traders brought in ₹42,000 and spent ₹65,000, resulting in a net
outflow of ₹23,000. Compared with the previous week, the net position has improved by ₹80,000.
4 invoices remain overdue totalling ₹2,15,500, and Sharma Retail is the top payment risk.
Recent anomalies include sales in 2026-W10 (64%) and logistics in 2026-W08 (72%).
```

### 9. Period comparison

```text
> Compare this month vs last month
Current period:  2026-04-01 to 2026-04-10
Previous period: 2026-03-01 to 2026-03-31
Income delta:   −₹3,14,000
Expense delta:  −₹3,34,500
Net improvement: ₹20,500
```

### 10. Send reminder

```text
> Send a payment reminder to Sharma Retail
🟢 Payment reminder sent for invoice INV014.
```

### 11. Help

```text
> help
Available commands:
- current cash balance
- cash flow summary
- overdue invoices
- risky clients
- 30-day cash prediction
- expense breakdown
- spending anomalies
- weekly summary
- period comparison (this month vs last month)
- send payment reminder
- help
```
