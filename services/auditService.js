const { pool } = require("./dataService");

/**
 * Logs a user interaction to the audit_logs table.
 * @param {number|string} userId - ID of the user.
 * @param {string} query - The user's input query.
 * @param {string} intent - The classified intent.
 * @param {number} latency - Response time in ms.
 * @param {string} status - 'ALLOWED' or 'BLOCKED'.
 */
async function logInteraction(userId, query, intent, latency, status) {
  try {
    const uid = parseInt(userId);
    if (isNaN(uid)) {
        console.warn("[AUDIT] Skipping log: Invalid userId", userId);
        return;
    }
    await pool.query(
      "INSERT INTO audit_logs (user_id, query, intent, latency_ms, status) VALUES ($1, $2, $3, $4, $5)",
      [uid, query, intent, latency, status]
    );
  } catch (err) {
    console.error("Audit Logging DB Error:", err.message);
  }
}

module.exports = { logInteraction };
