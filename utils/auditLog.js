const { pool } = require("../services/dataService");

/**
 * Silently logs an action to the database.
 * Fire-and-forget: Errors are caught internally to prevent app crashes.
 */
async function auditLog(userId, action, resource, ip = '0.0.0.0', meta = {}) {
    const cleanIp = (ip && typeof ip === 'string') ? ip.replace('::ffff:', '') : '0.0.0.0';
    console.log(`[AUDIT_ATTEMPT] Action: ${action}, User: ${userId}, IP: ${cleanIp}`);

    try {
        const query = `
            INSERT INTO audit_logs (user_id, action, resource, ip_address, meta)
            VALUES ($1, $2, $3, $4, $5)
        `;
        const uid = userId ? parseInt(userId) : null;
        if (!meta.status) meta.status = 'SUCCESS';

        const result = await pool.query(query, [uid, action, resource, cleanIp, JSON.stringify(meta)]);
        console.log(`[AUDIT_SUCCESS] ${action} saved to DB (ID: ${result.rows[0]?.id || 'N/A'})`);
    } catch (err) {
        console.error(`[AUDIT_ERROR] Failed to log ${action}:`, err.message);
    }
}

module.exports = { auditLog };
