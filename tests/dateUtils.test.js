/**
 * Tests for date helper wrappers.
 */
const {
  daysPastDue,
  daysUntil,
  formatForDisplay,
  getCurrentWeekLabel,
  getDateRange,
  isOverdue
} = require("../utils/dateUtils");

describe("dateUtils", () => {
  test("isOverdue returns false for today", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(isOverdue(today)).toBe(false);
  });

  test("isOverdue returns true for a past date", () => {
    expect(isOverdue("2020-01-01")).toBe(true);
  });

  test("daysPastDue returns zero for today", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(daysPastDue(today)).toBe(0);
  });

  test("daysPastDue returns positive integer for overdue date", () => {
    expect(daysPastDue("2020-01-01")).toBeGreaterThan(0);
  });

  test("daysUntil returns positive integer for future date", () => {
    expect(daysUntil("2099-01-01")).toBeGreaterThan(0);
  });

  test("getDateRange returns from and to dates", () => {
    const range = getDateRange(30);
    expect(range.from).toBeInstanceOf(Date);
    expect(range.to).toBeInstanceOf(Date);
    expect(range.from.getTime()).toBeLessThan(range.to.getTime());
  });

  test("formatForDisplay uses dd MMM yyyy format", () => {
    expect(formatForDisplay("2026-04-11")).toBe("11 Apr 2026");
  });

  test("getCurrentWeekLabel returns ISO-style week string", () => {
    expect(getCurrentWeekLabel()).toMatch(/^\d{4}-W\d{2}$/);
  });
});
