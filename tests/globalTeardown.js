module.exports = async () => {
  try {
    const { pool } = require("../services/dataService");
    if (pool && typeof pool.end === "function") {
      await pool.end();
    }
  } catch (_error) {
    // Ignore teardown failures to avoid masking test results.
  }
};
