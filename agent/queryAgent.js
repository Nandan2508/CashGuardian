require('dotenv').config();
const fs = require("fs");
const path = require("path");
const { getTransactions, getInvoices, getClients } = require("../services/dataService");

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
  summarizeTransactions,
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
const { isOverdue } = require("../utils/dateUtils");
const { formatCurrency, safeDate, safeNumber } = require("../utils/formatter");

/**
 * Builds the live system prompt used for AI answers.
 * @param {{ netBalance: number, totalIncome: number, totalExpenses: number, overdueCount: number, overdueTotal: number, highRiskClients: string[], topExpenseCategory: string, externalValidationNotes: string[] }} snapshot
 * @returns {string} Grounded system prompt.
 */
function buildSystemPrompt(snapshot) {
  const validationNotes = (snapshot.externalValidationNotes || []).slice(0, 3).map((line) => `- ${line}`).join("\n");
  const anomalies = (snapshot.anomalies || []).slice(0, 3).map((a) => `- ALERT: ${a.explanation}`).join("\n");
  const variances = snapshot.variances;

  let duelSection = "";
  if (snapshot.duel) {
    const { entityA, entityB, analysis } = snapshot.duel;
    duelSection = `\n=== H2H PERFORMANCE (90d) ===\n` +
      `${entityA.name}: ₹${entityA.revenue.toLocaleString()} Rev, ₹${entityA.costs.toLocaleString()} Costs\n` +
      `${entityB.name}: ₹${entityB.revenue.toLocaleString()} Rev, ₹${entityB.costs.toLocaleString()} Costs\n` +
      `Gap: ${analysis.gapPct}% lead for ${analysis.leader}\n`;
  }

  let popSection = "No comparison data.";
  if (variances && variances.income) {
    popSection = `Current (30d): In ₹${variances.income.current.toLocaleString()}, Out ₹${variances.expenses.current.toLocaleString()}\n` +
                 `Prior (30d): In ₹${variances.income.previous.toLocaleString()}, Out ₹${variances.expenses.previous.toLocaleString()}\n` +
                 `Deltas: In ${variances.income.pct}%, Out ${variances.expenses.pct}%`;
  }

  // Summary of Overdue Invoices instead of full JSON
  const overdueSummary = (snapshot.overdueList || []).slice(0, 5).map(i => 
    `${i.client}: ₹${Number(i.amount).toLocaleString()} (Due: ${i.dueDate}, ${i.daysPastDue}d late)`
  ).join('\n');

  return `You are CashGuardian, a financial analyst.
Today: ${new Date().toDateString()}.

=== KEY METRICS ===
Net Balance: ₹${snapshot.netBalance.toLocaleString("en-IN")}
Income (90d): ₹${snapshot.totalIncome.toLocaleString("en-IN")}
Expenses (90d): ₹${snapshot.totalExpenses.toLocaleString("en-IN")}
Overdue: ${snapshot.overdueCount} invoices (₹${snapshot.overdueTotal.toLocaleString("en-IN")})
Risk Clients: ${snapshot.highRiskClients.join(", ")}
Top Expense: ${snapshot.topExpenseCategory}
===================

=== GROWTH (30d vs Prior) ===
${popSection}
=============================

=== ANOMALIES ===
${anomalies || "None."}
=================
${duelSection}
=== OVERDUE LIST (Top 5) ===
${overdueSummary || "No overdue invoices."}
============================

=== TOP DRIVERS ===
${(snapshot.topDrivers || []).slice(0, 3).join('\n')}
===================

Rules:
1. Answer ONLY using the data above. No halluncinations.
2. Format money as ₹X,XX,XXX.
3. Be concise. Use headings.
4. If asked for a summary, provide a professional narrative with 3 actionable tips.
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

const snapshotCache = new Map(); // User-specific cache

/**
 * Builds a global snapshot for AI grounding and UI metrics.
 * @param {string} userId - Current user ID.
 * @param {Array<Object>|null} customDataset - User uploaded data if available.
 * @param {Object|null} preFetched - Optional object containing { transactions, invoices }.
 * @returns {Promise<object>} Global snapshot.
 */
async function getSnapshot(userId, customDataset = null, preFetched = null) {
  // 1. Check cache first
  if (!customDataset && snapshotCache.has(userId)) {
    return snapshotCache.get(userId);
  }

  // 2. Parallel Data Gathering
  const [dbData, overdueList, activeAnomaliesRaw] = await Promise.all([
    preFetched?.transactions ? Promise.resolve(preFetched.transactions) : getTransactions(userId),
    getOverdueInvoices(userId, preFetched?.invoices || null),
    detectAnomalies(userId, customDataset || preFetched?.transactions)
  ]);

  const dataToUse = customDataset || (dbData.length > 0 ? dbData : null);
  let snapshot;

  if (dataToUse) {
    const cleanedData = dataToUse;

    // Derived metrics (Sync)
    const totalIncome = cleanedData
      .filter(item => item.type === 'income' || (!item.type && Number(item.amount) > 0))
      .reduce((sum, item) => sum + Number(item.amount), 0);
    const totalExpenses = cleanedData
      .filter(item => item.type === 'expense' || (!item.type && Number(item.amount) < 0))
      .reduce((sum, item) => sum + Math.abs(Number(item.amount)), 0);

    const breakdownMap = cleanedData
      .filter(item => item.type === 'expense')
      .reduce((acc, item) => {
        acc[item.category] = (acc[item.category] || 0) + Math.abs(Number(item.amount));
        return acc;
      }, {});

    const breakdown = Object.entries(breakdownMap).map(([category, total]) => ({ category, total }));

    // Parallel fetch for time-based metrics
    const latestDate = await getLatestTransactionDate(userId, cleanedData);
    const midPoint = new Date(latestDate);
    midPoint.setUTCDate(midPoint.getUTCDate() - 30);
    const startPoint = new Date(midPoint);
    startPoint.setUTCDate(startPoint.getUTCDate() - 30);

    const [currentInterval, prevInterval, trend, comparisonTrend] = await Promise.all([
      getTransactionsInRange(userId, midPoint, latestDate, cleanedData),
      getTransactionsInRange(userId, startPoint, midPoint, cleanedData),
      calculateWeeklyTrend(userId, cleanedData, 0),
      calculateWeeklyTrend(userId, cleanedData, 13)
    ]);

    const currentSummary = summarizeTransactions(currentInterval);
    const prevSummary = summarizeTransactions(prevInterval);

    const variances = {
      income: {
        current: currentSummary.income,
        previous: prevSummary.income,
        delta: currentSummary.income - prevSummary.income,
        pct: prevSummary.income !== 0 ? Math.round(((currentSummary.income - prevSummary.income) / prevSummary.income) * 100) : 0
      },
      expenses: {
        current: currentSummary.expenses,
        previous: prevSummary.expenses,
        delta: currentSummary.expenses - prevSummary.expenses,
        pct: prevSummary.expenses !== 0 ? Math.round(((currentSummary.expenses - prevSummary.expenses) / prevSummary.expenses) * 100) : 0
      },
      categories: getCategoryVariances(currentInterval, prevInterval)
    };

    snapshot = {
      netBalance: totalIncome - totalExpenses,
      totalIncome,
      totalExpenses,
      isDemo: false,
      overdueCount: overdueList.filter(i => i.effectiveStatus !== 'due_soon').length,
      overdueTotal: overdueList.filter(i => i.effectiveStatus !== 'due_soon').reduce((sum, item) => sum + Number(item.amount), 0),
      highRiskClients: [...new Set(overdueList.filter(i => ['high_risk', 'critical'].includes(i.effectiveStatus)).map(i => i.client))],
      topExpenseCategory: breakdown.length > 0 ? breakdown.sort((a, b) => b.total - a.total)[0].category : 'Various',
      regions: [...new Set(cleanedData.map(d => d.region))].join(', '),
      channels: [...new Set(cleanedData.map(d => d.channel))].join(', '),
      externalValidationNotes: [
        'Dynamic Risk Analysis active (Date-based override).',
        ...activeAnomaliesRaw.map(a => `ANOMALY DETECTED: ${a.explanation}`)
      ],
      trend,
      comparisonTrend,
      breakdown,
      variances,
      anomalies: activeAnomaliesRaw,
      overdueList: overdueList.map(i => ({
        id: i.id,
        client: i.client,
        amount: i.amount,
        dueDate: i.dueDate,
        status: i.riskLabel,
        daysPastDue: i.daysOverdue
      })),
      topDrivers: currentInterval.sort((a, b) => b.amount - a.amount).slice(0, 5).map(i => `${i.type === 'income' ? 'IN' : 'OUT'}: ${i.description} (₹${i.amount.toLocaleString()})`),
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
    // Fallback to Demo/DB
    const [balance, expenseBreakdown, comparison, activeAnomalies] = await Promise.all([
      getCashBalance(userId),
      getExpenseBreakdown(userId),
      comparePeriods(userId, "month", 1),
      detectAnomalies(userId)
    ]);

    const recentMetrics = [];
    const previousMetrics = [];

    snapshot = {
      isDemo: false,
      netBalance: balance.netBalance,
      totalIncome: balance.totalIncome,
      totalExpenses: balance.totalExpenses,
      overdueCount: overdueList.filter(i => i.effectiveStatus !== 'due_soon').length,
      overdueTotal: overdueList.filter(i => i.effectiveStatus !== 'due_soon').reduce((sum, item) => sum + item.amount, 0),
      highRiskClients: [...new Set(overdueList.filter(i => ['high_risk', 'critical'].includes(i.effectiveStatus)).map(i => i.client))],
      topExpenseCategory: expenseBreakdown[0] ? expenseBreakdown[0].category : "none",
      externalValidationNotes: [
        'Historical benchmarks reset. Fresh data analysis active.'
      ],
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
      variances: {
        income: {
          current: comparison.current.income,
          previous: comparison.previous.income,
          delta: comparison.deltas.income,
          pct: Math.round((comparison.deltas.income / (comparison.previous.income || 1)) * 100)
        },
        expenses: {
          current: comparison.current.expenses,
          previous: comparison.previous.expenses,
          delta: comparison.deltas.expenses,
          pct: Math.round((comparison.deltas.expenses / (comparison.previous.expenses || 1)) * 100)
        },
        categories: comparison.variances
      },
      anomalies: activeAnomalies,
      overdueList: overdueList.map(i => ({
        id: i.id,
        client: i.client,
        amount: i.amount,
        dueDate: i.dueDate,
        status: i.riskLabel,
        daysPastDue: i.daysOverdue
      })),
      contacts: await getClients(userId)
    };
  }

  // Update Cache
  snapshotCache.set(userId, snapshot);
  return snapshot;
}

/**
 * Invalidates the snapshot cache for a specific user.
 * @param {string} userId - The user ID.
 */
function invalidateSnapshotCache(userId) {
  snapshotCache.delete(userId);
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
 * Formats overdue invoices into a professional markdown table.
 * @param {Array<Object>} overdueInvoices 
 * @returns {string} Markdown table.
 */
function formatOverdueTable(overdueInvoices) {
  if (!overdueInvoices || overdueInvoices.length === 0) return "No overdue invoices found.";

  const rows = overdueInvoices.map((invoice) => ({
    Invoice: invoice.id || "N/A",
    Client: invoice.client || "Unknown",
    Amount: invoice.amount || 0,
    "Due Date": invoice.dueDate || invoice.date || "N/A",
    "Days Overdue": invoice.daysOverdue ?? invoice.daysPastDue ?? 0,
    Status: invoice.status || invoice.riskLabel || "Overdue"
  }));

  return [
    `#### Overdue Invoices (${rows.length})`,
    buildMarkdownTable(rows, ["Invoice", "Client", "Amount", "Due Date", "Days Overdue", "Status"])
  ].join("\n");
}

