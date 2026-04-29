/**
 * scripts/apply_schema.js
 * Applies the latest schema.sql to the PostgreSQL database.
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function applySchema() {
  try {
    console.log('🚀 Applying database schema...');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    
    await pool.query(sql);
    console.log('✅ Schema applied successfully.');
  } catch (err) {
    console.error('❌ Failed to apply schema:', err);
  } finally {
    await pool.end();
  }
}

applySchema();
