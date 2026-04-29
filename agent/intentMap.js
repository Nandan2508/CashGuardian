/**
 * Named intent constants for query routing.
 */
const INTENTS = {
  CASH_BALANCE: "cash_balance",
  CASH_SUMMARY: "cash_summary",
  OVERDUE_INVOICES: "overdue_invoices",
  RISK_CLIENTS: "risk_clients",
  EXPENSE_BREAKDOWN: "expense_breakdown",
  SEND_REMINDER: "send_reminder",
  ANOMALY: "anomaly_detect",
  WEEKLY_SUMMARY: "weekly_summary",
  COMPARE: "compare",
  DECOMPOSITION: "decomposition",
  PREDICTION: "prediction",
  HELP: "help",
  UNKNOWN: "unknown"
};

const INTENT_RULES = [
  { intent: INTENTS.OVERDUE_INVOICES, keywords: ["invoice", "invoices", "overdue", "unpaid", "late invoice", "pending invoice", "collectibles", "overdue summary"] },
  { intent: INTENTS.CASH_BALANCE, keywords: ["balance", "how much cash", "current cash", "money left", "funds", "how much money", "cash left"] },
  { intent: INTENTS.SEND_REMINDER, keywords: ["send", "remind", "email", "reminder", "mail", "notify", "send reminder"] },
  { intent: INTENTS.CASH_SUMMARY, keywords: ["summary", "summarise", "summarize", "overview", "cash flow", "performance summary", "financial state", "business summary", "business"] },
  { intent: INTENTS.RISK_CLIENTS, keywords: ["risk", "at risk", "won't pay", "bad client", "risky", "reliability"] },
  { intent: INTENTS.ANOMALY, keywords: ["anomaly", "spike", "unusual", "weird", "sudden", "deviation", "jump", "dip", "dipped", "drop", "dropped", "decline", "decrease", "revenue dipped"] },
  { intent: INTENTS.DECOMPOSITION, keywords: ["breakdown", "what makes up", "decomposition", "components of", "structure of"] },
  { intent: INTENTS.EXPENSE_BREAKDOWN, keywords: ["expense breakdown", "expense", "spending", "costs", "expenditure", "bills"] },
  { intent: INTENTS.SEND_REMINDER, keywords: ["send", "remind", "email", "reminder", "mail", "notify"] },
  { intent: INTENTS.WEEKLY_SUMMARY, keywords: ["weekly", "this week", "digest", "last 7 days"] },
  { intent: INTENTS.COMPARE, keywords: ["compare", "vs", "versus", "last month", "this month", "growth"] },
  { intent: INTENTS.PREDICTION, keywords: ["forecast", "predict", "next 30 days", "projected balance", "future", "likely balance"] },
  { intent: INTENTS.HELP, keywords: ["help", "what can you", "commands", "guide"] }
];

const INTENT_PRIORITIES = {
  [INTENTS.ANOMALY]: 100,
  [INTENTS.WEEKLY_SUMMARY]: 90,
  [INTENTS.DECOMPOSITION]: 80,
  [INTENTS.OVERDUE_INVOICES]: 70,
  [INTENTS.EXPENSE_BREAKDOWN]: 60,
  [INTENTS.PREDICTION]: 50,
  [INTENTS.COMPARE]: 40,
  [INTENTS.RISK_CLIENTS]: 30,
  [INTENTS.SEND_REMINDER]: 20,
  [INTENTS.CASH_BALANCE]: 15,
  [INTENTS.CASH_SUMMARY]: 10,
  [INTENTS.HELP]: 5,
  [INTENTS.UNKNOWN]: 0
};

/**
 * Classifies a raw user query into a deterministic intent using a scoring system.
 * This avoids misclassification when multiple intents share similar keywords.
 * @param {string} userInput - Raw user input from the CLI.
 * @returns {string} Matching intent constant.
 */
function classifyIntent(userInput) {
  const normalizedInput = String(userInput || "").trim().toLowerCase();

  if (!normalizedInput) {
    return INTENTS.UNKNOWN;
  }

  // Calculate scores for each intent based on keyword matches
  const scores = INTENT_RULES.map((rule) => {
    let score = 0;
    rule.keywords.forEach((keyword) => {
      if (normalizedInput.includes(keyword)) {
        score += 1;
        // Exact match bonus
        if (normalizedInput === keyword) score += 2;
      }
    });
    return { intent: rule.intent, score };
  });

  // Find the highest scoring intent
  const bestMatch = scores.reduce((prev, current) => {
    if (current.score > prev.score) {
      return current;
    }

    if (current.score === prev.score && current.score > 0) {
      const currentPriority = INTENT_PRIORITIES[current.intent] || 0;
      const previousPriority = INTENT_PRIORITIES[prev.intent] || 0;
      return currentPriority > previousPriority ? current : prev;
    }

    return prev;
  }, { intent: INTENTS.UNKNOWN, score: 0 });

  return bestMatch.score > 0 ? bestMatch.intent : INTENTS.UNKNOWN;
}

module.exports = {
  ...INTENTS,
  INTENTS,
  classifyIntent
};
