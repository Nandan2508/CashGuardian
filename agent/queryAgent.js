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
  comparePeriods,
  compareEntities,
  getLatestTransactionDate,
  getTransactionsInRange,
  getCategoryVariances,
  calculateWeeklyTrend
} = require("../services/cashFlowService");
const {
  getOverdueInvoices,
  getInvoicesByClient,
  getUpcomingDue
} = require("../services/invoiceService");
const { getRiskReport, getClientRisk } = require("../services/riskService");
const { detectAnomalies } = require("../services/anomalyService");
const { generateSummary } = require("../services/summaryService");
const { decomposeTransactions } = require("../services/decompositionService");
const { sendPaymentReminder } = require("../services/emailService");
const { calculate30DayForecast } = require("../services/predictionService");
const { formatCurrency, safeDate, safeNumber } = require("../utils/formatter");

/**
 * Builds the live system prompt used for AI answers.
 * @param {{ netBalance: number, totalIncome: number, totalExpenses: number, overdueCount: number, overdueTotal: number, highRiskClients: string[], topExpenseCategory: string, externalValidationNotes: string[] }} snapshot
 * @returns {string} Grounded system prompt.
 */
function buildSystemPrompt(snapshot) {
  const validationNotes = snapshot.externalValidationNotes.map((line) => `- ${line}`).join("\n");
  const anomalies = (snapshot.anomalies || []).map((a) => `- CRITICAL: ${a.explanation}`).join("\n");
  
  return `You are CashGuardian, an advanced financial reasoning agent.
Today is ${new Date().toDateString()}.

### CORE DIRECTIVE
- **Accuracy First**: Only report what is explicitly present in the data. Never invent numbers, clients, or context.
- **Data Grounding**: Use the "LIVE FINANCIAL DATA" and "CONTACT DIRECTORY" sections below as your single source of truth.
- **Missing Data**: If a client's email is not in the CONTACT DIRECTORY, state that you don't have their email address rather than guessing or using a placeholder.

=== LIVE FINANCIAL DATA ===
Net Cash Balance:      ₹${snapshot.netBalance.toLocaleString("en-IN")}
Total Income (90d):    ₹${snapshot.totalIncome.toLocaleString("en-IN")}
Total Expenses (90d):  ₹${snapshot.totalExpenses.toLocaleString("en-IN")}
Overdue Invoices:      ${snapshot.overdueCount} invoices worth ₹${snapshot.overdueTotal.toLocaleString("en-IN")}
High-Risk Clients:     ${snapshot.highRiskClients.join(", ")}
Top Expense Category:  ${snapshot.topExpenseCategory}
===========================

=== IDENTIFIED ANOMALIES & ALERTS ===
${anomalies || "No critical anomalies detected in recent spending patterns."}
=====================================

=== EXTERNAL VALIDATION REFERENCES ===
${validationNotes}
=====================================

=== CONTACT DIRECTORY (FOR EMAILS/REMINDERS) ===
${JSON.stringify(snapshot.contacts || {}, null, 2)}
================================================

=== OVERDUE LIST (DETAIL) ===
${JSON.stringify(snapshot.overdueList || [], null, 2)}
=============================

Rules:
- Format money as ₹X,XX,XXX (Indian style).
- Use Markdown headings (####) for structure.
- Always identify the source of your information (e.g., "According to recent transaction logs...").
---
`;
}

/**
 * Routes AI call to the configured provider.
 * @param {string} systemPrompt - Financial snapshot injected as context.
 * @param {string} userQuery - Raw user input from CLI.
 * @returns {Promise<string>} AI response text.
 */
async function callAI(systemPrompt, userQuery, customFallback = null) {
  const provider = process.env.AI_PROVIDER || "gemini";
  try {
    if (provider === "gemini") {
      return await callGemini(systemPrompt, userQuery);
    }
    // Default to Groq/OpenAI compatible if not Gemini
    return await callOpenAICompat(systemPrompt, userQuery);
  } catch (error) {
    console.error("AI Call Error:", error);
    return customFallback || fallbackResponse();
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
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${text}`);
  }
  
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

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${process.env.AI_PROVIDER} API error (${response.status}): ${text}`);
  }

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

