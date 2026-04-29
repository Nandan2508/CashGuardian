/**
 * server.js — CashGuardian "Talk to Data" Web Bridge
 * A minimalist Express server for the vanilla JS frontend.
 * Provides dataset-agnostic queries, snapshots, and benchmarking.
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config();

const { getSnapshot, invalidateSnapshotCache } = require('./agent/queryAgent');
const { handleQuery, handleStream } = require('./agent/langChainAgent');
const { authenticateToken, authorizeRole } = require('./middleware/auth');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { encrypt } = require('./utils/encryption');

// PostgreSQL Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const app = express();
const PORT = process.env.PORT || 3000;
const queryCache = new Map();
const QUERY_CACHE_TTL_MS = 60 * 1000;

function normalizeQueryKey(userId, query, history) {
  return JSON.stringify({
    userId,
    query: String(query || "").trim().toLowerCase().replace(/\s+/g, " "),
    history: Array.isArray(history) ? history.slice(-4) : []
  });
}

function getCachedResponse(key) {
  const entry = queryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > QUERY_CACHE_TTL_MS) {
    queryCache.delete(key);
    return null;
  }
  return entry.payload;
}

// Global Error Logging
process.on('uncaughtException', (err) => {
  console.error('🔥 UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 UNHANDLED REJECTION:', reason);
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('web'));

// In-memory dataset store is no longer global to support multi-tenancy.
// Data is persisted in PostgreSQL per userId.

// ─── API: AUTH ────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role',
      [username, hashedPassword, role || 'user']
    );
    const token = jwt.sign(
      { id: result.rows[0].id, username: result.rows[0].username, role: result.rows[0].role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.status(201).json({ success: true, token, user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Username already exists' });
    console.error('Registration Error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: { username: user.username, role: user.role }
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

// ─── API: UPLOAD ───────────────────────────────────────────────────────────
app.post('/api/upload', authenticateToken, async (req, res) => {
  const { name, data } = req.body;
  if (!data || !Array.isArray(data) || data.length === 0) {
    return res.status(400).json({ error: 'Invalid data format. Expected a non-empty array of objects.' });
  }

  try {
    console.log(`📥 Processing enriched upload: ${name} (${data.length} records) for userId: ${req.user.id}`);
    
    // Clear old data for this user to ensure fresh load
    await pool.query('DELETE FROM transactions WHERE user_id = $1', [req.user.id]);
    await pool.query('DELETE FROM invoices WHERE user_id = $1', [req.user.id]);
    await pool.query('DELETE FROM clients WHERE user_id = $1', [req.user.id]);

    for (let row of data) {
      // Normalize all keys to lowercase to avoid case-sensitivity issues (e.g., TYPE vs type)
      row = Object.keys(row).reduce((acc, key) => {
        acc[key.toLowerCase().replace(/\s+/g, '')] = row[key];
        return acc;
      }, {});

      const rowId = row.id || `AUTO_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      
      // Helper to normalize dates (DD-MM-YYYY, MM-DD-YYYY, DD/MM, etc.)
      const normDate = (d) => {
        if (!d) return null;
        if (d instanceof Date) return d.toISOString().split('T')[0];
        const s = String(d).trim();
        
        // Handle Excel Serial Dates (numbers)
        if (!isNaN(s) && s.length > 4 && s.length < 10) {
            const date = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
            return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0') + '-' + String(date.getUTCDate()).padStart(2, '0');
        }

        const parts = s.split(/[-/.]/);
        if (parts.length === 3) {
            // DD-MM-YYYY or YYYY-MM-DD
            if (parts[0].length === 4) return s.replace(/\//g, '-'); // YYYY-MM-DD
            if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
        return s;
      };

      const normAmount = (a) => {
          if (typeof a === 'number') return a;
          return parseFloat(String(a || 0).replace(/[₹$,]/g, '').trim());
      };

      const normStatus = (s) => String(s || 'unpaid').trim().toLowerCase();

      // 1. Transaction Logic
      if (row.type && (String(row.type).toLowerCase() === 'income' || String(row.type).toLowerCase() === 'expense')) {
        const client = row.client || row.clientname || row.customer || 'Unknown';
        const amt = normAmount(row.amount);
        await pool.query(`
          INSERT INTO transactions (id, user_id, date, type, amount, category, description, client_name, region, channel)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, category = EXCLUDED.category
        `, [
          rowId, req.user.id, normDate(row.date), String(row.type).toLowerCase(), amt, 
          String(row.category || 'miscellaneous').toLowerCase(), row.description || 'No description', client, row.region || 'Default', row.channel || 'Direct'
        ]);
      }

      // 2. Invoice Logic
      if (row.duedate || row.issuedate || row.status) {
        const client = row.client || row.clientname || row.customer || 'Unknown';
        const status = normStatus(row.status);
        await pool.query(`
          INSERT INTO invoices (id, user_id, client_name, amount, issue_date, due_date, status, payment_history)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status
        `, [
          rowId, req.user.id, client, normAmount(row.amount), 
          normDate(row.issuedate || row.date), normDate(row.duedate || row.date), 
          status, JSON.stringify(row.paymenthistory || [])
        ]);
      }

      // 3. Client PII Logic
      if (row.aadhar || row.pan || row.bankaccount || row.bank_account) {
        const client = row.client || row.clientname || row.customer || 'Unknown';
        const aadhar = row.aadhar || row.aadharcard || row.aadhar_card;
        const pan = row.pan || row.pancard || row.pan_card;
        const bank = row.bankaccount || row.bank_account;

        const encryptedAadhar = aadhar ? encrypt(aadhar) : null;
        const encryptedPan = pan ? encrypt(pan) : null;
        const encryptedBank = bank ? encrypt(bank) : null;
        
        await pool.query(`
          INSERT INTO clients (user_id, name, aadhar_card, pan_card, bank_account, contact_number, email)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (user_id, name) DO UPDATE SET 
            aadhar_card = COALESCE(EXCLUDED.aadhar_card, clients.aadhar_card),
            pan_card = COALESCE(EXCLUDED.pan_card, clients.pan_card),
            bank_account = COALESCE(EXCLUDED.bank_account, clients.bank_account)
        `, [
          req.user.id, client, encryptedAadhar, encryptedPan, encryptedBank, 
          row.contact || row.contactnumber || row.email, row.email
        ]);
      }
    }

    console.log(`✅ Upload Complete. Persisted data for userId: ${req.user.id}`);
    invalidateSnapshotCache(req.user.id);
    queryCache.clear();
    
    // Data is already in DB, no need to store in global memory.
    const stats = {
      name: name || 'Enriched Dataset',
      rows: data.length,
      columns: Object.keys(data[0] || {}),
      type: 'enriched'
    };

    res.json({ 
      success: true, 
      message: `Successfully mapped to enriched dataset and stored in PostgreSQL.`,
      stats: stats 
    });
  } catch (err) {
    console.error('Upload Mapping Error:', err);
    res.status(500).json({ error: 'Failed to map data to database', details: err.message });
  }
});

// ─── API: DATASET ──────────────────────────────────────────────────────────
app.get('/api/dataset', authenticateToken, (req, res) => {
  res.json({ name: 'Database (Live)', type: 'postgresql' });
});

// ─── API: SNAPSHOT ─────────────────────────────────────────────────────────
app.get('/api/snapshot', authenticateToken, async (req, res) => {
  try {
    const snapshot = await getSnapshot(req.user.id, null);
    res.json(snapshot);
  } catch (error) {
    console.error('Snapshot Error:', error);
    res.status(500).json({ error: 'Failed to generate snapshot' });
  }
});

// ─── API: QUERY ────────────────────────────────────────────────────────────
app.post('/api/query', authenticateToken, async (req, res) => {
  const { query, history } = req.body;
  if (!query) return res.status(400).json({ error: 'Query required' });

  const cacheKey = normalizeQueryKey(req.user.id, query, history);
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    return res.json({
      ...cached,
      cached: true
    });
  }

  const start = Date.now();
  try {
    const response = await handleQuery(query, null, history || [], req.user.id);
    const latencyMs = Date.now() - start;
    
    // Attempting to infer intent for legacy reporting
    const { classifyIntent } = require('./agent/intentMap');
    const intent = classifyIntent(query);

    const payload = {
      response: response.content || response,
      intent,
      duel: response.duel || null,
      trend: response.trend || null,
      comparisonTrend: response.comparisonTrend || null,
      latencyMs,
      source: 'Database (Live)'
    };

    queryCache.set(cacheKey, {
      timestamp: Date.now(),
      payload
    });

    res.json(payload);
  } catch (error) {
    console.error('❌ Query Error:', error.message);
    res.status(500).json({ 
      error: 'Failed to process query',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ─── API: QUERY STREAM ─────────────────────────────────────────────────────
app.post('/api/query/stream', authenticateToken, async (req, res) => {
  const { query, history } = req.body;
  if (!query) return res.status(400).json({ error: 'Query required' });

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for Vercel/Nginx

  const start = Date.now();

  try {
    const stream = handleStream(query, null, history || [], req.user.id);
    for await (const chunk of stream) {
      if (chunk.type === 'error') {
        res.write(`data: ${JSON.stringify({ error: chunk.content })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({
          text: chunk.content,
          intent: chunk.intent,
          duel: chunk.duel,
          trend: chunk.trend,
          latencyMs: Date.now() - start
        })}\n\n`);
      }
    }
  } catch (error) {
    console.error('❌ Stream Error:', error);
    res.write(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`);
  } finally {
    res.end();
  }
});

// ─── ERROR HANDLER ─────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('🔴 Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

// ─── API: BENCHMARK ────────────────────────────────────────────────────────
app.get('/api/benchmark', authenticateToken, (req, res) => {
  try {
    const benchmarkPath = path.join(__dirname, 'benchmark-results.json');
    if (fs.existsSync(benchmarkPath)) {
      const results = JSON.parse(fs.readFileSync(benchmarkPath, 'utf-8'));
      res.json(results);
    } else {
      res.status(404).json({ error: 'Benchmarks not found. Run "npm run benchmark" first.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 CashGuardian Server running on http://localhost:${PORT}`);
    console.log(`📄 Serving vanilla web interface from /web`);
  });
}

module.exports = app;
