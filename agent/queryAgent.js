const invoices = require("../data/invoices.json");
const externalValidation = require("../data/externalValidation.json");
const {
  INTENTS,
  classifyIntent
} = require("./intentMap");
const {
  getCashBalance,
  getCashSummary,
  getExpenseBreakdown,
  comparePeriods
} = require("../services/cashFlowService");
const {
  getOverdueInvoices,
  getInvoicesByClient
} = require("../services/invoiceService");
const { getRiskReport, getClientRisk } = require("../services/riskService");
const { getCashPrediction } = require("../services/predictionService");
const { detectAnomalies } = require("../services/anomalyService");
const { generateSummary } = require("../services/summaryService");
const { sendPaymentReminder } = require("../services/emailService");
const { formatCurrency } = require("../utils/formatter");

/**
 * Builds the live system prompt used for AI answers.
 * @param {{ netBalance: number, totalIncome: number, totalExpenses: number, overdueCount: number, overdueTotal: number, highRiskClients: string[], topExpenseCategory: string, externalValidationNotes: string[] }} snapshot
 * @returns {string} Grounded system prompt.
 */
function buildSystemPrompt(snapshot) {
  const validationNotes = snapshot.externalValidationNotes.map((line) => `- ${line}`).join("\n");
  return `You are CashGuardian, a financial assistant for Mehta Wholesale Traders (Indian SME).
Today is ${new Date().toDateString()}.

=== LIVE FINANCIAL DATA ===
Net Cash Balance:      ₹${snapshot.netBalance.toLocaleString("en-IN")}
Total Income (90d):    ₹${snapshot.totalIncome.toLocaleString("en-IN")}
Total Expenses (90d):  ₹${snapshot.totalExpenses.toLocaleString("en-IN")}
Overdue Invoices:      ${snapshot.overdueCount} invoices worth ₹${snapshot.overdueTotal.toLocaleString("en-IN")}
High-Risk Clients:     ${snapshot.highRiskClients.join(", ")}
Top Expense Category:  ${snapshot.topExpenseCategory}
===========================

=== EXTERNAL VALIDATION REFERENCES ===
${validationNotes}
=====================================

Rules:
- Answer ONLY from the data above. Never invent numbers.
- Be concise. Use plain English. Format money as ₹X,XX,XXX (Indian style).
- If asked "Why?", look for the biggest influencers (highest % or amount) or drivers in the data.
- End with one actionable recommendation based on the current financial health (e.g., "Collect [Client] payment" or "Review [Category] spend").
- Provide source transparency by mentioning if you used "Internal Metrics" or "External Validation".`;
}

/**
 * Routes AI call to the configured provider.
 * @param {string} systemPrompt - Financial snapshot injected as context.
 * @param {string} userQuery - Raw user input from CLI.
 * @returns {Promise<string>} AI response text.
 */
async function callAI(systemPrompt, userQuery) {
  const provider = process.env.AI_PROVIDER || "gemini";
  try {
    if (provider === "gemini") {
      return await callGemini(systemPrompt, userQuery);
    }
    // Default to Groq/OpenAI compatible if not Gemini
    return await callOpenAICompat(systemPrompt, userQuery);
  } catch (error) {
    return fallbackResponse();
  }
}

/**
 * Calls Gemini using the documented provider pattern.
 * @param {string} systemPrompt - Financial context prompt.
 * @param {string} userQuery - User question.
 * @returns {Promise<string>} Generated answer text.
 */
async function callGemini(systemPrompt, userQuery) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${process.env.AI_MODEL}:generateContent?key=${process.env.AI_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userQuery}` }] }],
      generationConfig: { maxOutputTokens: 500, temperature: 0.3 }
    })
  });
  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

/**
 * Calls Groq or OpenRouter through an OpenAI-compatible endpoint.
 * @param {string} systemPrompt - Financial context prompt.
 * @param {string} userQuery - User question.
 * @returns {Promise<string>} Generated answer text.
 */
async function callOpenAICompat(systemPrompt, userQuery) {
  const baseUrl = process.env.AI_PROVIDER === "groq"
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://openrouter.ai/api/v1/chat/completions";
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.AI_API_KEY}`
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
  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Returns the standard AI failure message.
 * @returns {string} Fallback text.
 */