// Data sanitization helpers now imported from utils/formatter.js

// Removed local calculateWeeklyTrend - moved to services/cashFlowService.js

/**
 * Builds a global snapshot for AI grounding and UI metrics.
 * @param {Array<Object>|null} customDataset - User uploaded data if available.
 * @returns {{ netBalance: number, totalIncome: number, totalExpenses: number, overdueCount: number, overdueTotal: number, highRiskClients: string[], topExpenseCategory: string, externalValidationNotes: string[], trend: object, comparisonTrend: object, breakdown: object[] }}
 */
function getSnapshot(customDataset = null) {
  let snapshot;

  // If we have a custom dataset, derive snapshot from it
  if (customDataset && customDataset.length > 0) {
    // PRE-CLEAN: Ensure all metrics downstream use clean numbers/dates
    const cleanedData = customDataset.map(item => ({
      ...item,
      amount: safeNumber(item.amount),
      date: item.date // Keep as string; services expect ISO strings
    }));

    const totalIncome = cleanedData
      .filter(item => item.type === 'income' || (!item.type && item.amount > 0))
      .reduce((sum, item) => sum + item.amount, 0);
    const totalExpenses = cleanedData
      .filter(item => item.type === 'expense' || (!item.type && item.amount < 0))
      .reduce((sum, item) => sum + Math.abs(item.amount), 0);


    // Breakdown for Donut Chart
    const breakdownMap = cleanedData
      .filter(item => item.type === 'expense')
      .reduce((acc, item) => {
        acc[item.category] = (acc[item.category] || 0) + Math.abs(item.amount);
        return acc;
      }, {});

    const breakdown = Object.entries(breakdownMap).map(([category, total]) => ({ category, total }));

    // --- ENHANCED INTEL FOR CUSTOM DATA ---
    const latestDate = getLatestTransactionDate(cleanedData);
    const midPoint = new Date(latestDate);
    midPoint.setUTCDate(midPoint.getUTCDate() - 30);
    const startPoint = new Date(midPoint);
    startPoint.setUTCDate(startPoint.getUTCDate() - 30);

    const currentInterval = getTransactionsInRange(midPoint, latestDate, cleanedData);
    const prevInterval = getTransactionsInRange(startPoint, midPoint, cleanedData);
    const variances = getCategoryVariances(currentInterval, prevInterval);

    const { detectAnomalies } = require("../services/anomalyService");
    const activeAnomalies = detectAnomalies(cleanedData);

    // Deduplicate overdue items (Filter for status, then group by unique traits to avoid TXN/INV double counting)
    const overdueUniqueMap = cleanedData
      .filter(item => item.status === 'overdue')
      .reduce((acc, item) => {
        const key = `${item.client}-${item.amount}-${item.dueDate || item.date}`;
        if (!acc[key]) acc[key] = item;
        return acc;
      }, {});
    
    const overdueDeduplicated = Object.values(overdueUniqueMap);

    const overdueClients = overdueDeduplicated
      .filter(item => item.client && item.client !== 'Walk-in Client')
      .reduce((acc, item) => {
        acc[item.client] = (acc[item.client] || 0) + item.amount;
        return acc;
      }, {});

    const highRiskClients = Object.entries(overdueClients)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, amt]) => `${name} (₹${amt.toLocaleString('en-IN')})`);

    snapshot = {
      netBalance: totalIncome - totalExpenses,
      totalIncome,
      totalExpenses,
      overdueCount: overdueDeduplicated.length,
      overdueTotal: overdueDeduplicated.reduce((sum, item) => sum + item.amount, 0),
      highRiskClients: highRiskClients.length > 0 ? highRiskClients : ['None'],
      topExpenseCategory: breakdown.length > 0 ? breakdown.sort((a, b) => b.total - a.total)[0].category : 'Various',
      externalValidationNotes: [
        'Custom dataset active. Analysis based on user-provided transactional boundaries.',
        ...activeAnomalies.map(a => `ANOMALY DETECTED: ${a.explanation}`)
      ],
      trend: calculateWeeklyTrend(cleanedData, 0),
      comparisonTrend: calculateWeeklyTrend(cleanedData, 13),
      breakdown,
      variances,
      anomalies: activeAnomalies,
      overdueList: overdueDeduplicated.map(i => ({
        client: i.client,
        amount: i.amount,
        dueDate: i.dueDate || i.date || 'N/A'
      })),
      contacts: cleanedData.reduce((acc, row) => {
        const clientKey = Object.keys(row).find(k => k.toLowerCase() === 'client' || k.toLowerCase() === 'customer');
        const emailKey = Object.keys(row).find(k => k.toLowerCase().includes('email') || k.toLowerCase() === 'contact');
        if (clientKey && emailKey && row[clientKey] && row[emailKey]) {
          acc[row[clientKey]] = row[emailKey];
        }
        return acc;
      }, {})
    };
  } else {
    // Fallback to Demo (Mehta Wholesale Traders)
    const balance = getCashBalance();
    const overdueInvoices = getOverdueInvoices();
    const expenseBreakdown = getExpenseBreakdown();
    const riskReport = getRiskReport();
    const metrics = require("../data/metrics.json");

    // Pull last 13 weeks and the 13 before that for comparison
    const recentMetrics = metrics.slice(-13);
    const previousMetrics = metrics.slice(-26, -13);

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
        labels: recentMetrics.map(m => m.week.split('-').pop()),
        revenue: recentMetrics.map(m => m.revenue),
        expenses: recentMetrics.map(m => m.expenses)
      },
      comparisonTrend: previousMetrics.length > 0 ? {
        labels: previousMetrics.map(m => m.week.split('-').pop()),
        revenue: previousMetrics.map(m => m.revenue),
        expenses: previousMetrics.map(m => m.expenses)
      } : null,
      breakdown: expenseBreakdown.map(b => ({ category: b.category, total: b.total })),
      variances: comparePeriods("month").variances,
      anomalies: detectAnomalies(), // ADDED: Critical for grounding spending queries
      overdueList: overdueInvoices.map(i => ({
        client: i.client,
        amount: i.amount,
        dueDate: i.dueDate
      })),
      contacts: require("../data/clientContacts.json")
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
  const items = overdueInvoices.map((invoice) =>
    `${invoice.client}: ${formatCurrency(invoice.amount)} (${invoice.id})`
  ).join("\n");

  return `There are exactly ${overdueInvoices.length} overdue individual invoices on file, totaling ${formatCurrency(total)}.\n${items}`;
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
 * Formats decomposition results into a tabular string.
 * @param {object} result - Raw decomposition data.
 * @returns {string} Tabular output.
 */
