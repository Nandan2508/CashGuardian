jest.mock("../services/dataService", () => ({
  getTransactions: jest.fn().mockResolvedValue(require("../data/transactions.json")),
  getInvoices: jest.fn().mockResolvedValue(require("../data/invoices.json")),
  getClients: jest.fn().mockResolvedValue([])
}));

const { handleQuery, extractClientName, getHelpText, buildSystemPrompt } = require("../agent/queryAgent");

describe("queryAgent", () => {
  const originalApiKey = process.env.AI_API_KEY;

  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-04-11T00:00:00Z"));
  });

  beforeEach(() => {
    delete process.env.AI_API_KEY;
  });

  afterAll(() => {
    process.env.AI_API_KEY = originalApiKey;
    jest.useRealTimers();
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
    expect(response).toContain("exactly 4 overdue individual invoices");
    expect(response).toContain("INV014");
    expect(response).toContain("₹2,15,500");
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
    expect(response).toContain("3 previously paid invoices were late");
  });



  test("benchmark query for anomalies includes logistics and sales spikes", async () => {
    const response = await handleQuery("Are there any unusual patterns in my spending?");
    expect(response).toContain("2026-W08");
    expect(response).toContain("2026-W10");
    expect(response).toContain("53%");
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
