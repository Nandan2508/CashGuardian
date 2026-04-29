const { getCashBalance, summarizeTransactions, getTransactionsInRange, getLatestTransactionDate } = require("./cashFlowService");
const { getUpcomingDue } = require("./invoiceService");
const { safeNumber } = require("../utils/formatter");

/**
 * Calculates a data-driven 30-day cash forecast.
 * @param {string} userId - Authenticated user ID.
 * @param {Array<Object>|null} dataset - Optional custom dataset.
 * @returns {Promise<Object>} Forecast components and final projection.
 */
async function calculate30DayForecast(userId, dataset = null) {
  const balance = await getCashBalance(userId, dataset);
  const latestDate = await getLatestTransactionDate(userId, dataset);
  
  // 1. Calculate Burn Rate (Last 90 days)
  const windowDays = 90;
  const from = new Date(latestDate);
  from.setUTCDate(from.getUTCDate() - (windowDays - 1));
  
  const history = await getTransactionsInRange(userId, from, latestDate, dataset);
  const totals = summarizeTransactions(history);
  
  const income = safeNumber(totals.income);
  const expenses = safeNumber(totals.expenses);
  const avgDailyRevenue = income / (windowDays || 1);
  const avgDailyBurn = expenses / (windowDays || 1);
  
  // 2. Factored Upcoming Receipts (Next 30 days)
  const upcomingInvoices = await getUpcomingDue(userId, 30, dataset);
  const upcomingTotal = upcomingInvoices.reduce((sum, inv) => sum + safeNumber(inv.amount), 0);

  // 3. Projections
  const projectedRevenue = avgDailyRevenue * 30;
  const projectedBurn = avgDailyBurn * 30;
  
  const netBalance = safeNumber(balance.netBalance);
  const finalBalance = netBalance + projectedRevenue + upcomingTotal - projectedBurn;

  // Final validation against Infinity/NaN
  const safeRev = isFinite(projectedRevenue) ? projectedRevenue : 0;
  const safeBurn = isFinite(projectedBurn) ? projectedBurn : 0;
  const safeFinal = isFinite(finalBalance) ? finalBalance : netBalance;

  return {
    openingBalance: netBalance,
    avgDailyRevenue: Math.round(isFinite(avgDailyRevenue) ? avgDailyRevenue : 0),
    avgDailyBurn: Math.round(isFinite(avgDailyBurn) ? avgDailyBurn : 0),
    projectedRevenue: Math.round(safeRev),
    projectedBurn: Math.round(safeBurn),
    upcomingTotal: Math.round(upcomingTotal),
    finalBalance: Math.round(safeFinal),
    daysOut: 30,
    reasoning: `Based on your last ${windowDays} days, your average daily burn is ₹${Math.round(safeBurn / 30).toLocaleString('en-IN')}. ` +
               `Over the next 30 days, we expect ₹${Math.round(safeRev).toLocaleString('en-IN')} in run-rate revenue plus ₹${upcomingTotal.toLocaleString('en-IN')} from specific upcoming invoices.`
  };
}

module.exports = {
  calculate30DayForecast
};
