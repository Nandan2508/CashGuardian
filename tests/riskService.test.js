const { getClientRisk, getRiskReport } = require("../services/riskService");

describe("riskService", () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-04-11T00:00:00Z"));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  test("Sharma Retail is classified as HIGH risk", () => {
    const sharma = getClientRisk("Sharma Retail");
    expect(sharma).toMatchObject({
      client: "Sharma Retail",
      riskLevel: "HIGH",
      latePayments: 3,
      overdueAmount: 96000,
      recommendation: "Require advance payment or stop credit"
    });
    expect(sharma.riskScore).toBeGreaterThanOrEqual(60);
  });

  test("Patel Distributors is also HIGH risk under the exact formula", () => {
    const patel = getClientRisk("Patel Distributors");
    expect(patel).toMatchObject({
      riskLevel: "HIGH",
      overdueAmount: 38500
    });
    expect(patel.riskScore).toBe(62);
  });

  test("Kapoor Traders is MEDIUM because the locked dataset contains one late payment", () => {
    const kapoor = getClientRisk("Kapoor Traders");
    expect(kapoor).toMatchObject({
      riskLevel: "MEDIUM",
      overdueAmount: 0
    });
    expect(kapoor.riskScore).toBe(48);
  });

  test("risk report is sorted by descending score", () => {
    const report = getRiskReport();
    expect(report[0].client).toBe("Sharma Retail");
    expect(report[0].riskScore).toBeGreaterThan(report[1].riskScore);
  });

  test("unknown clients return null", () => {
    expect(getClientRisk("Unknown Client")).toBeNull();
  });
});