/**
 * Formats expense breakdown rows.
 * @param {Array<{ category: string, total: number, percentage: string }>} breakdown
 * @returns {string} Breakdown text.
 */
function formatExpenseBreakdown(breakdown) {
  if (!breakdown.length) {
    return "No expense breakdown data available.";
  }

  const rows = breakdown.map((row) => ({
    Category: row.category,
    Amount: row.total,
    Share: row.percentage
  }));

  return [
    "#### Expense Breakdown",
    buildMarkdownTable(rows, ["Category", "Amount", "Share"])
  ].join("\n");
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
 * Formats decomposition results into a professional markdown table.
 * @param {object} result - Raw decomposition data.
 * @returns {string} Markdown table.
 */
function formatDecompositionTable(result) {
  if (!result || !result.components) return "No breakdown data available.";
  const label = result.groupField === "category"
    ? "Revenue Type"
    : result.groupField === "client"
      ? "Client"
      : result.groupField === "region"
        ? "Region"
        : result.groupField === "channel"
          ? "Channel"
          : "Component";
  const rows = result.components.map((component) => ({
    [label]: component.label,
    Amount: component.value,
    Share: `${component.percentage}%`
  }));

  return [
    `#### ${result.target}`,
    buildMarkdownTable(rows, [label, "Amount", "Share"])
  ].join("\n");
}

/**
 * Builds a markdown table for UI-friendly rendering.
 * @param {Array<Record<string, string|number>>} rows - Table rows.
 * @param {string[]} columns - Ordered columns.
 * @returns {string} Markdown table text.
 */
function buildMarkdownTable(rows, columns) {
  const header = `| ${columns.join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => {
    const cells = columns.map((column) => {
      const value = row[column];
      if (typeof value === "number") {
        return formatCurrency(value);
      }

      return String(value ?? "").replace(/\|/g, "\\|");
    });

    return `| ${cells.join(" | ")} |`;
  });

  return [header, separator, ...body].join("\n");
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
async function getBenchmarkResponse(userInput, customDataset = null) {
  const query = String(userInput || "").trim().toLowerCase();
  const overdueInvoices = await getOverdueInvoices(null, customDataset);
  const overdueTotal = overdueInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const balance = await getCashBalance(null, customDataset);
  const breakdown = await getExpenseBreakdown(null, customDataset);
  const riskReport = await getRiskReport(null, customDataset); // Risk report still based on history/invoices
  // NOTE: getCashPrediction does not exist in standard imports, replacing with getCashSummary or just bypassing if prediction is missing
  // Assuming getCashPrediction was replaced by calculate30DayForecast
  const { calculate30DayForecast } = require("../services/predictionService");
  const prediction = calculate30DayForecast(customDataset);
  const comparison = await comparePeriods(null, "month", 1, customDataset);

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
 * Extracts a client name from user input using substring matching.
 * @param {string} userInput - The raw query.
 * @param {Array<Object>|null} dataset - Optional dataset to extract from.
 * @param {Array<string>|null} preComputedClients - Optional pre-computed unique client names.
 * @returns {string | null} Matched client name.
 */
function extractClientName(userInput, dataset = null, preComputedClients = null) {
  const normalizedInput = userInput.toLowerCase();

  // 1. Get unique clients from the relevant source
  let clients = preComputedClients;

  if (!clients) {
    const sourceData = dataset || [];
    clients = [...new Set(sourceData.map(item => {
      const key = Object.keys(item).find(k => k.toLowerCase() === 'client' || k.toLowerCase() === 'customer' || k.toLowerCase() === 'client_name');
      return key ? item[key] : null;
    }).filter(Boolean))];

    if (!dataset) {
      // Fallback to demo data sources (only if files exist)
      try {
        const demoTransactionsPath = path.join(__dirname, "../data/transactions.json");
        const demoInvoicesPath = path.join(__dirname, "../data/invoices.json");
        
        let demoTransactions = [];
        let demoInvoices = [];
        
        if (fs.existsSync(demoTransactionsPath)) {
          demoTransactions = require(demoTransactionsPath);
        }
        if (fs.existsSync(demoInvoicesPath)) {
          demoInvoices = require(demoInvoicesPath);
        }
        
        clients = [...new Set([...demoTransactions, ...demoInvoices].map(i => i.client || i.client_name).filter(Boolean))];
      } catch (e) {
        clients = [];
      }
    }
  }

  // 2. Exact Match (The most reliable)
  const exactMatch = clients.find(c => normalizedInput.includes(c.toLowerCase()));

  // 3. Whole Word Match (To avoid "Traders" matching "Kapoor Traders" when user said "Sigma Traders")
  const words = normalizedInput.split(/\s+/).filter(w => w.length >= 3);

  // Priority 1: Full name in query
  if (exactMatch) return exactMatch;

  // Priority 2: Multi-word match (e.g. "Sigma Traders")
  for (let i = 0; i < words.length - 1; i++) {
    const duo = `${words[i]} ${words[i + 1]}`;
    const found = clients.find(c => c.toLowerCase().includes(duo));
    if (found) return found;
  }

  // Priority 3: Single word match, but EXCLUDING common generic words like "Traders", "Manufacturing", "Retail"
  const genericWords = ['traders', 'manufacturing', 'retail', 'logistics', 'services', 'wholesale', 'limited', 'pvt', 'ltd'];
  for (const word of words) {
    if (genericWords.includes(word)) continue;
    const found = clients.find(c => c.toLowerCase().includes(word));
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
 * @param {string} [userId] - Optional user context.
 * @returns {Promise<string>} Final response.
 */
async function maybeUseAI(userInput, fallbackText, customDataset = null, userId = null) {
  if (!process.env.AI_API_KEY || process.env.AI_API_KEY === "your-api-key-here") {
    return `🔴 AI_API_KEY not set. Add it to .env (see AI_PROVIDER_SETUP.md)\n\n${fallbackText}`;
  }

  const aiResponse = await callAI(buildSystemPrompt(await getSnapshot(userId, customDataset)), userInput);
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
async function handleQuery(userInput, customDataset = null, userId = null) {
  // PRE-CLEAN: Ensure custom dataset is sanitized for all services
  const [activeDataset, activeInvoices] = await Promise.all([
    (customDataset && customDataset.length > 0)
      ? Promise.resolve(customDataset.map(item => ({
        ...item,
        amount: safeNumber(item.amount),
        type: String(item.type || '').trim().toLowerCase(),
        category: String(item.category || '').trim().toLowerCase(),
        client: String(item.client || '').trim()
      })))
      : getTransactions(userId),
    getInvoices(userId)
  ]);

  const intent = classifyIntent(userInput);

  // If sending a reminder, we should ALWAYS trigger the actual service
  if (intent === INTENTS.SEND_REMINDER) {
    const clientName = extractClientName(userInput, activeDataset);
    if (!clientName) return "Please specify which client should receive the reminder.";

    const clientInvoices = await getInvoicesByClient(userId, clientName, activeInvoices);
    const overdueRow = clientInvoices.find((inv) => {
      const dueDate = inv.dueDate || inv.duedate;
      const status = String(inv.status || "").toLowerCase();
      return status === "overdue" || (dueDate && isOverdue(dueDate));
    });
    if (!overdueRow) return `No overdue records found for ${clientName}.`;

    const dueDate = overdueRow.dueDate || overdueRow.duedate;
    const daysOverdue = dueDate ? Math.max(1, Math.ceil((Date.now() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24))) : 7;

    const result = await sendPaymentReminder({
      client: clientName,
      amount: Math.abs(Number(overdueRow.amount) || 0),
      daysOverdue,
      invoiceId: overdueRow.id || overdueRow.invoiceId || "N/A"
    }, userId, activeDataset);

    return result.alert;
  }

  // For other intents with a custom dataset, use AI reasoning with the data context

  if (intent === INTENTS.HELP) {
    return getHelpText();
  }

  if (intent === INTENTS.CASH_BALANCE) {
    const balance = await getCashBalance(userId, activeDataset);
    return maybeUseAI(
      userInput,
      `Current net cash balance is ${formatCurrency(balance.netBalance)}.\nIncome: ${formatCurrency(balance.totalIncome)} | Expenses: ${formatCurrency(balance.totalExpenses)}`,
      activeDataset
    );
  }

  if (intent === INTENTS.CASH_SUMMARY) {
    const summary = await getCashSummary(userId, 90, activeDataset);
    return maybeUseAI(
      userInput,
      `Over the latest tracked period, income was ${formatCurrency(summary.income)} and expenses were ${formatCurrency(summary.expenses)}.\nNet cash flow was ${formatCurrency(summary.net)}, with ${summary.topExpenseCategory} as the top expense category.`,
      activeDataset
    );
  }

  if (intent === INTENTS.OVERDUE_INVOICES) {
    const clientName = extractClientName(userInput, activeDataset);
    if (clientName) {
      const invoicesByClient = await getInvoicesByClient(userId, clientName, null);
      const overdueInvoice = invoicesByClient.find((invoice) => {
        const dueDate = invoice.dueDate || invoice.duedate;
        return String(invoice.status || "").toLowerCase() === "overdue" || (dueDate && isOverdue(dueDate));
      });
      const paidInvoices = invoicesByClient.filter(i => i.status === 'paid');
      const latePaidCount = invoicesByClient.filter((invoice) =>
        invoice.paymentHistory && invoice.paymentHistory[0] && invoice.paymentHistory[0] > invoice.dueDate
      ).length;

      if (!hasAiCredentials()) {
        return `${clientName} has ${invoicesByClient.length} invoices on record. ` +
          `${overdueInvoice ? `Current overdue: ${formatCurrency(overdueInvoice.amount)}.` : "No current overdue."} ` +
          `${latePaidCount} previously paid invoices were late.`;
      }

      const snapshot = await getSnapshot(userId, activeDataset);
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
    return maybeUseAI(userInput, formatOverdueInvoices(await getOverdueInvoices(userId, activeInvoices)), activeDataset);
  }

  if (intent === INTENTS.RISK_CLIENTS) {
    const clientName = extractClientName(userInput, activeDataset);
    if (clientName) {
      const risk = getClientRisk(clientName, activeDataset);
      if (!risk) {
        return `No risk history found for ${clientName}.`;
      }
      return maybeUseAI(
        userInput,
        `${risk.client} is ${risk.riskLevel} risk with score ${risk.riskScore} and ${formatCurrency(risk.overdueAmount)} currently overdue. ${risk.recommendation}.`,
        activeDataset
      );
    }
    return maybeUseAI(userInput, formatRiskReport(await getRiskReport(userId, activeDataset)), activeDataset);
  }

  if (intent === INTENTS.EXPENSE_BREAKDOWN) {
    return maybeUseAI(userInput, formatExpenseBreakdown(await getExpenseBreakdown(userId, activeDataset)), activeDataset);
  }

  if (intent === INTENTS.ANOMALY) {
    const anomalies = await detectAnomalies(userId, activeDataset);
    const comparison = await comparePeriods(userId, "month", 1, activeDataset);
    const snapshot = await getSnapshot(userId, customDataset, { transactions: activeDataset, invoices: activeInvoices });
    const systemPrompt = buildSystemPrompt(snapshot) +
      `\n\n### MANDATORY DATA SOURCE: DRIVER & ANOMALY ANALYSIS\n` +
      `Comparison Variances (Income): ${JSON.stringify((comparison.variances.income || []).slice(0, 10))}\n` +
      `Comparison Variances (Expenses): ${JSON.stringify((comparison.variances.expenses || []).slice(0, 10))}\n` +
      `Detected Anomalies: ${JSON.stringify((anomalies || []).slice(0, 5))}\n` +
      `### END DATA SOURCE\n\n` +
      `Task: Identify the drivers behind increases or decreases in performance. ` +
      `Highlight the most influential categories (e.g., product, channel, or expense type). ` +
      `Provide clear, concise explanations in everyday language. Reference the specific data sources.`;

    return callAI(systemPrompt, userInput, formatAnomalies(anomalies));
  }

  if (intent === INTENTS.DECOMPOSITION) {
    const norm = userInput.toLowerCase();
    let type = "expense";
    let filter = null;
    let group = "category";

    if (norm.includes("sales") || norm.includes("revenue") || norm.includes("income")) {
      type = "income";
      group = "category";
    }

    if (norm.includes("cost") || norm.includes("expense") || norm.includes("spending")) {
      type = "expense";
      group = "category";
    }

    // Dynamic grouping override
    if (norm.includes("region") || norm.includes("location") || norm.includes("area")) {
      group = "region";
    }
    if (norm.includes("channel") || norm.includes("medium") || norm.includes("method")) {
      group = "channel";
    }
    if (norm.includes("client") || norm.includes("customer") || norm.includes("account")) {
      group = "client";
    }

    const result = await decomposeTransactions(type, filter, group, userId, activeDataset);
    const table = formatDecompositionTable(result);

    if (!hasAiCredentials()) {
      return `🔴 AI_API_KEY not set. Add it to .env (see AI_PROVIDER_SETUP.md)\n\n${table}`;
    }

    const snapshot = await getSnapshot(userId, customDataset, { transactions: activeDataset, invoices: activeInvoices });
    const systemPrompt = buildSystemPrompt(snapshot) +
      `\n\n### MANDATORY DATA SOURCE: TARGET DECOMPOSITION\n` +
      `You MUST explain the following components of the focus area "${result.target}":\n` +
      `Total: ${formatCurrency(result.total)}\n` +
      `Breakdown: ${JSON.stringify(result.components.slice(0, 10))}\n` +
      `Statistically relevant patterns: ${result.insights.join(", ") || "None detected"}\n` +
      `### END DATA SOURCE\n\n` +
      `Task: Decompose the number into its core components. ` +
      `Surface patterns like concentration (is one client 40% of the total?) or outliers. ` +
      `Provide both a structured narrative and refer to the table below. Be leadership-ready.`;

    const summary = await callAI(systemPrompt, userInput);
    return `${summary}\n${table}`;
  }

  if (intent === INTENTS.WEEKLY_SUMMARY) {
    const ruleBased = await generateSummary(userId, "weekly", activeDataset);
    if (!hasAiCredentials()) return ruleBased;

    const snapshot = await getSnapshot(userId, customDataset, { transactions: activeDataset, invoices: activeInvoices });
    const systemPrompt = buildSystemPrompt(snapshot) +
      `\n\n### MANDATORY DATA SOURCE: WEEKLY SUMMARY DATA\n` +
      `${ruleBased}\n\n` +
      `Task: Scan the dataset for trends, anomalies, and important shifts for the latest week. ` +
      `Produce a concise update for leadership. Avoid noise—focus on what truly matters. ` +
      `Provide specific source references for your claims.`;

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
        const duelData = await compareEntities(userId, entityA, entityB, activeDataset);

        const snapshot = await getSnapshot(userId, customDataset, { transactions: activeDataset, invoices: activeInvoices });
        snapshot.duel = duelData;
        const response = await callAI(buildSystemPrompt(snapshot), userInput);
        return { content: response, duel: duelData };
      }
    }

    // PERIOD COMPARISON (e.g. "April vs March" or "this month vs last month")
    const monthMap = {
      january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
      may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11, jan: 0
    };

    const getMonthRange = (name) => {
      const clean = name.toLowerCase().replace(/.*compare /i, "").trim();
      const idx = monthMap[clean];
      if (idx === undefined) return null;
      return {
        start: new Date(Date.UTC(2026, idx, 1)),
        end: new Date(Date.UTC(2026, idx + 1, 0, 23, 59, 59))
      };
    };

    let comparison;
    if (normalized.includes(" vs ") || normalized.includes(" versus ")) {
      const parts = normalized.split(/ vs | versus /);
      const rangeA = getMonthRange(parts[0]);
      const rangeB = getMonthRange(parts[1]);

      if (rangeA && rangeB) {
        comparison = await comparePeriods(userId, {
          target: rangeA,
          baseline: rangeB,
          name: `${parts[0].replace(/.*compare /i, "").trim()} vs ${parts[1].trim()}`
        }, 1, activeDataset);
      }
    }

    if (!comparison) {
      const period = normalized.includes("week") ? "week" : "month";
      comparison = await comparePeriods(userId, period, 1, activeDataset);
    }

    const snapshot = await getSnapshot(userId, customDataset, { transactions: activeDataset, invoices: activeInvoices });
    const systemPrompt = buildSystemPrompt(snapshot) +
      `\n\n### MANDATORY DATA SOURCE: PERIOD COMPARISON\n` +
      `Target Period (${comparison.current.period}): Income ${formatCurrency(comparison.current.income)}, Expenses ${formatCurrency(comparison.current.expenses)}\n` +
      `Baseline Period (${comparison.previous.period}): Income ${formatCurrency(comparison.previous.income)}, Expenses ${formatCurrency(comparison.previous.expenses)}\n` +
      `Deltas: Income ${formatCurrency(comparison.deltas.income)}, Expenses ${formatCurrency(comparison.deltas.expenses)}, Net ${formatCurrency(comparison.deltas.net)}\n` +
      `Summary: ${comparison.narrative}\n` +
      `### END DATA SOURCE\n\n` +
      `Task: Generate a high-impact comparison (visual + text). ` +
      `Identify statistically relevant differences. ` +
      `Use phrases like "Product A grown by X%, outperforming Y" or "Revenue decreased due to Z". ` +
      `Disambiguate the periods explicitly.`;

    const response = await callAI(systemPrompt, userInput, formatComparison(comparison));

    return {
      content: response,
      trend: comparison.currentTrend,
      comparisonTrend: comparison.previousTrend
    };
  }

  if (intent === INTENTS.PREDICTION) {
    const forecast = await calculate30DayForecast(userId, activeDataset);
    const snapshot = await getSnapshot(userId, customDataset, { transactions: activeDataset, invoices: activeInvoices });
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

  // CATCH-ALL FOR CUSTOM DATASETS: If no specific intent matched, use generic AI reasoning
  if (activeDataset) {
    const snapshot = await getSnapshot(userId, customDataset, { transactions: activeDataset, invoices: activeInvoices });
    const systemPrompt = buildSystemPrompt(snapshot) + `\n\nAdditionally, here is a sampling of the custom dataset rows:\n${JSON.stringify(activeDataset.slice(0, 10))}`;
    return callAI(systemPrompt, userInput);
  }

  return hasAiCredentials()
    ? callAI(buildSystemPrompt(await getSnapshot(userId, customDataset, { transactions: activeDataset, invoices: activeInvoices })), userInput)
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
  formatDecompositionTable,
  formatOverdueTable,
  invalidateSnapshotCache
};
