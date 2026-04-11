/**
 * Named intent constants for query routing.
 */
const INTENTS = {
  CASH_BALANCE: "cash_balance",
  CASH_SUMMARY: "cash_summary",
  OVERDUE_INVOICES: "overdue_invoices",
  RISK_CLIENTS: "risk_clients",
  PREDICTION: "cash_prediction",
  EXPENSE_BREAKDOWN: "expense_breakdown",
  SEND_REMINDER: "send_reminder",
  ANOMALY: "anomaly_detect",
  WEEKLY_SUMMARY: "weekly_summary",
  COMPARE: "compare",
  HELP: "help",
  UNKNOWN: "unknown"
};

const INTENT_RULES = [
  { intent: INTENTS.CASH_BALANCE, keywords: ["balance", "how much cash", "current cash"] },
  { intent: INTENTS.CASH_SUMMARY, keywords: ["summary", "overview", "cash flow"] },
  { intent: INTENTS.OVERDUE_INVOICES, keywords: ["overdue", "unpaid", "late invoice"] },
  { intent: INTENTS.RISK_CLIENTS, keywords: ["risk", "at risk", "won't pay", "bad client"] },
  { intent: INTENTS.PREDICTION, keywords: ["predict", "forecast", "next 30", "future", "30 days", "cash look like"] },
  { intent: INTENTS.EXPENSE_BREAKDOWN, keywords: ["expense", "spending", "costs", "breakdown"] },
  { intent: INTENTS.SEND_REMINDER, keywords: ["send", "remind", "email", "reminder"] },
  { intent: INTENTS.ANOMALY, keywords: ["anomaly", "spike", "unusual", "weird", "sudden"] },
  { intent: INTENTS.WEEKLY_SUMMARY, keywords: ["weekly", "this week", "digest"] },
  { intent: INTENTS.COMPARE, keywords: ["compare", "vs", "versus", "last month", "this month"] },
  { intent: INTENTS.HELP, keywords: ["help", "what can you", "commands"] }
];

/**
 * Classifies a raw user query into a deterministic intent.
 * @param {string} userInput - Raw user input from the CLI.
 * @returns {string} Matching intent constant.
 */
function classifyIntent(userInput) {
  const normalizedInput = String(userInput || "").trim().toLowerCase();

  if (!normalizedInput) {
    return INTENTS.UNKNOWN;
  }

  const matchingRule = INTENT_RULES.find((rule) =>
    rule.keywords.some((keyword) => normalizedInput.includes(keyword))
  );

  return matchingRule ? matchingRule.intent : INTENTS.UNKNOWN;
}

module.exports = {
  ...INTENTS,
  INTENTS,
  classifyIntent
};
