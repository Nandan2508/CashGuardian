const {
  resolveRecipient,
  validateEmailConfig
} = require("../services/emailService");

describe("emailService helper logic", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("resolveRecipient prefers EMAIL_TO override", () => {
    process.env.EMAIL_TO = "demo@example.com";
    expect(resolveRecipient("Sharma Retail")).toBe("demo@example.com");
  });

  test("resolveRecipient falls back to mapped client email", () => {
    delete process.env.EMAIL_TO;
    delete process.env.EMAIL_USER;
    expect(resolveRecipient("Sharma Retail")).toBe("accounts.sharma@example.com");
  });

  test("resolveRecipient falls back to EMAIL_USER when client not mapped", () => {
    delete process.env.EMAIL_TO;
    process.env.EMAIL_USER = "owner@example.com";
    expect(resolveRecipient("Unknown Client")).toBe("owner@example.com");
  });

  test("validateEmailConfig reports missing values", () => {
    delete process.env.EMAIL_HOST;
    delete process.env.EMAIL_PORT;
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;
    delete process.env.EMAIL_FROM;

    const result = validateEmailConfig();
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(
      expect.arrayContaining(["EMAIL_HOST", "EMAIL_PORT", "EMAIL_USER", "EMAIL_PASS", "EMAIL_FROM"])
    );
  });

  test("validateEmailConfig passes with full config", () => {
    process.env.EMAIL_HOST = "smtp.gmail.com";
    process.env.EMAIL_PORT = "587";
    process.env.EMAIL_USER = "owner@example.com";
    process.env.EMAIL_PASS = "app-pass";
    process.env.EMAIL_FROM = "CashGuardian <owner@example.com>";

    const result = validateEmailConfig();
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });
});
