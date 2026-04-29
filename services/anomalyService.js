const { getTransactions } = require("./dataService");

/**
 * Builds a simple week label from a transaction date string.
 * @param {string} dateStr - ISO date string.
 * @returns {string} Year-week label.
 */
function getWeekLabel(dateStr) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const year = date.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const dayOfYear = Math.floor((date - start) / 86400000) + 1;
  const weekNumber = Math.ceil(dayOfYear / 7);
  return `${year}-W${String(weekNumber).padStart(2, "0")}`;
}

/**
 * Maps a percentage deviation to a severity band.
 * @param {number} deviation - Percentage deviation.
 * @returns {"low"|"medium"|"high"} Severity label.
 */
function getSeverity(deviation) {
  if (deviation > 70) return "high";
  if (deviation > 40) return "medium";
  return "low";
}

/**
 * Detects anomalies in income and expense patterns.
 * @param {number} userId - Authenticated user ID.
 * @param {Array<Object>} [customTransactions] - Optional custom data to analyze.
 * @returns {Promise<Array<Object>>}
 */
async function detectAnomalies(userId, customTransactions = null) {
  const sourceData = await getTransactions(userId, customTransactions);
  const weeks = [...new Set(sourceData.map((transaction) => getWeekLabel(transaction.date)))].sort();
  
  const groupedBySeries = sourceData.reduce((seriesMap, transaction) => {
    const seriesKey = `${transaction.type}|${transaction.category}`;
    const week = getWeekLabel(transaction.date);

    if (!seriesMap[seriesKey]) {
      seriesMap[seriesKey] = {};
    }

    seriesMap[seriesKey][week] = (seriesMap[seriesKey][week] || 0) + Number(transaction.amount);
    return seriesMap;
  }, {});

  const anomalies = [];

  Object.entries(groupedBySeries).forEach(([seriesKey, valuesByWeek]) => {
    const [type, category] = seriesKey.split("|");

    weeks.forEach((week, index) => {
      const actual = valuesByWeek[week] || 0;
      const previousWeeks = weeks
        .slice(Math.max(0, index - 8), index)
        .map((previousWeek) => valuesByWeek[previousWeek] || 0)
        .filter((value) => value > 0);

      // Sensitivity: Require at least 2 data points for analysis in a 2-month window
      if (actual === 0 || previousWeeks.length < 2) {
        return;
      }

      const expected = previousWeeks.reduce((sum, value) => sum + value, 0) / previousWeeks.length;
      const deviationValue = ((actual - expected) / expected) * 100;

      if (deviationValue <= 25) {
        return;
      }

      const roundedExpected = Math.round(expected);
      const roundedDeviation = Math.round(deviationValue);
      const severity = getSeverity(roundedDeviation);
      const explanation = type === "expense"
        ? `${category.charAt(0).toUpperCase() + category.slice(1)} expenses in week ${week} were ₹${actual.toLocaleString("en-IN")} (+${roundedDeviation}% higher than the usual ₹${roundedExpected.toLocaleString("en-IN")}). This may indicate a one-off operational spike.`
        : `${category.charAt(0).toUpperCase() + category.slice(1)} income in week ${week} were ₹${actual.toLocaleString("en-IN")} (+${roundedDeviation}% higher than the usual ₹${roundedExpected.toLocaleString("en-IN")}). This may indicate an unusually strong collection or sales week.`;

      anomalies.push({
        type,
        category,
        week,
        actual,
        expected: roundedExpected,
        deviation: `+${roundedDeviation}%`,
        severity,
        explanation
      });
    });
  });

  return anomalies.sort((left, right) => parseInt(right.deviation, 10) - parseInt(left.deviation, 10));
}

module.exports = {
  detectAnomalies,
  getSeverity
};
