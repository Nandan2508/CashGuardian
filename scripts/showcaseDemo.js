/**
 * Runs a deterministic showcase script through the query agent.
 */
require("dotenv").config();
const { handleQuery } = require("../agent/queryAgent");

const PROMPTS = [
  "What is my current cash balance?",
  "Show me all overdue invoices",
  "Which clients are at risk of not paying?",
  "What will my cash look like in 30 days?",
  "Are there any unusual patterns in my spending?",
  "Give me a weekly summary",
  "Compare this month vs last month",
  "Send a payment reminder to Sharma Retail"
];

async function run() {
  for (const prompt of PROMPTS) {
    const response = await handleQuery(prompt);
    process.stdout.write(`\n> ${prompt}\n${response}\n`);
  }
}

run().catch((error) => {
  process.stderr.write(`Showcase demo failed: ${error.message}\n`);
  process.exit(1);
});
