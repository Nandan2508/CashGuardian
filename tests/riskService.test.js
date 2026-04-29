const { getClientRisk, getRiskReport } = require("../services/riskService");
const { getInvoices } = require("../services/dataService");

describe("riskService", () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-04-11T00:00:00Z"));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  const mockInvoices = require("../data/invoices.json");

  test("Sharma Retail is classified as HIGH risk", async () => {
    const sharma = getClientRisk("Sharma Retail", mockInvoices);
    expect(sharma).toMatchObject({
      client: "Sharma Retail",
      riskLevel: "HIGH",
      latePayments: 3,
      overdueAmount: 96000,
      recommendation: "Require advance payment or stop credit"
    });
    expect(sharma.riskScore).toBeGreaterThanOrEqual(60);
  });

  test("Patel Distributors is also HIGH risk under the exact formula", async () => {
    const patel = getClientRisk("Patel Distributors", mockInvoices);
    expect(patel).toMatchObject({
      riskLevel: "HIGH",
      overdueAmount: 38500
    });
    expect(patel.riskScore).toBe(62);
  });

  test("Kapoor Traders is MEDIUM because the locked dataset contains one late payment", async () => {
    const kapoor = getClientRisk("Kapoor Traders", mockInvoices);
    expect(kapoor).toMatchObject({
      riskLevel: "MEDIUM",
      overdueAmount: 0
    });
    expect(kapoor.riskScore).toBe(48);
  });

  test("risk report is sorted by descending score", async () => {
    const report = await getRiskReport(null, mockInvoices);
    expect(report[0].client).toBe("Sharma Retail");
    expect(report[0].riskScore).toBeGreaterThan(report[1].riskScore);
  });

  test("unknown clients return null", async () => {
    expect(getClientRisk("Unknown Client", mockInvoices)).toBeNull();
  });
});
