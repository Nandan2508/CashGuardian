const invoices = require("../data/invoices.json");
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
 * @param {{ netBalance: number, totalIncome: number, totalExpenses: number, overdueCount: number, overdueTotal: number, highRiskClients: string[], topExpenseCategory: string }} snapshot
 * @returns {string} Grounded system prompt.
 */
function buildSystemPrompt(snapshot) {
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

Rules:
- Answer ONLY from the data above. Never invent numbers.
- Be concise. Use plain English. Format money as ₹X,XX,XXX (Indian style).
- End with one actionable recommendation when relevant.`;
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
 * Builds a global snapshot for AI grounding.
 * @returns {{ netBalance: number, totalIncome: number, totalExpenses: number, overdueCount: number, overdueTotal: number, highRiskClients: string[], topExpenseCategory: string }}
 */
function getSnapshot() {
  const balance = getCashBalance();
  const overdueInvoices = getOverdueInvoices();
  const expenseBreakdown = getExpenseBreakdown();
  const riskReport = getRiskReport();

  return {
    netBalance: balance.netBalance,
    totalIncome: balance.totalIncome,
    totalExpenses: balance.totalExpenses,
    overdueCount: overdueInvoices.length,
    overdueTotal: overdueInvoices.reduce((sum, invoice) => sum + invoice.amount, 0),
    highRiskClients: riskReport.filter((client) => client.riskLevel === "HIGH").map((client) => client.client),
    topExpenseCategory: expenseBreakdown[0] ? expenseBreakdown[0].category : "none"
  };
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
 * Handles user queries for the CLI.
 * @param {string} userInput - Raw user input from the command line.
 * @returns {Promise<string>} Routed CLI response.
 */
async function handleQuery(userInput) {
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
  buildSystemPrompt,
  callAI,
  callGemini,
  callOpenAICompat,
  fallbackResponse,
  extractClientName,
  getHelpText
};
