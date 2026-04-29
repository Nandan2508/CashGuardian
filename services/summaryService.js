const metrics = require("../data/metrics.json");
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
  
  // PRE-FETCH to avoid cascade of 5 DB calls
  const { getTransactions } = require("./dataService");
  const dataset = customDataset || await getTransactions(userId);

  // Only run the comparison we actually need
  const comparison = await comparePeriods(userId, useWeekly ? "week" : "month", 1, dataset);
  
  const allAnomalies = await detectAnomalies(userId, dataset);
  const relevantAnomalies = allAnomalies.slice(0, 2);
  const overdueInvoices = await getOverdueInvoices(userId, dataset);
  const overdueTotal = overdueInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const riskReport = await getRiskReport(userId, dataset);
  const topRiskClient = riskReport[0] || { client: "None" };
  
  const income = comparison.current.income;
  const expenses = comparison.current.expenses;
  const net = income - expenses;
  const deltaDirection = comparison.deltas.net >= 0 ? "improved" : "worsened";
  const anomalySentence = relevantAnomalies.length
    ? `Recent anomalies include ${relevantAnomalies.map((anomaly) => `${anomaly.category} in ${anomaly.week} (${anomaly.deviation})`).join(" and ")}.`
    : "No major anomalies were detected in the recent period.";

  return [
    `#### 📊 ${useWeekly ? "Weekly" : "Monthly"} Performance Executive Summary`,
    `This ${useWeekly ? "week" : "month"}, the business brought in **₹${income.toLocaleString("en-IN")}** and spent **₹${expenses.toLocaleString("en-IN")}**, resulting in a net **${net >= 0 ? "inflow" : "outflow"} of ₹${Math.abs(net).toLocaleString("en-IN")}**.`,
    `**Comparison**: Compared with the previous ${useWeekly ? "week" : "month"}, the net position has **${deltaDirection} by ₹${Math.abs(comparison.deltas.net).toLocaleString("en-IN")}**.`,
    `**Risk & Collections**: ${overdueInvoices.length} invoices remain overdue totalling **₹${overdueTotal.toLocaleString("en-IN")}**, and **${topRiskClient.client}** is identified as the highest payment risk.`,
    `**Anomalies**: ${anomalySentence}`,
    `---`
  ].join("\n\n");
}

module.exports = {
  generateSummary
};
