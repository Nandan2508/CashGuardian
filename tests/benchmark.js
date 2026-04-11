/**
 * tests/benchmark.js
 *
 * Automated benchmark runner for CashGuardian CLI.
 * Fires all 13 benchmark queries through the query agent and saves
 * raw responses to benchmark-results.json for manual scoring.
 *
 * Usage:
 *   node tests/benchmark.js             — run all 13 benchmarks
 *   node tests/benchmark.js --verbose   — also print full responses
 *
 * Ground truth source: data/transactions.json + data/invoices.json
 * Net balance: -12500 | Overdue: 4 invoices, ₹215500 | High risk: Sharma Retail
 *
 * Scoring is manual — open benchmark-results.json and check each response
 * against the required facts in BENCHMARK.md. Max total score: 55.
 */

"use strict";

require("dotenv").config();
const fs   = require("fs");
const path = require("path");

// ── Import the query agent ──────────────────────────────────────────────────
// This will fail gracefully if agent isn't built yet (Phase 2 Task 5)
let processQuery;
try {
  ({ processQuery } = require("../agent/queryAgent"));
} catch {
  console.error(
    "\n❌  Could not load agent/queryAgent.js\n" +
    "   Complete Phase 2 Task 5 before running benchmarks.\n"
  );
  process.exit(1);
}

// ── Benchmark definitions ───────────────────────────────────────────────────
// Each entry matches exactly one benchmark in BENCHMARK.md
const BENCHMARKS = [
  {
    id:       "BM-01",
    category: "Cash Balance",
    input:    "What is my current cash balance?",
    maxScore: 3,
    requiredFacts: [
      "net balance ₹−12,500 (negative)",
      "income ₹9,25,500 or expenses ₹9,38,000 present",
      "indicates cash deficit",
    ],
    forbidden: ["positive balance", "surplus"],
  },
  {
    id:       "BM-02",
    category: "Cash Summary",
    input:    "Give me a cash flow summary",
    maxScore: 4,
    requiredFacts: [
      "income ~₹9,25,500",
      "expenses ~₹9,38,000",
      "net negative / deficit",
      "salaries or logistics mentioned",
    ],
    forbidden: ["profitable overall", "positive net"],
  },
  {
    id:       "BM-03",
    category: "Expense Breakdown",
    input:    "Show me the expense breakdown",
    maxScore: 4,
    requiredFacts: [
      "salaries as top category (₹3,60,000 or ~38%)",
      "logistics second (₹3,18,000 or ~34%)",
      "rent mentioned (₹1,80,000 or ~19%)",
      "marketing and utilities mentioned",
    ],
    forbidden: [],
  },
  {
    id:       "BM-04",
    category: "Overdue Invoices",
    input:    "Show me all overdue invoices",
    maxScore: 6,
    requiredFacts: [
      "exactly 4 overdue invoices",
      "total ₹2,15,500",
      "Sharma Retail ₹96,000",
      "Gupta Enterprises ₹54,000",
      "Patel Distributors ₹38,500",
      "Verma & Sons ₹27,000",
    ],
    forbidden: ["3 overdue", "5 overdue", "2 overdue"],
  },
  {
    id:       "BM-05",
    category: "Client History",
    input:    "What invoices does Sharma Retail have?",
    maxScore: 4,
    requiredFacts: [
      "4 invoices total for Sharma Retail",
      "current overdue ₹96,000",
      "3 previously paid invoices",
      "late payment history mentioned",
    ],
    forbidden: [],
  },
  {
    id:       "BM-06",
    category: "Risk Report",
    input:    "Which clients are at risk of not paying?",
    maxScore: 4,
    requiredFacts: [
      "Sharma Retail flagged HIGH risk",
      "3 late payments as evidence",
      "at least one other client flagged",
      "recommendation given",
    ],
    forbidden: ["Sharma Retail is low risk", "Kapoor Traders is high risk"],
  },
  {
    id:       "BM-07",
    category: "Single Client Risk",
    input:    "Is Sharma Retail a risky client?",
    maxScore: 4,
    requiredFacts: [
      "clearly YES or HIGH RISK",
      "3 of 4 invoices paid late",
      "overdue ₹96,000 mentioned",
      "concrete recommendation",
    ],
    forbidden: ["low risk", "not risky"],
  },
  {
    id:       "BM-08",
    category: "30-Day Forecast",
    input:    "What will my cash look like in 30 days?",
    maxScore: 4,
    requiredFacts: [
      "starting balance ~₹−12,500",
      "week-by-week breakdown shown",
      "cash risk flagged",
      "upcoming invoices ₹1,81,000 mentioned",
    ],
    forbidden: ["strongly positive", "no risk"],
  },
  {
    id:       "BM-09",
    category: "Cash Runout Risk",
    input:    "Will I run out of cash this month?",
    maxScore: 4,
    requiredFacts: [
      "acknowledges negative balance",
      "₹2,15,500 overdue highlighted",
      "YES or AT RISK answer",
      "action suggested (collect overdue / cut expenses)",
    ],
    forbidden: ["no risk", "comfortable"],
  },
  {
    id:       "BM-10",
    category: "Anomaly Detection",
    input:    "Are there any unusual patterns in my spending?",
    maxScore: 4,
    requiredFacts: [
      "logistics spike detected (~72%, week 8)",
      "revenue spike detected (~64%, week 10)",
      "approximate week or period given",
      "severity described (significant / high)",
    ],
    forbidden: ["no anomalies", "everything normal"],
  },
  {
    id:       "BM-11",
    category: "Logistics Spike",
    input:    "Why did my logistics costs spike recently?",
    maxScore: 4,
    requiredFacts: [
      "logistics identified as the category",
      "spike amount ~₹36,000",
      "normal amount ~₹21,000 mentioned",
      "deviation >50% noted",
    ],
    forbidden: [],
  },
  {
    id:       "BM-12",
    category: "Month Comparison",
    input:    "Compare this month vs last month",
    maxScore: 4,
    requiredFacts: [
      "two distinct periods shown",
      "revenue direction + percentage",
      "expense direction + percentage",
      "net position comparison",
    ],
    forbidden: [],
  },
  {
    id:       "BM-13",
    category: "Weekly Summary",
    input:    "Give me a weekly summary",
    maxScore: 4,
    requiredFacts: [
      "recent week income covered",
      "recent week expenses covered",
      "overdue invoice status mentioned",
      "at least one actionable insight",
    ],
    forbidden: [],
  },
];

