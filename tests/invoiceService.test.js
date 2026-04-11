const { getInvoicesByClient, getOverdueInvoices, getUpcomingDue } = require("../services/invoiceService");

describe("invoiceService", () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-04-11T00:00:00Z"));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  test("getOverdueInvoices returns the four overdue invoices in descending order", () => {
    const overdue = getOverdueInvoices();
    expect(overdue).toHaveLength(4);
    expect(overdue.map((invoice) => invoice.id)).toEqual(["INV014", "INV015", "INV016", "INV017"]);
    expect(overdue.map((invoice) => invoice.daysOverdue)).toEqual([20, 14, 8, 4]);
  });

  test("getOverdueInvoices returns expected total overdue amount", () => {
    const total = getOverdueInvoices().reduce((sum, invoice) => sum + invoice.amount, 0);
    expect(total).toBe(215500);
  });

  test("getInvoicesByClient returns Sharma Retail history", () => {
    expect(getInvoicesByClient("Sharma Retail")).toHaveLength(4);
  });

  test("getInvoicesByClient is case-insensitive", () => {
    expect(getInvoicesByClient("sharma retail")).toHaveLength(4);
  });

  test("getUpcomingDue returns only invoices inside the requested window", () => {
    expect(getUpcomingDue(7).map((invoice) => invoice.id)).toEqual(["INV018"]);
    expect(getUpcomingDue(30).map((invoice) => invoice.id)).toEqual(["INV018", "INV019", "INV020"]);
  });
});
