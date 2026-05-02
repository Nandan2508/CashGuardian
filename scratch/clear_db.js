const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function clearDB() {
  console.log("⚠️ Starting database cleanup...");
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('TRUNCATE TABLE transactions RESTART IDENTITY CASCADE');
      await client.query('TRUNCATE TABLE invoices RESTART IDENTITY CASCADE');
      await client.query('TRUNCATE TABLE clients RESTART IDENTITY CASCADE');
      // Uncomment the line below if you also want to clear audit logs
      // await client.query('TRUNCATE TABLE audit_logs RESTART IDENTITY CASCADE'); 
      await client.query('COMMIT');
      console.log("✅ Database cleared successfully! All transactions, invoices, and clients removed.");
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("❌ Error clearing database:", err.message);
  } finally {
    await pool.end();
  }
}

clearDB();
