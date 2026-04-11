const { handleQuery, extractClientName, getHelpText, buildSystemPrompt } = require("../agent/queryAgent");

describe("queryAgent", () => {
  const originalApiKey = process.env.AI_API_KEY;

  beforeEach(() => {
    delete process.env.AI_API_KEY;
  });

  afterAll(() => {
    process.env.AI_API_KEY = originalApiKey;
  });

  test("returns help text without AI", async () => {
    const response = await handleQuery("help");
    expect(response).toBe(getHelpText());
  });

  test("returns deterministic cash balance facts", async () => {
    const response = await handleQuery("What is my current cash balance?");
    expect(response).toContain("−₹12,500");
    expect(response).toContain("₹9,25,500");
  });

  test("returns overdue invoice details without AI", async () => {
    const response = await handleQuery("Show me all overdue invoices");
    expect(response).toContain("exactly 4 overdue invoices");
    expect(response).toContain("INV014");
    expect(response).toContain("₹2,15,500");
  });

  test("returns prediction alert without AI", async () => {
    const response = await handleQuery("What will my cash look like in 30 days?");
    expect(response).toContain("🔴 CASH RUNOUT RISK");
    expect(response).toContain("2026-W16");
  });

  test("asks for client name when reminder query is vague", async () => {
    const response = await handleQuery("Send a payment reminder");
    expect(response).toContain("Please specify");
  });

  test("extractClientName finds known clients", () => {
    expect(extractClientName("Send a payment reminder to Sharma Retail")).toBe("Sharma Retail");
  });

  test("benchmark query for sharma invoice history returns required facts", async () => {
    const response = await handleQuery("What invoices does Sharma Retail have?");
    expect(response).toContain("4 invoices");
    expect(response).toContain("₹96,000");
    expect(response).toContain("3 previous invoices were paid");
  });

  test("benchmark query for runout risk includes risk answer and overdue amount", async () => {
    const response = await handleQuery("Will I run out of cash this month?");
    expect(response.toLowerCase()).toContain("yes");
    expect(response).toContain("₹2,15,500");
  });

  test("benchmark query for anomalies includes logistics and sales spikes", async () => {
    const response = await handleQuery("Are there any unusual patterns in my spending?");
    expect(response).toContain("2026-W08");
    expect(response).toContain("2026-W10");
    expect(response).toContain("+72%");
  });

  test("system prompt includes external validation dataset notes", () => {
    const prompt = buildSystemPrompt({
      netBalance: -12500,
      totalIncome: 925500,
      totalExpenses: 938000,
      overdueCount: 4,
      overdueTotal: 215500,
      highRiskClients: ["Sharma Retail"],
      topExpenseCategory: "salaries",
      externalValidationNotes: ["IBM Finance Factoring: high-risk late-payment signal"]
    });
    expect(prompt).toContain("EXTERNAL VALIDATION REFERENCES");
    expect(prompt).toContain("IBM Finance Factoring");
  });
});
