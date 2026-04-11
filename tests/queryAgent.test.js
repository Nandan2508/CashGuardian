const { handleQuery, extractClientName, getHelpText } = require("../agent/queryAgent");

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

  test("returns missing-key warning plus cash balance facts", async () => {
    const response = await handleQuery("What is my current cash balance?");
    expect(response).toContain("AI_API_KEY not set");
    expect(response).toContain("−₹12,500");
    expect(response).toContain("₹9,25,500");
  });

  test("returns overdue invoice details without AI", async () => {
    const response = await handleQuery("Show me all overdue invoices");
    expect(response).toContain("4 invoices are overdue");
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
});
