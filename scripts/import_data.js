/**
 * scripts/import_data.js
 * Migrates JSON data to PostgreSQL with encryption for sensitive fields.
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { encrypt } = require('../utils/encryption');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function importData() {
  try {
    console.log('📦 Starting data migration to PostgreSQL...');

    // Load JSON files
    const clientsData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/clientContacts.json'), 'utf8'));
    const txnsData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/transactions.json'), 'utf8'));
    const invsData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/invoices.json'), 'utf8'));

    // 1. Import Clients with Encrypted Data
    console.log('👤 Importing clients...');
    for (const [name, contact] of Object.entries(clientsData)) {
      const aadhar = encrypt(`AADHAR-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`);
      const pan = encrypt(`PAN${Math.floor(10000 + Math.random() * 90000)}C`);
      const bank = encrypt(`${Math.floor(1000000000 + Math.random() * 9000000000)}`);
      
      await pool.query(`
        INSERT INTO clients (user_id, name, aadhar_card, pan_card, bank_account, contact_number)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id, name) DO UPDATE SET 
          aadhar_card = EXCLUDED.aadhar_card,
          pan_card = EXCLUDED.pan_card,
          bank_account = EXCLUDED.bank_account
      `, [1, name, aadhar, pan, bank, contact]);
    }

    // 2. Import Transactions
    console.log('💸 Importing transactions...');
    for (const tx of txnsData) {
      await pool.query(`
        INSERT INTO transactions (id, user_id, date, type, amount, category, description, client_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO NOTHING
      `, [tx.id, 1, tx.date, tx.type, tx.amount, tx.category, tx.description, tx.client]);
    }

    // 3. Import Invoices
    console.log('📄 Importing invoices...');
    for (const inv of invsData) {
      await pool.query(`
        INSERT INTO invoices (id, user_id, client_name, amount, issue_date, due_date, status, payment_history)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO NOTHING
      `, [inv.id, 1, inv.client, inv.amount, inv.issueDate, inv.dueDate, inv.status, JSON.stringify(inv.paymentHistory)]);
    }

    console.log('✅ Migration complete.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await pool.end();
  }
}

importData();