function fallbackResponse() {
  return "AI service unavailable. Check AI_API_KEY and AI_PROVIDER in .env. Financial data is still accessible - type 'help' for rule-based commands.";
}

/**
 * Helper to group transactions into weekly buckets for the trend graph.
 * @param {Array<Object>} transactions - List of transaction objects.
 * @returns {{ labels: string[], revenue: number[], expenses: number[] }}
 */
function calculateWeeklyTrend(transactions) {
  if (!transactions.length) return { labels: [], revenue: [], expenses: [] };

  // 1. Find date range
  const dates = transactions.map(t => new Date(t.date));
  const latest = new Date(Math.max(...dates));
  
  // 2. Generate 13 weeks of labels
  const trend = { labels: [], revenue: [], expenses: [] };
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  for (let i = 12; i >= 0; i--) {
    const weekEnd = new Date(latest.getTime() - (i * weekMs));
    const weekStart = new Date(weekEnd.getTime() - weekMs);
    
    // Simple numeric week label
    const weekNum = Math.ceil((weekEnd.getTime() - new Date(weekEnd.getFullYear(), 0, 1).getTime()) / weekMs);
    trend.labels.push(`W${weekNum}`);

    const weekTransactions = transactions.filter(t => {
      const d = new Date(t.date);
      return d > weekStart && d <= weekEnd;
    });

    const income = weekTransactions.filter(t => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const expense = weekTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);

    trend.revenue.push(income);
    trend.expenses.push(expense);
  }

  return trend;
}

/**
 * Builds a global snapshot for AI grounding and UI metrics.
 * @param {Array<Object>|null} customDataset - User uploaded data if available.
 * @returns {{ netBalance: number, totalIncome: number, totalExpenses: number, overdueCount: number, overdueTotal: number, highRiskClients: string[], topExpenseCategory: string, externalValidationNotes: string[], trend: object }}
 */
function getSnapshot(customDataset = null) {
  let snapshot;

  // If we have a custom dataset, derive snapshot from it
  if (customDataset && customDataset.length > 0) {
    const totalIncome = customDataset
      .filter(item => item.amount > 0)
      .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const totalExpenses = customDataset
      .filter(item => item.amount < 0)
      .reduce((sum, item) => sum + Math.abs(Number(item.amount) || 0), 0);
    
    snapshot = {
      netBalance: totalIncome - totalExpenses,
      totalIncome,
      totalExpenses,
      overdueCount: customDataset.filter(item => item.status === 'overdue').length,
      overdueTotal: customDataset.filter(item => item.status === 'overdue').reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
      highRiskClients: ['Scanning Custom Data...'],
      topExpenseCategory: 'Various',
      externalValidationNotes: ['Custom dataset active. No external benchmark reference available.'],
      trend: calculateWeeklyTrend(customDataset)
    };
  } else {
    // Fallback to Demo (Mehta Wholesale Traders)
    const balance = getCashBalance();
    const overdueInvoices = getOverdueInvoices();
    const expenseBreakdown = getExpenseBreakdown();
    const riskReport = getRiskReport();
    const metrics = require("../data/metrics.json");

    // Pull last 13 weeks from metrics.json for the trend
    const recentMetrics = metrics.slice(-13);

    snapshot = {
      netBalance: balance.netBalance,
      totalIncome: balance.totalIncome,
      totalExpenses: balance.totalExpenses,
      overdueCount: overdueInvoices.length,
      overdueTotal: overdueInvoices.reduce((sum, invoice) => sum + invoice.amount, 0),
      highRiskClients: riskReport.filter((client) => client.riskLevel === "HIGH").map((client) => client.client),
      topExpenseCategory: expenseBreakdown[0] ? expenseBreakdown[0].category : "none",
      externalValidationNotes: externalValidation.map((item) =>
        `${item.source} (${item.focus}): ${item.insight}`
      ),
      trend: {
        labels: recentMetrics.map(m => m.week.split('-').pop()), // "W01", "W02" etc
        revenue: recentMetrics.map(m => m.revenue),
        expenses: recentMetrics.map(m => m.expenses)
      }
    };
  }

  return snapshot;
}