const TOTAL_MAX = BENCHMARKS.reduce((s, b) => s + b.maxScore, 0); // 55

// ── Runner ──────────────────────────────────────────────────────────────────

async function run() {
  const verbose = process.argv.includes("--verbose");

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║       CashGuardian CLI — Benchmark Runner            ║");
  console.log(`║       ${BENCHMARKS.length} benchmarks  |  max score: ${TOTAL_MAX} points         ║`);
  console.log("╚══════════════════════════════════════════════════════╝\n");

  if (!process.env.AI_API_KEY) {
    console.warn(
      "⚠️  AI_API_KEY not set — AI responses will use fallback text.\n" +
      "   Add your free Gemini/Groq/OpenRouter key to .env first.\n"
    );
  }

  const results = [];
  let errors    = 0;

  for (let i = 0; i < BENCHMARKS.length; i++) {
    const bm  = BENCHMARKS[i];
    const num = `[${i + 1}/${BENCHMARKS.length}]`;
    process.stdout.write(`${num} ${bm.id} — ${bm.category}... `);

    const t0 = Date.now();
    let response = "";
    let error    = null;

    try {
      response = await processQuery(bm.input);
    } catch (err) {
      error = err.message;
      errors++;
    }

    const ms = Date.now() - t0;
    console.log(`${error ? "❌" : "✅"} ${ms}ms`);

    if (verbose && response) {
      console.log(`   Preview: ${response.slice(0, 120).replace(/\n/g, " ")}…`);
    }

    results.push({
      id:            bm.id,
      category:      bm.category,
      input:         bm.input,
      response:      response || "",
      latencyMs:     ms,
      maxScore:      bm.maxScore,
      requiredFacts: bm.requiredFacts,
      forbidden:     bm.forbidden,
      error:         error || null,
      // Fill in manually after reading the response against BENCHMARK.md
      manualScore:   null,
      notes:         "",
    });
  }

  // Save results
  const outPath = path.join(__dirname, "..", "benchmark-results.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

  // Summary
  console.log("\n─────────────────────────────────────────────────────────");
  console.log(`Completed ${BENCHMARKS.length} benchmarks | ${errors} error(s)`);
  console.log(`Results saved → benchmark-results.json`);
  console.log(`Avg latency: ${Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / results.length)}ms`);
  console.log("\nNext steps:");
  console.log("  1. Open benchmark-results.json");
  console.log("  2. Read each response against BENCHMARK.md required facts");
  console.log("  3. Fill in manualScore (0 to maxScore) for each entry");
  console.log(`  4. Sum all manualScore values — target ≥ 50 / ${TOTAL_MAX}`);
  console.log("─────────────────────────────────────────────────────────\n");
}

run().catch((err) => {
  console.error("Benchmark runner crashed:", err.message);
  process.exit(1);
});