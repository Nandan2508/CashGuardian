const {
  CASH_BALANCE,
  CASH_SUMMARY,
  OVERDUE_INVOICES,
  RISK_CLIENTS,
  PREDICTION,
  EXPENSE_BREAKDOWN,
  SEND_REMINDER,
  ANOMALY,
  WEEKLY_SUMMARY,
  COMPARE,
  HELP,
  UNKNOWN,
  classifyIntent
} = require("../agent/intentMap");

describe("classifyIntent", () => {
  test.each([
    ["What is my balance?", CASH_BALANCE],
    ["How much cash do we have?", CASH_BALANCE],
    ["Show current cash right now", CASH_BALANCE],
    ["Give me a summary", CASH_SUMMARY],
    ["Need a cash flow overview", CASH_SUMMARY],
    ["Show overdue invoices", OVERDUE_INVOICES],
    ["Any unpaid bills?", OVERDUE_INVOICES],
    ["Which clients are at risk?", RISK_CLIENTS],
    ["Who won't pay?", RISK_CLIENTS],
    ["Predict the next 30 days", PREDICTION],
    ["Future forecast please", PREDICTION],
    ["Expense breakdown", EXPENSE_BREAKDOWN],
    ["Show spending costs", EXPENSE_BREAKDOWN],
    ["Send reminder to Sharma Retail", SEND_REMINDER],
    ["Email a reminder", SEND_REMINDER],
    ["Any anomaly this week?", ANOMALY],
    ["Why was there a spike?", ANOMALY],
    ["Weekly digest", WEEKLY_SUMMARY],
    ["Compare this month vs last month", COMPARE],
    ["Help", HELP],
    ["What can you do?", HELP]
  ])("maps '%s' to %s", (input, expectedIntent) => {
    expect(classifyIntent(input)).toBe(expectedIntent);
  });

  test("returns UNKNOWN for unrelated input", () => {
    expect(classifyIntent("hello there")).toBe(UNKNOWN);
  });

  test("returns UNKNOWN for empty input", () => {
    expect(classifyIntent("")).toBe(UNKNOWN);
  });

  test("respects the documented rule order", () => {
    expect(classifyIntent("cash flow balance")).toBe(CASH_BALANCE);
  });
});