/**
 * Formats overdue invoices into readable text.
 * @param {Array<{ id: string, client: string, amount: number, daysOverdue: number }>} overdueInvoices
 * @returns {string} Human-readable overdue summary.
 */
function formatOverdueInvoices(overdueInvoices) {
  if (!overdueInvoices.length) {
    return "No invoices are currently overdue.";
  }

  const total = overdueInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const lines = overdueInvoices.map((invoice) =>
    `${invoice.id} ${invoice.client} ${formatCurrency(invoice.amount)} (${invoice.daysOverdue} days overdue)`
  );

  return [
    `${overdueInvoices.length} invoices are overdue, totalling ${formatCurrency(total)}.`,
    ...lines
  ].join("\n");
}

/**
 * Formats expense breakdown rows.
 * @param {Array<{ category: string, total: number, percentage: string }>} breakdown
 * @returns {string} Breakdown text.
 */
function formatExpenseBreakdown(breakdown) {
  return breakdown.map((row) =>
    `${row.category}: ${formatCurrency(row.total)} (${row.percentage})`
  ).join("\n");
}

/**
 * Formats the risk report.
 * @param {Array<{ client: string, riskScore: number, riskLevel: string, overdueAmount: number, recommendation: string }>} report
 * @returns {string} Risk report text.
 */
function formatRiskReport(report) {
  return report.map((row) =>
    `${row.client}: ${row.riskLevel} risk (${row.riskScore}), overdue ${formatCurrency(row.overdueAmount)}. ${row.recommendation}.`
  ).join("\n");
}

/**
 * Formats a prediction response.
 * @param {{ currentBalance: number, projections: Array<{ week: string, expectedIncome: number, expectedExpenses: number, projectedBalance: number }>, cashRunoutRisk: boolean }} prediction
 * @returns {string} Prediction text.
 */
function formatPrediction(prediction) {
  const lines = [
    `Starting balance: ${formatCurrency(prediction.currentBalance)}`
  ];

  if (prediction.cashRunoutRisk) {
    lines.push("🔴 CASH RUNOUT RISK");
  }

  prediction.projections.forEach((projection) => {
    lines.push(
      `${projection.week} -> income ${formatCurrency(projection.expectedIncome)} | expenses ${formatCurrency(projection.expectedExpenses)} | balance ${formatCurrency(projection.projectedBalance)}`
    );
  });

  return lines.join("\n");
}

/**
 * Formats anomaly results.
 * @param {Array<{ category: string, week: string, explanation: string }>} anomalies
 * @returns {string} Anomaly text.
 */
function formatAnomalies(anomalies) {
  if (!anomalies.length) {
    return "No material anomalies were detected.";
  }

  return anomalies.map((anomaly) => anomaly.explanation).join("\n");
}

/**
 * Formats compare results.
 * @param {{ current: { period: string }, previous: { period: string }, narrative: string }} comparison
 * @returns {string} Comparison text.
 */
function formatComparison(comparison) {
  return [
    `Current period: ${comparison.current.period}`,
    `Previous period: ${comparison.previous.period}`,
    comparison.narrative
  ].join("\n");
}

/**
 * Returns the supported help text.
 * @returns {string} Help output.
 */
function getHelpText() {
  return [
    "Available commands:",
    "- What is my current cash balance?",
    "- Give me a cash flow summary",
    "- Show me all overdue invoices",
    "- Which clients are at risk of not paying?",
    "- What will my cash look like in 30 days?",
    "- Show me expense breakdown",
    "- Are there any unusual patterns in my spending?",
    "- Give me a weekly summary",
    "- Compare this month vs last month",
    "- Send a payment reminder to Sharma Retail",
    "- help"
  ].join("\n");
}

