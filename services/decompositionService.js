const transactions = require("../data/transactions.json");

/**
 * Decomposes a subset of transactions into its components by a grouping field.
 * @param {string} type - 'income' or 'expense'.
 * @param {string|null} categoryFilter - Optional specific category to filter by (e.g., 'sales').
 * @param {string} groupField - Field to group by ('category', 'client', 'region', 'channel').
 * @param {Array<Object>} [dataset] - Optional dataset to analyze.
 * @returns {object} Decomposition result including totals, components, and insights.
 */
function decomposeTransactions(type, categoryFilter = null, groupField = "category", dataset = null) {
  const data = dataset || transactions;
  let filtered = data.filter((t) => t.type === type);

  if (categoryFilter) {
    filtered = filtered.filter(
      (t) => t.category.toLowerCase() === categoryFilter.toLowerCase()
    );
  }

  const total = filtered.reduce((sum, t) => sum + Math.abs(t.amount), 0);

  if (total === 0) {
    return { total: 0, components: [], insights: ["No data found for this breakdown."] };
  }

  const groups = filtered.reduce((acc, t) => {
    const key = t[groupField] || "Other";
    acc[key] = (acc[key] || 0) + Math.abs(t.amount);
    return acc;
  }, {});

  const components = Object.entries(groups)
    .map(([label, value]) => ({
      label,
      value,
      percentage: Math.round((value / total) * 100)
    }))
    .sort((a, b) => b.value - a.value);

  const insights = deriveInsights(components, total);

  return {
    target: categoryFilter || (type === "income" ? "Total Revenue" : "Total Expenses"),
    total,
    groupField,
    components,
    insights
  };
}

/**
 * Derives patterns and insights from component data.
 * @param {Array} components - Grouped data.
 * @param {number} total - Total amount.
 * @returns {string[]} Narrative insights.
 */
function deriveInsights(components, total) {
  const insights = [];

  if (components.length === 0) return insights;

  // 1. Concentration (Top heavy)
  const top = components[0];
  if (top.percentage >= 50) {
    insights.push(
      `High concentration detected: ${top.label} accounts for ${top.percentage}% of the total.`
    );
  } else if (top.percentage >= 30) {
    insights.push(`${top.label} is the primary contributor (${top.percentage}%).`);
  }

  // 2. Outliers (Significant deviation from mean)
  const avg = total / components.length;
  const significantOutliers = components.filter((c) => c.value > avg * 2);
  if (significantOutliers.length > 1 && top.percentage < 50) {
    insights.push(
      `Diverse contribution: ${significantOutliers.length} components are significantly above average.`
    );
  }

  // 3. Fragmentation
  if (components.length > 5 && top.percentage < 20) {
    insights.push("Highly fragmented: No single component dominates the breakdown.");
  }

  return insights;
}

module.exports = {
  decomposeTransactions
};
