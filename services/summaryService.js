const metrics = require("../data/metrics.json");
const { detectAnomalies } = require("./anomalyService");
const { comparePeriods } = require("./cashFlowService");
const { getOverdueInvoices } = require("./invoiceService");
const { getRiskReport } = require("./riskService");

/**
 * Generates a rule-based narrative summary.
 * @param {"weekly"|"monthly"} period - Summary period.
 * @returns {Promise<string>} Narrative summary.
 */
async function generateSummary(period) {
  const useWeekly = period === "weekly";
  const latestMetric = metrics[metrics.length - 1];
  const previousMetric = metrics[metrics.length - 2];
  const monthlyComparison = comparePeriods("month");
  const weeklyComparison = comparePeriods("week");
  const comparison = useWeekly ? weeklyComparison : monthlyComparison;
  const relevantAnomalies = detectAnomalies().slice(0, 2);
  const overdueInvoices = getOverdueInvoices();
  const overdueTotal = overdueInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const topRiskClient = getRiskReport()[0];
  const income = useWeekly ? latestMetric.revenue : comparison.current.income;
  const expenses = useWeekly ? latestMetric.expenses : comparison.current.expenses;
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
