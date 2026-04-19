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

const { getSnapshot } = require('./agent/queryAgent');
const { handleQuery, handleStream } = require('./agent/langChainAgent'); // Migrated to LangGraph

const app = express();
const PORT = process.env.PORT || 3000;

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

// In-memory dataset store (defaults to null, falls back to demo data in queryAgent)
let activeDataset = null;
let activeDatasetStats = { name: 'Demo: Mehta Wholesale Traders', rows: 0, columns: [] };

// ─── API: UPLOAD ───────────────────────────────────────────────────────────
app.post('/api/upload', (req, res) => {
  const { name, data } = req.body;
  if (!data || !Array.isArray(data)) {
    return res.status(400).json({ error: 'Invalid data format. Expected an array of objects.' });
  }

  activeDataset = data;
  activeDatasetStats = {
    name: name || 'Uploaded Dataset',
    rows: data.length,
    columns: Object.keys(data[0] || {})
  };

  res.json({ 
    success: true, 
    message: `Successfully loaded ${activeDatasetStats.name}`,
    stats: activeDatasetStats
  });
});

// ─── API: DATASET ──────────────────────────────────────────────────────────
app.get('/api/dataset', (req, res) => {
  res.json(activeDatasetStats);
});

// ─── API: SNAPSHOT ─────────────────────────────────────────────────────────
app.get('/api/snapshot', (req, res) => {
  try {
    const snapshot = getSnapshot(activeDataset);
    res.json(snapshot);
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ─── API: QUERY ────────────────────────────────────────────────────────────
app.post('/api/query', async (req, res) => {
  const { query, history } = req.body;
  if (!query) return res.status(400).json({ error: 'Query required' });

  const start = Date.now();
  try {
    const response = await handleQuery(query, activeDataset, history || []);
    const latencyMs = Date.now() - start;
    
    // Attempting to infer intent for legacy reporting
    const { classifyIntent } = require('./agent/intentMap');
    const intent = classifyIntent(query);

    res.json({
      response: response.content || response,
      intent,
      duel: response.duel || null,
      trend: response.trend || null,
      comparisonTrend: response.comparisonTrend || null,
      latencyMs,
      source: activeDataset ? 'User Provided Data' : 'Internal Finance Dataset'
    });
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
app.post('/api/query/stream', async (req, res) => {
  const { query, history } = req.body;
  if (!query) return res.status(400).json({ error: 'Query required' });

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for Vercel/Nginx

  const start = Date.now();

  try {
    const stream = handleStream(query, activeDataset, history || []);
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
app.get('/api/benchmark', (req, res) => {
  try {
    const benchmarkPath = path.join(__dirname, 'data', 'benchmark-results.json');
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
