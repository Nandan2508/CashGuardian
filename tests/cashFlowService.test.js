const {
  comparePeriods,
  getCashBalance,
  getCashSummary,
  getExpenseBreakdown
} = require("../services/cashFlowService");

describe("cashFlowService", () => {
  test("getCashBalance returns benchmark totals", () => {
    expect(getCashBalance()).toEqual({
      totalIncome: 925500,
      totalExpenses: 938000,
      netBalance: -12500
    });
  });

  test("getCashSummary returns last 30-day totals", () => {
    expect(getCashSummary()).toEqual({
      period: "2026-03-12 to 2026-04-10",
      income: 260000,
      expenses: 292500,
      net: -32500,
      topExpenseCategory: "salaries"
    });
  });

  test("getExpenseBreakdown is sorted descending", () => {
    const breakdown = getExpenseBreakdown();
    expect(breakdown[0]).toEqual({ category: "salaries", total: 360000, percentage: "38%" });
    expect(breakdown[1]).toEqual({ category: "logistics", total: 318000, percentage: "34%" });
    expect(breakdown[2]).toEqual({ category: "rent", total: 180000, percentage: "19%" });
  });

  test("getExpenseBreakdown includes all categories", () => {
    expect(getExpenseBreakdown()).toHaveLength(6);
  });

  test("comparePeriods month compares current month against previous month", () => {
    const comparison = comparePeriods("month");
    expect(comparison.current).toMatchObject({
      period: "2026-04-01 to 2026-04-10",
      income: 62000,
      expenses: 89000,
      net: -27000
    });
    expect(comparison.previous).toMatchObject({
      period: "2026-03-01 to 2026-03-31",
      income: 376000,
      expenses: 423500,
      net: -47500
    });
    expect(comparison.deltas).toEqual({
      income: -314000,
      expenses: -334500,
      net: 20500
    });
  });

  test("comparePeriods week returns a narrative", () => {
    const comparison = comparePeriods("week");
    expect(comparison.narrative).toContain("Compared with the previous week");
    expect(comparison.current.period).toBe("2026-04-04 to 2026-04-10");
  });
});
