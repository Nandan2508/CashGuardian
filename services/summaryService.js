const { detectAnomalies } = require("./anomalyService");
const { comparePeriods } = require("./cashFlowService");
const { getOverdueInvoices } = require("./invoiceService");
const { getRiskReport } = require("./riskService");

/**
 * Generates a rule-based narrative summary.
 * @param {string} userId - Authenticated user ID.
 * @param {"weekly"|"monthly"} period - Summary period.
 * @param {Array<Object>|null} customDataset - User-provided data.
 * @returns {Promise<string>} Narrative summary.
 */
async function generateSummary(userId, period, customDataset = null) {
  const useWeekly = period === "weekly";
  const { getTransactions } = require("./dataService");
  const dataset = customDataset || await getTransactions(userId);

  const comparison = await comparePeriods(userId, useWeekly ? "week" : "month", 1, dataset);
  const allAnomalies = await detectAnomalies(userId, dataset);
  const relevantAnomalies = allAnomalies.slice(0, 2);
  const overdueInvoices = await getOverdueInvoices(userId, dataset);
  const overdueTotal = overdueInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const riskReport = await getRiskReport(userId, dataset);
  const topRiskClient = riskReport[0] || { client: "None" };

  const income = comparison.current.income;
  const expenses = comparison.current.expenses;
  const net = comparison.current.net;
  const incomeDirection = comparison.deltas.income >= 0 ? "up" : "down";
  const expenseDirection = comparison.deltas.expenses >= 0 ? "up" : "down";
  const netDirection = comparison.deltas.net >= 0 ? "improved" : "worsened";

  const anomalySentence = relevantAnomalies.length
    ? `The biggest flagged movements were ${relevantAnomalies.map((anomaly) => `${anomaly.category} in ${anomaly.week} (${anomaly.deviation})`).join(" and ")}.`
    : "No major anomalies were detected in the recent period.";

  const actions = [
    overdueInvoices.length
      ? `Collections should prioritize the ${overdueInvoices.length} overdue invoices worth ₹${overdueTotal.toLocaleString("en-IN")}, starting with ${topRiskClient.client}.`
      : "Collections pressure is currently manageable because there are no overdue invoices needing immediate follow-up.",
    net < 0
      ? "Because the period closed with a net outflow, the next action should be to protect cash by reviewing large discretionary spends."
      : "Because the period closed with a net inflow, the next action should be to preserve momentum in the strongest revenue categories.",
    relevantAnomalies[0]
      ? `Validate whether the ${relevantAnomalies[0].category} movement in ${relevantAnomalies[0].week} was one-off or the start of a sustained trend.`
      : "Keep monitoring weekly changes so any fresh variance is caught early."
  ];

  return [
    `#### ${useWeekly ? "Weekly" : "Monthly"} Performance Executive Summary`,
    `This ${useWeekly ? "week" : "month"}, the business brought in **₹${income.toLocaleString("en-IN")}** and spent **₹${expenses.toLocaleString("en-IN")}**, resulting in a net **${net >= 0 ? "inflow" : "outflow"} of ₹${Math.abs(net).toLocaleString("en-IN")}**.`,
    `Compared with the previous ${useWeekly ? "week" : "month"}, revenue is **${incomeDirection} by ₹${Math.abs(comparison.deltas.income).toLocaleString("en-IN")}**, expenses are **${expenseDirection} by ₹${Math.abs(comparison.deltas.expenses).toLocaleString("en-IN")}**, and the net position has **${netDirection} by ₹${Math.abs(comparison.deltas.net).toLocaleString("en-IN")}**.`,
    `Collections risk remains material: **${overdueInvoices.length} invoices** are overdue totaling **₹${overdueTotal.toLocaleString("en-IN")}**, and **${topRiskClient.client}** is currently the highest-risk account based on payment behavior.`,
    anomalySentence,
    `Recommended actions: ${actions.join(" ")}`,
    "---"
  ].join("\n\n");
}

module.exports = {
  generateSummary
};