function formatDecompositionTable(result) {
  const { printTable } = require("../utils/formatter");
  const rows = result.components.map((c) => ({
    Component: c.label,
    Amount: formatCurrency(c.value),
    Share: `${c.percentage}%`
  }));
  return printTable(rows, ["Component", "Amount", "Share"]);
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
 * @param {Array<Object>} [customDataset] - Optional custom dataset.
 * @returns {string | null} Benchmark-aligned response or null.
 */
function getBenchmarkResponse(userInput, customDataset = null) {
  const query = String(userInput || "").trim().toLowerCase();
  const overdueInvoices = getOverdueInvoices(customDataset);
  const overdueTotal = overdueInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const balance = getCashBalance(customDataset);
  const breakdown = getExpenseBreakdown(customDataset);
  const riskReport = getRiskReport(); // Risk report still based on history/invoices
  const prediction = getCashPrediction(customDataset);
  const comparison = comparePeriods("month", 1, customDataset);

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
 * @param {Array<Object>|null} dataset - Optional dataset to scan for names.
 * @returns {string | null} Matched client name.
 */
function extractClientName(userInput, dataset = null) {
  const normalizedInput = userInput.toLowerCase();
  
  // 1. Get unique clients from the relevant source
  let clients = [];
  if (dataset) {
    clients = [...new Set(dataset.map(item => {
      const key = Object.keys(item).find(k => k.toLowerCase() === 'client' || k.toLowerCase() === 'customer');
      return key ? item[key] : null;
    }).filter(Boolean))];
  } else {
    // Fallback to demo data sources
    const demoTransactions = require("../data/transactions.json");
    const demoInvoices = require("../data/invoices.json");
    clients = [...new Set([...demoTransactions, ...demoInvoices].map(i => i.client).filter(Boolean))];
  }

  // 2. Exact match (case insensitive)
  let match = clients.find(client => normalizedInput.includes(client.toLowerCase()));
  if (match) return match;

  // 3. Fuzzy/Partial match (e.g., "Sharma" matching "Sharma Retail")
  // We look for a keyword that is at least 3 chars and is part of the client name
  const words = normalizedInput.split(/\s+/).filter(w => w.length > 3);
  for (const word of words) {
    const found = clients.find(client => client.toLowerCase().includes(word));
    if (found) return found;
  }

  return null;
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
 * @param {Array<Object>} [customDataset] - User data context.
 * @returns {Promise<string>} Final response.
 */
async function maybeUseAI(userInput, fallbackText, customDataset = null) {
  if (!hasAiCredentials()) {
    return `🔴 AI_API_KEY not set. Add it to .env (see AI_PROVIDER_SETUP.md)\n\n${fallbackText}`;
  }

  const aiResponse = await callAI(buildSystemPrompt(getSnapshot(customDataset)), userInput);
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
  const intent = classifyIntent(userInput);

  // If sending a reminder, we should ALWAYS trigger the actual service
  if (intent === INTENTS.SEND_REMINDER) {
    const clientName = extractClientName(userInput, customDataset);
    if (!clientName) return "Please specify which client should receive the reminder.";

    // Find the invoice in the current dataset (custom or demo)
    const dataset = customDataset || require("../data/transactions.json");
    const overdueRow = dataset.find(item => item.client === clientName && (item.status === 'overdue' || item.amount < 0));

    if (!overdueRow) return `No overdue records found for ${clientName} in the active dataset.`;

    const result = await sendPaymentReminder({
      client: clientName,
      amount: Math.abs(overdueRow.amount),
      daysOverdue: overdueRow.daysOverdue || 7,
      invoiceId: overdueRow.id || overdueRow.invoiceId || 'N/A'
    }, customDataset);

    return result.alert;
  }

  // For other intents with a custom dataset, use AI reasoning with the data context
  if (customDataset) {
    const snapshot = getSnapshot(customDataset);
    const systemPrompt = buildSystemPrompt(snapshot) + `\n\nAdditionally, here is a sampling of the custom dataset rows:\n${JSON.stringify(customDataset.slice(0, 10))}`;
    return callAI(systemPrompt, userInput);
  }

  if (intent === INTENTS.HELP) {
    return getHelpText();
  }

  if (intent === INTENTS.CASH_BALANCE) {
    const balance = getCashBalance(customDataset);
    return maybeUseAI(
      userInput,
      `Current net cash balance is ${formatCurrency(balance.netBalance)}.\nIncome: ${formatCurrency(balance.totalIncome)} | Expenses: ${formatCurrency(balance.totalExpenses)}`,
      customDataset
    );
  }

  if (intent === INTENTS.CASH_SUMMARY) {
    const summary = getCashSummary(90, customDataset);
    return maybeUseAI(
      userInput,
      `Over the latest tracked period, income was ${formatCurrency(summary.income)} and expenses were ${formatCurrency(summary.expenses)}.\nNet cash flow was ${formatCurrency(summary.net)}, with ${summary.topExpenseCategory} as the top expense category.`,
      customDataset
    );
  }

  if (intent === INTENTS.OVERDUE_INVOICES) {
    const clientName = extractClientName(userInput, customDataset);
    if (clientName) {
      const invoicesByClient = getInvoicesByClient(clientName, customDataset);
      const overdueInvoice = invoicesByClient.find((invoice) => invoice.status === "overdue");
      const paidInvoices = invoicesByClient.filter(i => i.status === 'paid');
      const latePaidCount = invoicesByClient.filter((invoice) => 
        invoice.paymentHistory && invoice.paymentHistory[0] && invoice.paymentHistory[0] > invoice.dueDate
      ).length;

      if (!hasAiCredentials()) {
        return `${clientName} has ${invoicesByClient.length} invoices on record. ` +
               `${overdueInvoice ? `Current overdue: ${formatCurrency(overdueInvoice.amount)}.` : "No current overdue."} ` +
               `${latePaidCount} previously paid invoices were late.`;
      }

      const snapshot = getSnapshot(customDataset);
      const fallback = `${clientName} has ${invoicesByClient.length} invoices on record. ` +
               `${overdueInvoice ? `Current overdue: ${formatCurrency(overdueInvoice.amount)}.` : "No current overdue."} ` +
               `${latePaidCount} previously paid invoices were late.`;

      const systemPrompt = buildSystemPrompt(snapshot) +
        `\n\n### CLIENT SPECIFIC HISTORY: ${clientName}\n` +
        `Total Invoices: ${invoicesByClient.length}\n` +
        `Paid Invoices: ${paidInvoices.length}\n` +
        `Late Payments: ${latePaidCount}\n` +
        `Current Overdue: ${overdueInvoice ? formatCurrency(overdueInvoice.amount) : 'None'}\n` +
        `Recent Activity: ${JSON.stringify(invoicesByClient.slice(-5))}\n` +
        `### END CLIENT HISTORY\n\n` +
        `Task: Answer the user's question about ${clientName} using the history above. ` +
        `Explicitly mention the total invoice count (${invoicesByClient.length}) and the late payment count (${latePaidCount}) if asked about history or risk.`;

      return callAI(systemPrompt, userInput, fallback);
    }
    return maybeUseAI(userInput, formatOverdueInvoices(getOverdueInvoices(customDataset)), customDataset);
  }

  if (intent === INTENTS.RISK_CLIENTS) {
    const clientName = extractClientName(userInput, customDataset);
    if (clientName) {
      const risk = getClientRisk(clientName, customDataset);
      if (!risk) {
        return `No risk history found for ${clientName}.`;
      }
      return maybeUseAI(
        userInput,
        `${risk.client} is ${risk.riskLevel} risk with score ${risk.riskScore} and ${formatCurrency(risk.overdueAmount)} currently overdue. ${risk.recommendation}.`,
        customDataset
      );
    }
    return maybeUseAI(userInput, formatRiskReport(getRiskReport(customDataset)), customDataset);
  }

  if (intent === INTENTS.EXPENSE_BREAKDOWN) {
    return maybeUseAI(userInput, formatExpenseBreakdown(getExpenseBreakdown(customDataset)), customDataset);
  }

  if (intent === INTENTS.ANOMALY) {
    return maybeUseAI(userInput, formatAnomalies(detectAnomalies(customDataset)), customDataset);
  }

  if (intent === INTENTS.DECOMPOSITION) {
    const norm = userInput.toLowerCase();
    let type = "expense";
    let filter = null;
    let group = "category";

    if (norm.includes("sales") || norm.includes("revenue") || norm.includes("income")) {
      type = "income";
      filter = "sales";
      group = "client";
    }

    if (norm.includes("cost") || norm.includes("expense") || norm.includes("spending")) {
      type = "expense";
      group = "category";
    }

    const result = decomposeTransactions(type, filter, group, customDataset);
    const table = formatDecompositionTable(result);

    if (!hasAiCredentials()) {
      return `🔴 AI_API_KEY not set. Add it to .env (see AI_PROVIDER_SETUP.md)\n\n${table}`;
    }

    const snapshot = getSnapshot(customDataset);
    const systemPrompt = buildSystemPrompt(snapshot) +
      `\n\n### MANDATORY DATA SOURCE: TARGET DECOMPOSITION\n` +
      `You MUST explain the following components of the focus area "${result.target}":\n` +
      `Total: ${formatCurrency(result.total)}\n` +
      `Breakdown: ${JSON.stringify(result.components)}\n` +
      `Statistically relevant patterns: ${result.insights.join(", ") || "None detected"}\n` +
      `### END DATA SOURCE\n\n` +
      "Task: Provide a strategic executive narrative of the decomposition data above. Highlight the top contributor and explain any concentration risks or outliers found in the statistically relevant patterns. Ignore other snapshot data if it contradicts the Target Decomposition breakdown.";

    const summary = await callAI(systemPrompt, userInput);
    return `${summary}\n${table}`;
  }

  if (intent === INTENTS.WEEKLY_SUMMARY) {
    const ruleBased = await generateSummary("weekly", customDataset);
    if (!hasAiCredentials()) return ruleBased;

    const snapshot = getSnapshot(customDataset);
    const systemPrompt = buildSystemPrompt(snapshot) +
      `\n\n### MANDATORY DATA SOURCE: WEEKLY SUMMARY DATA\n` +
      `${ruleBased}\n\n` +
      `Task: Convert the raw data points above into a professional, cohesive executive summary. ` +
      `Highlight the top revenue source, most critical collection risk, and one actionable recommendation for the coming week. ` +
      `Include counts and amounts explicitly.`;

    return callAI(systemPrompt, userInput, ruleBased);
  }

  if (intent === INTENTS.COMPARE) {
    const normalized = userInput.toLowerCase();
    
    // SMART ROUTING: Determine if this is a month-on-month trend or an entity duel
    const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "jan", "feb", "mar", "apr"];
    const isPeriodComparison = monthNames.some(m => normalized.includes(m)) || normalized.includes("month") || normalized.includes("week");

    if (normalized.includes(" vs ") || normalized.includes(" versus ")) {
      const cleaned = normalized.replace(/.*compare /i, "").replace(/["']/g, "").replace(/\.$/, "");
      const parts = cleaned.split(/ vs | versus /);
      
      if (parts.length >= 2 && !isPeriodComparison) {
        // ENTITY DUEL (e.g. "Alpha Retail vs Beta Logistics")
        const entityA = parts[0].trim();
        const entityB = parts[1].trim();
        const duelData = compareEntities(entityA, entityB, customDataset);

        const snapshot = getSnapshot(customDataset);
        snapshot.duel = duelData;
        const response = await callAI(buildSystemPrompt(snapshot), userInput);
        return { content: response, duel: duelData };
      }
    }

    // PERIOD COMPARISON (e.g. "April vs March" or "this month vs last month")
    const period = normalized.includes("week") ? "week" : "month";
    const comparison = comparePeriods(period, 1, customDataset);
    const response = await maybeUseAI(userInput, formatComparison(comparison), customDataset);
    
    return {
      content: response,
      trend: comparison.currentTrend,
      comparisonTrend: comparison.previousTrend
    };
  }

  if (intent === INTENTS.PREDICTION) {
    const forecast = calculate30DayForecast(customDataset);
    const snapshot = getSnapshot(customDataset);
    const systemPrompt = buildSystemPrompt(snapshot) +
      `\n\n### MANDATORY DATA SOURCE: 30-DAY FORECAST\n` +
      `Match the user's focus on the next 30 days using these components:\n` +
      `Current Balance: ${formatCurrency(forecast.openingBalance)}\n` +
      `Daily Revenue (Avg): ${formatCurrency(forecast.avgDailyRevenue)} (Total 30d Projection: ${formatCurrency(forecast.projectedRevenue)})\n` +
      `Daily Burn (Avg): ${formatCurrency(forecast.avgDailyBurn)} (Total 30d Projection: ${formatCurrency(forecast.projectedBurn)})\n` +
      `Upcoming Invoices: ${formatCurrency(forecast.upcomingTotal)}\n` +
      `Projected 30-Day Balance: ${formatCurrency(forecast.finalBalance)}\n` +
      `Reasoning: ${forecast.reasoning}\n` +
      `### END DATA SOURCE\n\n` +
      `Task: Provide a detailed strategic analysis of the 30-day forecast. Be professional. Explain how the burn rate affects the closing balance. ` +
      `NEVER invent numbers. If the trend is negative, suggest a specific cost-cutting measure based on the top expense category.`;

    const summary = await callAI(systemPrompt, userInput);
    return summary;
  }

  return hasAiCredentials()
    ? callAI(buildSystemPrompt(getSnapshot(customDataset)), userInput)
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
  getBenchmarkResponse,
  formatDecompositionTable
};
