require('dotenv').config();
const { Pool } = require('pg');

async function checkDb() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const clients = await pool.query('SELECT user_id, name, pan_card FROM clients');
    console.log('Database Clients:', clients.rows);
  } catch (e) {
    console.error('DB Check Error:', e.message);
  } finally {
    await pool.end();
  }
}

checkDb();
