const { detectAnomalies } = require("../services/anomalyService");

describe("anomalyService", () => {
  test("detects the logistics spike in week 2026-W08", () => {
    const logistics = detectAnomalies().find(
      (anomaly) => anomaly.category === "logistics" && anomaly.week === "2026-W08"
    );

    expect(logistics).toMatchObject({
      type: "expense",
      category: "logistics",
      actual: 36000,
      expected: 23500,
      deviation: "+53%",
      severity: "medium"
    });
  });

  test("detects the sales spike in week 2026-W10", () => {
    const sales = detectAnomalies().find(
      (anomaly) => anomaly.category === "sales" && anomaly.week === "2026-W10"
    );

    expect(sales).toMatchObject({
      type: "income",
      category: "sales",
      actual: 105000,
      expected: 64000,
      deviation: "+64%",
      severity: "medium"
    });
  });

  test("uses actual numbers in the explanation", () => {
    const logistics = detectAnomalies().find(
      (anomaly) => anomaly.category === "logistics" && anomaly.week === "2026-W08"
    );

    expect(logistics.explanation).toContain("₹36,000");
    expect(logistics.explanation).toContain("₹23,500");
  });

  test("returns anomalies sorted by largest deviation first", () => {
    const anomalies = detectAnomalies();
    expect(anomalies[0].deviation).toBe("+64%");
    expect(anomalies[1].deviation).toBe("+53%");
  });
});
