const mockTransactions = [
  { id: "TXN001", date: "2026-04-10", type: "income", amount: 100000, category: "sales", description: "Retail sales", client: "Sharma Retail" },
  { id: "TXN002", date: "2026-04-09", type: "income", amount: 30000, category: "consulting", description: "Advisory income", client: "Patel Distributors" },
  { id: "TXN003", date: "2026-04-08", type: "expense", amount: 50000, category: "salaries", description: "Payroll" },
  { id: "TXN004", date: "2026-04-07", type: "expense", amount: 40000, category: "logistics", description: "Freight" },
  { id: "TXN005", date: "2026-04-03", type: "income", amount: 90000, category: "sales", description: "Wholesale sales", client: "Kapoor Traders" },
  { id: "TXN006", date: "2026-04-02", type: "expense", amount: 20000, category: "rent", description: "Warehouse rent" },
  { id: "TXN007", date: "2026-03-28", type: "income", amount: 10000, category: "refund", description: "Vendor refund", client: "Sharma Retail" },
  { id: "TXN008", date: "2026-03-25", type: "expense", amount: 15000, category: "utilities", description: "Power" }
];

const mockInvoices = [
  { id: "INV014", client: "Sharma Retail", amount: 96000, issueDate: "2026-03-01", dueDate: "2026-03-22", status: "overdue", paymentHistory: [] },
  { id: "INV011", client: "Sharma Retail", amount: 25000, issueDate: "2026-02-01", dueDate: "2026-02-15", status: "paid", paymentHistory: ["2026-02-25"] },
  { id: "INV012", client: "Sharma Retail", amount: 18000, issueDate: "2026-02-18", dueDate: "2026-03-01", status: "paid", paymentHistory: ["2026-03-08"] },
  { id: "INV013", client: "Sharma Retail", amount: 22000, issueDate: "2026-03-05", dueDate: "2026-03-16", status: "paid", paymentHistory: ["2026-03-22"] },
  { id: "INV015", client: "Patel Distributors", amount: 38500, issueDate: "2026-03-15", dueDate: "2026-03-28", status: "overdue", paymentHistory: [] },
  { id: "INV016", client: "Kapoor Traders", amount: 12000, issueDate: "2026-04-01", dueDate: "2026-04-18", status: "unpaid", paymentHistory: [] }
];

jest.mock("../services/dataService", () => ({
  getTransactions: jest.fn().mockResolvedValue(mockTransactions),
  getInvoices: jest.fn().mockResolvedValue(mockInvoices),
  getClients: jest.fn().mockResolvedValue({
    "Sharma Retail": "sharma@example.com"
  })
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

  test("returns expense breakdown as a table without AI", async () => {
    const response = await handleQuery("Show me expense breakdown");
    expect(response).toContain("#### Expense Breakdown");
    expect(response).toContain("Category");
    expect(response).toContain("salaries");
  });

  test("returns income breakdown grouped by revenue type", async () => {
    const response = await handleQuery("Show me income breakdown");
    expect(response).toContain("Revenue Type");
    expect(response).toContain("sales");
    expect(response).toContain("consulting");
  });

  test("returns overdue client history using dynamic overdue logic", async () => {
    const response = await handleQuery("What invoices does Sharma Retail have?");
    expect(response).toContain("4 invoices");
    expect(response).toContain("Current overdue: ₹96,000");
    expect(response).toContain("3 previously paid invoices were late");
  });

  test("weekly summary includes actions and collections context", async () => {
    const response = await handleQuery("Give me a weekly summary");
    expect(response).toContain("Recommended actions:");
    expect(response).toContain("Collections risk remains material");
  });

  test("extractClientName finds known clients", () => {
    expect(extractClientName("Send a payment reminder to Sharma Retail", mockTransactions)).toBe("Sharma Retail");
  });

  test("system prompt includes external validation dataset notes", () => {
    const prompt = buildSystemPrompt({
      netBalance: 105000,
      totalIncome: 230000,
      totalExpenses: 125000,
      overdueCount: 2,
      overdueTotal: 134500,
      highRiskClients: ["Sharma Retail"],
      topExpenseCategory: "salaries",
      externalValidationNotes: ["IBM Finance Factoring: high-risk late-payment signal"],
      anomalies: [],
      variances: null
    });
    expect(prompt).toContain("EXTERNAL VALIDATION REFERENCES");
    expect(prompt).toContain("IBM Finance Factoring");
  });
});
