/**
 * scripts/verify_auth_db.js
 * Verifies that the auth data exists in the database.
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function verify() {
  try {
    const res = await pool.query('SELECT username, role FROM users');
    console.log('--- Auth Database Verification ---');
    console.log('Total Users:', res.rowCount);
    res.rows.forEach(user => {
      console.log(`User: ${user.username} | Role: ${user.role}`);
    });
    
    if (res.rowCount === 2) {
      console.log('\n✅ Verification Successful: Both default users found.');
    } else {
      console.log('\n❌ Verification Failed: Expected 2 users, found ' + res.rowCount);
    }
  } catch (err) {
    console.error('❌ Verification failed:', err);
  } finally {
    await pool.end();
  }
}

verify();
