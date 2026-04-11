const transactions = require("../data/transactions.json");

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
 * @returns {Date} Latest transaction date.
 */
function getLatestTransactionDate() {
  return transactions.reduce((latest, transaction) => {
    const transactionDate = parseUtcDate(transaction.date);
    return transactionDate > latest ? transactionDate : latest;
  }, parseUtcDate(transactions[0].date));
}

/**
 * Filters transactions to an inclusive date range.
 * @param {Date} from - Range start.
 * @param {Date} to - Range end.
 * @returns {Array<object>} Filtered transactions.
 */
function getTransactionsInRange(from, to) {
  return transactions.filter((transaction) => {
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
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const expenses = items
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

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
 * Ground truth: income=925500, expenses=938000, net=-12500
 * @returns {{ totalIncome: number, totalExpenses: number, netBalance: number }}
 */
function getCashBalance() {
  const totals = summarizeTransactions(transactions);

  return {
    totalIncome: totals.income,
    totalExpenses: totals.expenses,
    netBalance: totals.net
  };
}

/**
 * Returns cash flow summary for last N days.
 * @param {number} days - Number of days to summarize.
 * @returns {{ period: string, income: number, expenses: number, net: number, topExpenseCategory: string }}
 */
function getCashSummary(days = 30) {
  const latestDate = getLatestTransactionDate();
  const from = new Date(latestDate);
  from.setUTCDate(from.getUTCDate() - (days - 1));

  const periodTransactions = getTransactionsInRange(from, latestDate);
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
 * Ground truth: salaries=360000(38%), logistics=318000(34%), rent=180000(19%)
 * @returns {Array<{ category: string, total: number, percentage: string }>}
 */
function getExpenseBreakdown() {
  const expenseTotals = getExpenseTotals(transactions);
  const totalExpenses = expenseTotals.reduce((sum, item) => sum + item.total, 0);

  return expenseTotals.map((item) => ({
    category: item.category,
    total: item.total,
    percentage: `${Math.round((item.total / totalExpenses) * 100)}%`
  }));
}

/**
 * Compares current period vs previous period.
 * @param {"week"|"month"} period - Period granularity.
 * @param {number} unitsBack - How many units wide the current/previous windows are.
 * @returns {{ current: object, previous: object, deltas: { income: number, expenses: number, net: number }, narrative: string }}
 */
function comparePeriods(period, unitsBack = 1) {
  const latestDate = getLatestTransactionDate();
  let currentStart;
  let previousStart;
  let previousEnd;

  if (period === "week") {
    currentStart = new Date(latestDate);
    currentStart.setUTCDate(currentStart.getUTCDate() - (7 * unitsBack) + 1);
    previousEnd = new Date(currentStart);
    previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
    previousStart = new Date(previousEnd);
    previousStart.setUTCDate(previousStart.getUTCDate() - (7 * unitsBack) + 1);
  } else if (period === "month") {
    currentStart = new Date(Date.UTC(latestDate.getUTCFullYear(), latestDate.getUTCMonth() - unitsBack + 1, 1));
    if (unitsBack === 1) {
      currentStart = new Date(Date.UTC(latestDate.getUTCFullYear(), latestDate.getUTCMonth(), 1));
    }
    previousEnd = new Date(currentStart);
    previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
    previousStart = new Date(Date.UTC(previousEnd.getUTCFullYear(), previousEnd.getUTCMonth() - unitsBack + 1, 1));
    if (unitsBack === 1) {
      previousStart = new Date(Date.UTC(previousEnd.getUTCFullYear(), previousEnd.getUTCMonth(), 1));
    }
  } else {
    throw new Error("period must be 'week' or 'month'");
  }

  const currentTransactions = getTransactionsInRange(currentStart, latestDate);
  const previousTransactions = getTransactionsInRange(previousStart, previousEnd);
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
      period: `${currentStart.toISOString().slice(0, 10)} to ${latestDate.toISOString().slice(0, 10)}`
    },
    previous: {
      ...previous,
      period: `${previousStart.toISOString().slice(0, 10)} to ${previousEnd.toISOString().slice(0, 10)}`
    },
    deltas,
    narrative: buildComparisonNarrative(current, previous, deltas, period)
  };
}

module.exports = {
  getCashBalance,
  getCashSummary,
  getExpenseBreakdown,
  comparePeriods
};
