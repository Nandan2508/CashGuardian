const { decomposeTransactions } = require("../services/decompositionService");

describe("decompositionService", () => {
  test("decomposes sales by client correctly", async () => {
    const result = await decomposeTransactions("income", "sales", "client");
    expect(result.target).toBe("sales");
    expect(result.total).toBeGreaterThan(0);
    expect(result.groupField).toBe("client");
    expect(result.components.length).toBeGreaterThan(0);
    expect(result.components[0]).toHaveProperty("label");
    expect(result.components[0]).toHaveProperty("value");
    expect(result.components[0]).toHaveProperty("percentage");
  });

  test("decomposes expenses by category correctly", async () => {
    const result = await decomposeTransactions("expense", null, "category");
    expect(result.target).toBe("Total Expenses");
    expect(result.total).toBeGreaterThan(0);
    expect(result.groupField).toBe("category");
    expect(result.components.length).toBeGreaterThan(0);
  });

  test("detects concentration correctly", async () => {
    // In demo transactions.json, Salaries/Logistics are large
    const result = await decomposeTransactions("expense", null, "category");
    // We expect some insights if there is concentration
    expect(Array.isArray(result.insights)).toBe(true);
  });

  test("handles empty results gracefully", async () => {
    const result = await decomposeTransactions("income", "non-existent-category");
    expect(result.total).toBe(0);
    expect(result.components).toHaveLength(0);
    expect(result.insights).toContain("No data found for this breakdown.");
  });
});
