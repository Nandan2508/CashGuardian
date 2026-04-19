const transactions = require("../data/transactions.json");
const { safeDate, safeNumber } = require("../utils/formatter");

/**
 * Returns a UTC date at midnight for consistent range comparisons.
 * @param {string} dateStr - ISO date string.
 * @returns {Date} Parsed date at UTC midnight.
 */
function parseUtcDate(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`);
}

/**
 * Returns the latest transaction date in the dataset.
 * @param {Array<object>} dataset - Optional transaction set.
 * @returns {Date} Latest transaction date.
 */
function getLatestTransactionDate(dataset = transactions) {
  const { safeDate } = require("../utils/formatter");
  const data = dataset && dataset.length > 0 ? dataset : transactions;
  if (!data || !data.length) return new Date();
  const dates = data.map((t) => safeDate(t.date)).filter((d) => !isNaN(d.getTime()));
  return dates.length ? new Date(Math.max(...dates)) : new Date();
}

/**
 * Filters transactions to an inclusive date range.
 * @param {Date} from - Range start.
 * @param {Date} to - Range end.
 * @param {Array<object>} dataset - Optional transaction set.
 * @returns {Array<object>} Filtered transactions.
 */
function getTransactionsInRange(from, to, dataset = transactions) {
  const data = dataset || transactions;
  return data.filter((transaction) => {
    const transactionDate = parseUtcDate(transaction.date);
    return transactionDate >= from && transactionDate <= to;
  });
}

/**
 * Aggregates income and expense totals for a transaction set.
 * @param {Array<object>} items - Transactions to aggregate.
 * @returns {{ income: number, expenses: number, net: number }} Aggregated totals.
 */
function summarizeTransactions(items) {
  const income = items
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + safeNumber(transaction.amount), 0);
  const expenses = items
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + Math.abs(safeNumber(transaction.amount)), 0);

  return {
    income,
    expenses,
    net: income - expenses
  };
}

/**
 * Calculates expense totals by category for a transaction set.
 * @param {Array<object>} items - Transactions to group.
 * @returns {Array<{ category: string, total: number }>} Grouped expense totals.
 */
function getExpenseTotals(items) {
  return Object.entries(
    items
      .filter((transaction) => transaction.type === "expense")
      .reduce((totals, transaction) => {
        totals[transaction.category] = (totals[transaction.category] || 0) + transaction.amount;
        return totals;
      }, {})
  )
    .map(([category, total]) => ({ category, total }))
    .sort((left, right) => right.total - left.total);
}

/**
 * Builds a narrative from current and previous period totals.
 * @param {{ income: number, expenses: number, net: number }} current - Current period totals.
 * @param {{ income: number, expenses: number, net: number }} previous - Previous period totals.
 * @param {{ income: number, expenses: number, net: number }} deltas - Delta values.
 * @param {"week"|"month"} period - Compared period unit.
 * @returns {string} Human-readable comparison summary.
 */
function buildComparisonNarrative(current, previous, deltas, period) {
  const incomeDirection = deltas.income >= 0 ? "up" : "down";
  const expenseDirection = deltas.expenses >= 0 ? "up" : "down";
  const netDirection = deltas.net >= 0 ? "improved" : "worsened";

  return [
    `Compared with the previous ${period}, income is ${incomeDirection} by ₹${Math.abs(deltas.income)}.`,
    `Expenses are ${expenseDirection} by ₹${Math.abs(deltas.expenses)}.`,
    `Overall net cash has ${netDirection} by ₹${Math.abs(deltas.net)}.`
  ].join(" ");
}

/**
 * Returns current net cash position.
 * @param {Array<object>} dataset - Optional transaction set.
 * @returns {{ totalIncome: number, totalExpenses: number, netBalance: number }}
 */
function getCashBalance(dataset = transactions) {
  const data = dataset || transactions;
  const totals = summarizeTransactions(data);

  return {
    totalIncome: totals.income,
    totalExpenses: totals.expenses,
    netBalance: totals.net
  };
}

/**
 * Returns cash flow summary for last N days.
 * @param {number} days - Number of days to summarize.
 * @param {Array<object>} dataset - Optional transaction set.
 * @returns {{ period: string, income: number, expenses: number, net: number, topExpenseCategory: string }}
 */
function getCashSummary(days = 30, dataset = transactions) {
  const data = dataset || transactions;
  const latestDate = getLatestTransactionDate(data);
  const from = new Date(latestDate);
  from.setUTCDate(from.getUTCDate() - (days - 1));

  const periodTransactions = getTransactionsInRange(from, latestDate, data);
  const totals = summarizeTransactions(periodTransactions);
  const topExpenseCategory = getExpenseTotals(periodTransactions)[0];

  return {
    period: `${from.toISOString().slice(0, 10)} to ${latestDate.toISOString().slice(0, 10)}`,
    income: totals.income,
    expenses: totals.expenses,
    net: totals.net,
    topExpenseCategory: topExpenseCategory ? topExpenseCategory.category : "none"
  };
}

/**
 * Returns expenses grouped by category with percentages.
 * @param {Array<object>} dataset - Optional transaction set.
 * @returns {Array<{ category: string, total: number, percentage: string }>}
 */
function getExpenseBreakdown(dataset = transactions) {
  const data = dataset || transactions;
  const expenseTotals = getExpenseTotals(data);
  const totalExpenses = expenseTotals.reduce((sum, item) => sum + item.total, 0);

  return expenseTotals.map((item) => ({
    category: item.category,
    total: item.total,
    percentage: `${totalExpenses > 0 ? Math.round((item.total / totalExpenses) * 100) : 0}%`
  }));
}

/**
 * Calculates the delta between two transaction sets grouped by category.
 * @param {Array<object>} current - Current period transactions.
 * @param {Array<object>} previous - Previous period transactions.
 * @returns {{ income: Array<object>, expenses: Array<object> }} Categorized variances.
 */
function getCategoryVariances(current, previous) {
  const currentIncome = summarizeByCategory(current.filter(t => t.type === 'income'));
  const currentExpenses = summarizeByCategory(current.filter(t => t.type === 'expense'));
  const prevIncome = summarizeByCategory(previous.filter(t => t.type === 'income'));
  const prevExpenses = summarizeByCategory(previous.filter(t => t.type === 'expense'));

  const calculatePct = (curr, prev) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  };

  const incomeVariances = Object.keys({ ...currentIncome, ...prevIncome }).map(cat => {
    const curr = currentIncome[cat] || 0;
    const prev = prevIncome[cat] || 0;
    return {
      category: cat,
      current: curr,
      previous: prev,
      delta: curr - prev,
      percentage: calculatePct(curr, prev)
    };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const expenseVariances = Object.keys({ ...currentExpenses, ...prevExpenses }).map(cat => {
    const curr = currentExpenses[cat] || 0;
    const prev = prevExpenses[cat] || 0;
    return {
      category: cat,
      current: curr,
      previous: prev,
      delta: curr - prev,
      percentage: calculatePct(curr, prev)
    };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return { income: incomeVariances, expenses: expenseVariances };
}

function summarizeByCategory(items) {
  return items.reduce((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + safeNumber(t.amount);
    return acc;
  }, {});
}

/**
 * Summarizes performance metrics for a specific entity search string.
 * @param {string} entity - Search term (client, category, or desc keyword).
 * @param {Array<Object>} dataset - Optional transaction set.
 * @returns {object} Aggregated metrics.
 */
function summarizeEntityMetrics(entity, dataset = transactions, windowDays = 90) {
  const { safeNumber, safeDate } = require("../utils/formatter");
  const data = dataset || transactions;
  const norm = entity.trim().toLowerCase();
  
  const latestDateInSet = getLatestTransactionDate(data);
  const cutoffDate = new Date(latestDateInSet);
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - windowDays);

  const matches = data.filter(t => {
    const d = safeDate(t.date);
    if (d < cutoffDate) return false;
    
    return (t.client && t.client.toLowerCase().includes(norm)) ||
      (t.category && t.category.toLowerCase().includes(norm)) ||
      (t.region && t.region.toLowerCase().includes(norm)) ||
      (t.channel && t.channel.toLowerCase().includes(norm)) ||
      (t.description && t.description.toLowerCase().includes(norm));
  });

  const revenue = matches.filter(t => t.type === 'income' || t.type === 'sales').reduce((s,t) => s + safeNumber(t.amount), 0);
  const costs = matches.filter(t => t.type === 'expense' || t.amount < 0 || t.type === 'outgo').reduce((s,t) => s + Math.abs(safeNumber(t.amount)), 0);
  const volume = matches.length;
  
  // Growth WoW (Last 7 days vs 7 days before)
  const latest = getLatestTransactionDate(data);
  const cStart = new Date(latest); cStart.setUTCDate(cStart.getUTCDate() - 6);
  const pEnd = new Date(cStart); pEnd.setUTCDate(pEnd.getUTCDate() - 1);
  const pStart = new Date(pEnd); pStart.setUTCDate(pStart.getUTCDate() - 6);
  
  const cVolume = matches.filter(t => { const d = safeDate(t.date); return d >= cStart && d <= latest; }).length;
  const pVolume = matches.filter(t => { const d = safeDate(t.date); return d >= pStart && d <= pEnd; }).length;
  
  return {
    revenue,
    costs,
    volume,
    avgTicket: volume > 0 ? Math.round(revenue / (matches.filter(t => t.type === 'income').length || 1)) : 0,
    growth: pVolume > 0 ? Math.round(((cVolume - pVolume) / pVolume) * 100) : 0
  };
}

/**
 * Performs a side-by-side comparison of two entities.
 * @param {string} a - First entity keyword.
 * @param {string} b - Second entity keyword.
 * @param {Array<Object>} dataset - Optional transaction set.
 * @returns {object} Head-to-head comparison result.
 */
function compareEntities(a, b, dataset = transactions) {
  const data = dataset || transactions;
  const entityA = { name: a, ...summarizeEntityMetrics(a, data) };
  const entityB = { name: b, ...summarizeEntityMetrics(b, data) };

  // Determine Leader based on Revenue
  const leader = entityA.revenue > entityB.revenue ? entityA : entityB;
  const laggard = entityA.revenue > entityB.revenue ? entityB : entityA;
  const gap = laggard.revenue > 0 ? Math.round(((leader.revenue - laggard.revenue) / laggard.revenue) * 100) : 100;

  return {
    entityA,
    entityB,
    analysis: {
      leader: leader.name,
      gapPct: gap,
      narrative: `${leader.name} is the current leader in this duel, outperforming ${laggard.name} by ${gap}% in total revenue.`
    }
  };
}

/**
 * Compares current period vs previous period.
 * @param {"week"|"month"|Object} period - Period granularity or custom range object.
 * @param {number} unitsBack - How many units wide the current/previous windows are.
 * @param {Array<Object>} dataset - Optional transaction set.
 * @returns {{ current: object, previous: object, deltas: { income: number, expenses: number, net: number }, narrative: string }}
 */
function comparePeriods(period, unitsBack = 1, dataset = transactions) {
  const data = dataset || transactions;
  const latestDate = getLatestTransactionDate(data);
  let currentStart, currentEnd, previousStart, previousEnd;
  let periodName = period;

  if (typeof period === "object" && period.target && period.baseline) {
    currentStart = period.target.start;
    currentEnd = period.target.end;
    previousStart = period.baseline.start;
    previousEnd = period.baseline.end;
    periodName = period.name || "custom period";
  } else if (period === "week") {
    currentStart = new Date(latestDate);
    currentStart.setUTCDate(currentStart.getUTCDate() - (7 * unitsBack) + 1);
    currentEnd = latestDate;
    previousEnd = new Date(currentStart);
    previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
    previousStart = new Date(previousEnd);
    previousStart.setUTCDate(previousStart.getUTCDate() - (7 * unitsBack) + 1);
  } else if (period === "month") {
    currentStart = new Date(Date.UTC(latestDate.getUTCFullYear(), latestDate.getUTCMonth() - unitsBack + 1, 1));
    if (unitsBack === 1) {
      currentStart = new Date(Date.UTC(latestDate.getUTCFullYear(), latestDate.getUTCMonth(), 1));
    }
    currentEnd = latestDate;
    previousEnd = new Date(currentStart);
    previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
    previousStart = new Date(Date.UTC(previousEnd.getUTCFullYear(), previousEnd.getUTCMonth() - unitsBack + 1, 1));
    if (unitsBack === 1) {
      previousStart = new Date(Date.UTC(previousEnd.getUTCFullYear(), previousEnd.getUTCMonth(), 1));
    }
  } else {
    throw new Error("period must be 'week', 'month' or a custom range object");
  }

  const currentTransactions = getTransactionsInRange(currentStart, currentEnd, data);
  const previousTransactions = getTransactionsInRange(previousStart, previousEnd, data);
  const current = summarizeTransactions(currentTransactions);
  const previous = summarizeTransactions(previousTransactions);
  const deltas = {
    income: current.income - previous.income,
    expenses: current.expenses - previous.expenses,
    net: current.net - previous.net
  };

  return {
    current: {
      ...current,
      period: `${currentStart.toISOString().slice(0, 10)} to ${currentEnd.toISOString().slice(0, 10)}`
    },
    previous: {
      ...previous,
      period: `${previousStart.toISOString().slice(0, 10)} to ${previousEnd.toISOString().slice(0, 10)}`
    },
    deltas,
    currentTrend: calculateWeeklyTrend(data, 0, currentEnd, typeof period === "object"),
    previousTrend: calculateWeeklyTrend(data, 0, previousEnd, typeof period === "object"),
    variances: getCategoryVariances(currentTransactions, previousTransactions),
    narrative: buildComparisonNarrative(current, previous, deltas, periodName)
  };
}


/**
 * Helper to group transactions into weekly buckets for the trend graph.
 * @param {Array<Object>} transactions - List of transaction objects.
 * @param {number} weekOffset - Number of weeks to shift back (0 for current, 13 for previous).
 * @param {Date} anchorDate - Relative "now" for the trend.
 * @param {boolean} normalizeLabels - If true, use generic "Week 1, Week 2..." labels.
 * @returns {{ labels: string[], revenue: number[], expenses: number[] }}
 */
function calculateWeeklyTrend(transactions, weekOffset = 0, anchorDate = null, normalizeLabels = false) {
  if (!transactions.length && !anchorDate) return { labels: [], revenue: [], expenses: [] };

  const absoluteLatest = anchorDate || getLatestTransactionDate(transactions);
  const earliestInData = transactions.length > 0 ? new Date(Math.min(...transactions.map(t => safeDate(t.date)))) : absoluteLatest;
  
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const offsetMs = weekOffset * weekMs;
  const latest = new Date(absoluteLatest.getTime() - offsetMs);

  // Calculate dynamic history length (capped at 13 weeks, floored at 4 for stability)
  const diffMs = absoluteLatest.getTime() - earliestInData.getTime();
  const calculatedWeeks = Math.ceil(diffMs / weekMs);
  
  // FORCE ALIGNMENT: If comparing, use a fixed 13-week window so both periods match
  const loopCount = normalizeLabels ? 12 : Math.max(4, Math.min(calculatedWeeks + 1, 13));

  const trend = { labels: [], revenue: [], expenses: [] };

  for (let i = loopCount - 1; i >= 0; i--) {
    const weekEnd = new Date(latest.getTime() - (i * weekMs));
    const weekStart = new Date(weekEnd.getTime() - weekMs);
    const weekNum = Math.ceil((weekEnd.getTime() - new Date(weekEnd.getFullYear(), 0, 1).getTime()) / weekMs);
    
    if (normalizeLabels) {
      trend.labels.push(`Week ${loopCount - i}`);
    } else {
      trend.labels.push(`W${weekNum}`);
    }

    const weekTransactions = transactions.filter(t => {
      const d = safeDate(t.date);
      return d > weekStart && d <= weekEnd;
    });

    const income = weekTransactions.filter(t => t.type === 'income').reduce((s, t) => s + safeNumber(t.amount), 0);
    const expense = weekTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(safeNumber(t.amount)), 0);

    trend.revenue.push(income);
    trend.expenses.push(expense);
  }

  return trend;
}

/**
 * Builds a leadership-ready narrative for period comparisons.
 * @param {object} current - Current period summary.
 * @param {object} previous - Previous period summary.
 * @param {object} deltas - Calculated changes.
 * @param {string} period - Name of the period (e.g., 'March vs February').
 * @returns {string} Human-readable narrative.
 */
function buildComparisonNarrative(current, previous, deltas, period) {
  const { formatCurrency } = require("../utils/formatter");
  const incomeChangePct = previous.income !== 0 ? Math.round((deltas.income / previous.income) * 100) : 0;
  const expenseChangePct = previous.expenses !== 0 ? Math.round((deltas.expenses / previous.expenses) * 100) : 0;
  
  const status = deltas.net >= 0 ? "improved" : "worsened";
  const incomeDir = deltas.income >= 0 ? "increased" : "decreased";
  const expenseDir = deltas.expenses >= 0 ? "rise" : "drop";
  
  let narrative = `${period.charAt(0).toUpperCase() + period.slice(1)}: Revenue ${incomeDir} by ${Math.abs(incomeChangePct)}%. `;
  
  if (Math.abs(deltas.expenses) > Math.abs(deltas.income) && deltas.expenses > 0) {
    narrative += `The biggest driver was a ${Math.abs(expenseChangePct)}% ${expenseDir} in spending. `;
  }
  
  narrative += `Net position has ${status} by ${formatCurrency(Math.abs(deltas.net))}.`;
  
  return narrative;
}

module.exports = {
  getCashBalance,
  getCashSummary,
  getExpenseBreakdown,
  comparePeriods,
  compareEntities,
  getLatestTransactionDate,
  getTransactionsInRange,
  getCategoryVariances,
  summarizeTransactions,
  getExpenseTotals,
  calculateWeeklyTrend
};