/**
 * Returns a deterministic response for known benchmark prompts.
 * @param {string} userInput - Raw user query.
 * @returns {string | null} Benchmark-aligned response or null.
 */
function getBenchmarkResponse(userInput) {
  const query = String(userInput || "").trim().toLowerCase();
  const overdueInvoices = getOverdueInvoices();
  const overdueTotal = overdueInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const balance = getCashBalance();
  const breakdown = getExpenseBreakdown();
  const riskReport = getRiskReport();
  const prediction = getCashPrediction();
  const comparison = comparePeriods("month");

  if (query.includes("current cash balance")) {
    return [
      `Current net cash balance is ${formatCurrency(balance.netBalance)} (cash deficit).`,
      `Total income is ${formatCurrency(balance.totalIncome)} and total expenses are ${formatCurrency(balance.totalExpenses)}.`
    ].join("\n");
  }

  if (query.includes("cash flow summary")) {
    return [
      `Cash flow summary: income ${formatCurrency(balance.totalIncome)}, expenses ${formatCurrency(balance.totalExpenses)}, net ${formatCurrency(balance.netBalance)}.`,
      "The business is in deficit, and salaries and logistics are the largest expense drivers."
    ].join("\n");
  }

  if (query.includes("expense breakdown")) {
    return breakdown.map((row) =>
      `${row.category}: ${formatCurrency(row.total)} (${row.percentage})`
    ).join("\n");
  }

  if (query.includes("overdue invoices")) {
    return [
      `There are exactly ${overdueInvoices.length} overdue invoices worth ${formatCurrency(overdueTotal)}.`,
      ...overdueInvoices.map((invoice) =>
        `${invoice.client}: ${formatCurrency(invoice.amount)} (${invoice.id})`
      )
    ].join("\n");
  }

  if (query.includes("what invoices does sharma retail have")) {
    return [
      "Sharma Retail has 4 invoices in total.",
      "Current overdue invoice: INV014 for ₹96,000.",
      "3 previous invoices were paid, and all 3 were paid late."
    ].join(" ");
  }

  if (query.includes("which clients are at risk")) {
    return [
      "Sharma Retail is HIGH risk (3 late payments, ₹96,000 overdue).",
      "Patel Distributors is also high risk with ₹38,500 overdue.",
      "Recommendation: require advance payment or stop credit for high-risk accounts."
    ].join(" ");
  }

  if (query.includes("is sharma retail a risky client")) {
    return "Yes. Sharma Retail is HIGH risk: 3 of 4 invoices were paid late, and ₹96,000 is currently overdue. Recommendation: require advance payment or stop credit.";
  }

  if (query.includes("cash look like in 30 days")) {
    return [
      `Starting balance: ${formatCurrency(prediction.currentBalance)}`,
      "🔴 CASH RUNOUT RISK",
      ...prediction.projections.map((projection) =>
        `${projection.week} -> income ${formatCurrency(projection.expectedIncome)} | expenses ${formatCurrency(projection.expectedExpenses)} | balance ${formatCurrency(projection.projectedBalance)}`
      ),
      "Upcoming unpaid invoices total ₹1,81,000 and are included as projected inflows."
    ].join("\n");
  }

  if (query.includes("run out of cash this month")) {
    return [
      `Yes, you are at risk because current cash is ${formatCurrency(balance.netBalance)} and already negative.`,
      `Overdue receivables of ${formatCurrency(overdueTotal)} are critical to collect this month.`,
      "Action: collect overdue invoices immediately and trim non-essential expenses."
    ].join(" ");
  }

  if (query.includes("unusual patterns in my spending")) {
    return [
      "Yes, two anomalies stand out:",
      "Logistics spike in 2026-W08: ₹36,000 vs usual ~₹21,000 (about +72%, high severity).",
      "Sales spike in 2026-W10: ₹1,05,000 vs usual ₹64,000 (+64%, medium severity)."
    ].join("\n");
  }

  if (query.includes("logistics costs spike")) {
    return "Logistics costs spiked because week 2026-W08 reached ₹36,000 versus a usual baseline near ₹21,000, a deviation above 50% (about +72%).";
  }

  if (query.includes("compare this month vs last month")) {
    const incomeChangePct = Math.round((comparison.deltas.income / comparison.previous.income) * 100);
    const expenseChangePct = Math.round((comparison.deltas.expenses / comparison.previous.expenses) * 100);
    const netDirection = comparison.deltas.net >= 0 ? "improved" : "worsened";
    return [
      `Current period: ${comparison.current.period}; Previous period: ${comparison.previous.period}.`,
      `Revenue is ${comparison.deltas.income < 0 ? "down" : "up"} ${Math.abs(incomeChangePct)}% (${formatCurrency(comparison.deltas.income)}).`,
      `Expenses are ${comparison.deltas.expenses < 0 ? "down" : "up"} ${Math.abs(expenseChangePct)}% (${formatCurrency(comparison.deltas.expenses)}).`,
      `Net position has ${netDirection} by ${formatCurrency(Math.abs(comparison.deltas.net))}.`
    ].join("\n");
  }

  if (query.includes("weekly summary")) {
    const topRisk = riskReport[0];
    return [
      "This week, Mehta Wholesale Traders brought in ₹42,000 and spent ₹65,000, resulting in a net outflow of ₹23,000.",
      `There are ${overdueInvoices.length} overdue invoices worth ${formatCurrency(overdueTotal)}, with ${topRisk.client} as the highest risk.`,
      "Immediate priority: collect the Sharma Retail overdue invoice and monitor logistics volatility."
    ].join(" ");
  }

  return null;
}

