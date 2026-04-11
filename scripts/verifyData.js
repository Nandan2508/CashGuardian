/**
 * Verifies the benchmark-locked JSON datasets without modifying them.
 */
const transactions = require("../data/transactions.json");
const invoices = require("../data/invoices.json");
const metrics = require("../data/metrics.json");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  assert(Array.isArray(transactions), "transactions must be array");
  assert(
    transactions.every((transaction) => transaction.id && transaction.date && transaction.type && transaction.amount),
    "tx schema ok"
  );
  assert(Array.isArray(invoices), "invoices must be array");
  assert(invoices.filter((invoice) => invoice.status === "overdue").length >= 4, "need 4 overdue");
  assert(Array.isArray(metrics), "metrics must be array");

  const transactionCount = transactions.length;
  const totalIncome = transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalExpenses = transactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const netBalance = totalIncome - totalExpenses;
  const overdueInvoices = invoices.filter((invoice) => invoice.status === "overdue");
  const overdueTotal = overdueInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const sharmaInvoices = invoices.filter((invoice) => invoice.client === "Sharma Retail");
  const sharmaLatePayments = sharmaInvoices.filter((invoice) => {
    if (!invoice.paymentHistory.length) {
      return false;
    }

    return invoice.paymentHistory.some((paymentDate) => paymentDate > invoice.dueDate);
  }).length;
  const metricsCount = metrics.length;

  assert(transactionCount === 51, `expected 51 transactions, received ${transactionCount}`);
  assert(netBalance === -12500, `expected net balance -12500, received ${netBalance}`);
  assert(overdueInvoices.length === 4, `expected 4 overdue invoices, received ${overdueInvoices.length}`);
  assert(overdueTotal === 215500, `expected overdue total 215500, received ${overdueTotal}`);
  assert(sharmaInvoices.length === 4, `expected Sharma Retail invoice count 4, received ${sharmaInvoices.length}`);
  assert(sharmaLatePayments === 3, `expected Sharma Retail late count 3, received ${sharmaLatePayments}`);
  assert(metricsCount === 13, `expected 13 metrics snapshots, received ${metricsCount}`);

  console.log("✅ All data files valid");
}

main();
