/**
 * services/dataService.js
 * Centralized data access layer for both JSON and PostgreSQL.
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { decrypt } = require('../utils/encryption');
require('dotenv').config();

// PostgreSQL Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Set maximum connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// One-time optimization setup
if (process.env.NODE_ENV !== "test") (async () => {
  try {
    await pool.query('CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions (user_id, date)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_invoices_user_status ON invoices (user_id, status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_clients_user_name ON clients (user_id, name)');
    if (process.env.NODE_ENV !== 'test') console.log("⚡ Database indexes verified");
  } catch (e) {
    console.warn("⚠️ Index creation skipped:", e.message);
  }
})();

/**
 * Fetches transactions from either a custom dataset, PostgreSQL, or local JSON.
 * @param {Array<Object>|null} customDataset - Optional user-provided data.
 * @returns {Promise<Array<Object>>}
 */
async function getTransactions(userId, customDataset = null) {
  if (customDataset && customDataset.length > 0) {
    return customDataset.map(r => ({
      ...r,
      amount: parseFloat(r.amount || 0)
    }));
  }

  try {
    const res = await pool.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY date DESC LIMIT 1000', [userId]);
    if (res.rows.length > 0) {
      return res.rows.map(r => ({
        id: r.id,
        date: r.date.toISOString().slice(0, 10),
        type: r.type,
        amount: parseFloat(r.amount),
        category: r.category,
        description: r.description,
        client: r.client_name
      }));
    }
  } catch (err) {
    console.error('DataService DB Error (Transactions):', err.message);
  }

  // Fallback to JSON
  try {
    const data = await fs.promises.readFile(path.join(__dirname, '../data/transactions.json'), 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

/**
 * Fetches invoices from either a custom dataset, PostgreSQL, or local JSON.
 * @param {Array<Object>|null} customDataset - Optional user-provided data.
 * @returns {Promise<Array<Object>>}
 */
async function getInvoices(userId, customDataset = null) {
  if (customDataset && customDataset.length > 0) {
    return customDataset.map(r => ({
      ...r,
      amount: parseFloat(r.amount || 0)
    }));
  }

  try {
    const res = await pool.query('SELECT * FROM invoices WHERE user_id = $1 ORDER BY due_date DESC LIMIT 100', [userId]);
    if (res.rows.length > 0) {
      return res.rows.map(r => ({
        id: r.id,
        client: r.client_name,
        amount: parseFloat(r.amount),
        issueDate: r.issue_date.toISOString().slice(0, 10),
        dueDate: r.due_date.toISOString().slice(0, 10),
        status: r.status,
        paymentHistory: r.payment_history || []
      }));
    }
  } catch (err) {
    console.error('DataService DB Error (Invoices):', err.message);
  }

  // Fallback to JSON
  try {
    const data = await fs.promises.readFile(path.join(__dirname, '../data/invoices.json'), 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

/**
 * Fetches client contacts/sensitive data.
 * @returns {Promise<Object>}
 */
async function getClients(userId) {
  try {
    const res = await pool.query('SELECT name, email, contact_number FROM clients WHERE user_id = $1', [userId]);
    if (res.rows.length > 0) {
      const contacts = {};
      res.rows.forEach(r => {
        contacts[r.name] = r.email || r.contact_number;
      });
      return contacts;
    }
  } catch (err) {
    console.error('DataService DB Error (Clients):', err.message);
  }

  try {
    const data = await fs.promises.readFile(path.join(__dirname, '../data/clientContacts.json'), 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return {};
  }
}

/**
 * Fetches all sensitive fields for the current user to build a redaction list.
 * @param {number} userId - The user ID.
 * @returns {Promise<string[]>} List of decrypted PII strings.
 */
async function getRedactionList(userId) {
  if (!userId) return [];
  try {
    const res = await pool.query('SELECT aadhar_card, pan_card, bank_account FROM clients WHERE user_id = $1', [userId]);
    const list = [];
    res.rows.forEach(r => {
      if (r.aadhar_card) try { list.push(decrypt(r.aadhar_card)); } catch(e) {}
      if (r.pan_card) try { list.push(decrypt(r.pan_card)); } catch(e) {}
      if (r.bank_account) try { list.push(decrypt(r.bank_account)); } catch(e) {}
    });
    const result = [...new Set(list.filter(s => s && String(s).length > 5))];
    console.log(`[DEBUG] getRedactionList: userId=${userId}, Found ${result.length} items to redact.`);
    return result;
  } catch (err) {
    console.error('DataService Redaction Error:', err.message);
    return [];
  }
}

/**
 * Returns pre-aggregated finance KPIs directly from PostgreSQL.
 * @param {number|string} userId
 * @returns {Promise<{totalIncome:number,totalExpenses:number,netBalance:number}|null>}
 */
async function getCashKpis(userId) {
  if (!userId) return null;
  try {
    const res = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
         COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0) AS total_expenses
       FROM transactions
       WHERE user_id = $1`,
      [userId]
    );

    const row = res.rows[0];
    if (!row) return null;
    const totalIncome = parseFloat(row.total_income || 0);
    const totalExpenses = parseFloat(row.total_expenses || 0);
    return {
      totalIncome,
      totalExpenses,
      netBalance: totalIncome - totalExpenses
    };
  } catch (err) {
    console.error("DataService DB Error (KPIs):", err.message);
    return null;
  }
}

module.exports = { getTransactions, getInvoices, getClients, getRedactionList, getCashKpis, pool };