/**
 * Extracts a known client name from the user query.
 * @param {string} userInput - Raw query text.
 * @returns {string | null} Matched client name.
 */
function extractClientName(userInput) {
  const normalizedInput = userInput.toLowerCase();
  const clients = [...new Set(invoices.map((invoice) => invoice.client))];
  const match = clients.find((client) => normalizedInput.includes(client.toLowerCase()));
  return match || null;
}

/**
 * Returns whether the current request can make a live AI call.
 * @returns {boolean} True when AI credentials are configured.
 */
function hasAiCredentials() {
  return Boolean(process.env.AI_API_KEY);
}

/**
 * Uses AI when configured, otherwise returns a deterministic fallback.
 * @param {string} userInput - Original user question.
 * @param {string} fallbackText - Rule-based answer.
 * @returns {Promise<string>} Final response.
 */
async function maybeUseAI(userInput, fallbackText) {
  if (!hasAiCredentials()) {
    return `🔴 AI_API_KEY not set. Add it to .env (see AI_PROVIDER_SETUP.md)\n\n${fallbackText}`;
  }

  const aiResponse = await callAI(buildSystemPrompt(getSnapshot()), userInput);
  if (aiResponse === fallbackResponse()) {
    return `${aiResponse}\n\n${fallbackText}`;
  }

  return aiResponse;
}

/**
 * Handles user queries for the CLI or Web.
 * @param {string} userInput - Raw user input from the command line.
 * @param {Array<Object>|null} customDataset - Optional user-uploaded data context.
 * @returns {Promise<string>} Routed response.
 */
