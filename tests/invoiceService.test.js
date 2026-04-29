const { getInvoicesByClient, getOverdueInvoices, getUpcomingDue } = require("../services/invoiceService");

describe("invoiceService", () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-04-11T00:00:00Z"));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  const mockInvoices = require("../data/invoices.json");

  test("getOverdueInvoices returns the four overdue invoices in descending order", async () => {
    const overdue = await getOverdueInvoices(null, mockInvoices);
    expect(overdue).toHaveLength(4);
    expect(overdue.map((invoice) => invoice.id)).toEqual(["INV014", "INV015", "INV016", "INV017"]);
    expect(overdue.map((invoice) => invoice.daysOverdue)).toEqual([20, 14, 8, 4]);
  });

  test("getOverdueInvoices returns expected total overdue amount", async () => {
    const overdue = await getOverdueInvoices(null, mockInvoices);
    const total = overdue.reduce((sum, invoice) => sum + invoice.amount, 0);
    expect(total).toBe(215500);
  });

  test("getInvoicesByClient returns Sharma Retail history", async () => {
    const invoices = await getInvoicesByClient(null, "Sharma Retail", mockInvoices);
    expect(invoices).toHaveLength(4);
  });

  test("getInvoicesByClient is case-insensitive", async () => {
    const invoices = await getInvoicesByClient(null, "sharma retail", mockInvoices);
    expect(invoices).toHaveLength(4);
  });

  test("getUpcomingDue returns only invoices inside the requested window", async () => {
    const upcoming7 = await getUpcomingDue(null, 7, mockInvoices);
    const upcoming30 = await getUpcomingDue(null, 30, mockInvoices);
    expect(upcoming7.map((invoice) => invoice.id)).toEqual(["INV018"]);
    expect(upcoming30.map((invoice) => invoice.id)).toEqual(["INV018", "INV019", "INV020"]);
  });
});
