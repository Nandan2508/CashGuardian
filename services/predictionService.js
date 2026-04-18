const { getCashBalance, summarizeTransactions, getTransactionsInRange, getLatestTransactionDate } = require("./cashFlowService");
const { getUpcomingDue } = require("./invoiceService");
const { safeNumber } = require("../utils/formatter");

/**
 * Calculates a data-driven 30-day cash forecast.
 * @param {Array<Object>|null} dataset - Optional custom dataset.
 * @returns {Object} Forecast components and final projection.
 */
function calculate30DayForecast(dataset = null) {
  // Ensure we are working with numbers from the start
  const balance = getCashBalance(dataset);
  const latestDate = getLatestTransactionDate(dataset);
  
  // 1. Calculate Burn Rate (Last 90 days)
  const windowDays = 90;
  const from = new Date(latestDate);
  from.setUTCDate(from.getUTCDate() - (windowDays - 1));
  
  const history = getTransactionsInRange(from, latestDate, dataset);
  const totals = summarizeTransactions(history);
  
  // Guard against division by zero or NaN
  const safeIncome = safeNumber(totals.income);
  const safeExpenses = safeNumber(totals.expenses);
  const avgDailyRevenue = safeIncome / (windowDays || 1);
  const avgDailyBurn = safeExpenses / (windowDays || 1);
  
  // 2. Factored Upcoming Receipts (Next 30 days)
  const upcomingInvoices = getUpcomingDue(30);
  const upcomingTotal = upcomingInvoices.reduce((sum, inv) => sum + safeNumber(inv.amount), 0);

  // 3. Projections
  const projectedRevenue = avgDailyRevenue * 30;
  const projectedBurn = avgDailyBurn * 30;
  
  const netBalance = safeNumber(balance.netBalance);
  const finalBalance = netBalance + projectedRevenue + upcomingTotal - projectedBurn;

  // Handle pathological cases (e.g. infinite burn due to bad windowing)
  const finalSafeRevenue = isFinite(projectedRevenue) ? projectedRevenue : 0;
  const finalSafeBurn = isFinite(projectedBurn) ? projectedBurn : 0;
  const finalSafeBalance = isFinite(finalBalance) ? finalBalance : netBalance;

  return {
    openingBalance: netBalance,
    avgDailyRevenue: Math.round(isFinite(avgDailyRevenue) ? avgDailyRevenue : 0),
    avgDailyBurn: Math.round(isFinite(avgDailyBurn) ? avgDailyBurn : 0),
    projectedRevenue: Math.round(finalSafeRevenue),
    projectedBurn: Math.round(finalSafeBurn),
    upcomingTotal: Math.round(upcomingTotal),
    finalBalance: Math.round(finalSafeBalance),
    daysOut: 30,
    reasoning: `Based on your last ${windowDays} days, your average daily burn is ₹${Math.round(finalSafeBurn / 30).toLocaleString('en-IN')}. ` +
               `Over the next 30 days, we expect ₹${Math.round(finalSafeRevenue).toLocaleString('en-IN')} in run-rate revenue plus ₹${upcomingTotal.toLocaleString('en-IN')} from specific upcoming invoices.`
  };
}

module.exports = {
  calculate30DayForecast
};