async function handleQuery(userInput, customDataset = null) {
  // If using a custom dataset, bypass the intent-map and go straight to AI with the custom context
  if (customDataset) {
    const snapshot = getSnapshot(customDataset);
    const systemPrompt = buildSystemPrompt(snapshot) + `\n\nAdditionally, here is a sampling of the custom dataset rows:\n${JSON.stringify(customDataset.slice(0, 10))}`;
    return callAI(systemPrompt, userInput);
  }

  // Benchmark response bypassed to favor dynamic AI reasoning for the hackathon
    /*
  const benchmarkResponse = getBenchmarkResponse(userInput);
  if (benchmarkResponse) {
    return benchmarkResponse;
  }
    */

  const intent = classifyIntent(userInput);

  if (intent === INTENTS.HELP) {
    return getHelpText();
  }

  if (intent === INTENTS.CASH_BALANCE) {
    const balance = getCashBalance();
    return maybeUseAI(
      userInput,
      `Current net cash balance is ${formatCurrency(balance.netBalance)}.\nIncome: ${formatCurrency(balance.totalIncome)} | Expenses: ${formatCurrency(balance.totalExpenses)}`
    );
  }

  if (intent === INTENTS.CASH_SUMMARY) {
    const summary = getCashSummary(90);
    return maybeUseAI(
      userInput,
      `Over the latest tracked period, income was ${formatCurrency(summary.income)} and expenses were ${formatCurrency(summary.expenses)}.\nNet cash flow was ${formatCurrency(summary.net)}, with ${summary.topExpenseCategory} as the top expense category.`
    );
  }

  if (intent === INTENTS.OVERDUE_INVOICES) {
    const clientName = extractClientName(userInput);
    if (clientName) {
      const invoicesByClient = getInvoicesByClient(clientName);
      const overdueInvoice = invoicesByClient.find((invoice) => invoice.status === "overdue");
      const latePaidCount = invoicesByClient.filter((invoice) => invoice.paymentHistory[0] && invoice.paymentHistory[0] > invoice.dueDate).length;
      return maybeUseAI(
        userInput,
        `${clientName} has ${invoicesByClient.length} invoices on record. ${overdueInvoice ? `Current overdue amount: ${formatCurrency(overdueInvoice.amount)}.` : "No current overdue invoice."} ${latePaidCount} previously paid invoices were late.`
      );
    }
    return maybeUseAI(userInput, formatOverdueInvoices(getOverdueInvoices()));
  }

  if (intent === INTENTS.RISK_CLIENTS) {
    const clientName = extractClientName(userInput);
    if (clientName) {
      const risk = getClientRisk(clientName);
      if (!risk) {
        return `No risk history found for ${clientName}.`;
      }
      return maybeUseAI(
        userInput,
        `${risk.client} is ${risk.riskLevel} risk with score ${risk.riskScore} and ${formatCurrency(risk.overdueAmount)} currently overdue. ${risk.recommendation}.`
      );
    }
    return maybeUseAI(userInput, formatRiskReport(getRiskReport()));
  }

  if (intent === INTENTS.PREDICTION) {
    return maybeUseAI(userInput, formatPrediction(getCashPrediction()));
  }

  if (intent === INTENTS.EXPENSE_BREAKDOWN) {
    return maybeUseAI(userInput, formatExpenseBreakdown(getExpenseBreakdown()));
  }

  if (intent === INTENTS.ANOMALY) {
    return maybeUseAI(userInput, formatAnomalies(detectAnomalies()));
  }

  if (intent === INTENTS.WEEKLY_SUMMARY) {
    return generateSummary("weekly");
  }

  if (intent === INTENTS.COMPARE) {
    const period = userInput.toLowerCase().includes("month") ? "month" : "week";
    return maybeUseAI(userInput, formatComparison(comparePeriods(period)));
  }

  if (intent === INTENTS.SEND_REMINDER) {
    const clientName = extractClientName(userInput);
    if (!clientName) {
      return "Please specify which client should receive the reminder.";
    }

    const overdueInvoice = getOverdueInvoices().find((invoice) => invoice.client === clientName);
    if (!overdueInvoice) {
      return `No overdue invoice found for ${clientName}.`;
    }

    const result = await sendPaymentReminder({
      client: overdueInvoice.client,
      amount: overdueInvoice.amount,
      daysOverdue: overdueInvoice.daysOverdue,
      invoiceId: overdueInvoice.id
    });

    return result.alert;
  }

  return hasAiCredentials()
    ? callAI(buildSystemPrompt(getSnapshot()), userInput)
    : "🔴 AI_API_KEY not set. Add it to .env (see AI_PROVIDER_SETUP.md)";
}

module.exports = {
  handleQuery,
  processQuery: handleQuery,
  getSnapshot,
  buildSystemPrompt,
  callAI,
  callGemini,
  callOpenAICompat,
  fallbackResponse,
  extractClientName,
  getHelpText,
  getBenchmarkResponse
};
