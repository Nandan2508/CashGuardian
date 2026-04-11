const invoices = require("../data/invoices.json");

const RECOMMENDATIONS = {
  HIGH: "Require advance payment or stop credit",
  MEDIUM: "Send immediate payment reminder",
  LOW: "Monitor - no action needed"
};

/**
 * Returns unique client names from the invoice dataset.
 * @returns {string[]} Client names.
 */
function getClients() {
  return [...new Set(invoices.map((invoice) => invoice.client))];
}

/**
 * Computes the average late-payment days for invoices settled after due date.
 * @param {Array<object>} clientInvoices - Invoices for one client.
 * @returns {{ latePayments: number, avgDaysLate: number }} Late payment metrics.
 */
function getLatePaymentMetrics(clientInvoices) {
  const lateInvoices = clientInvoices.filter(
    (invoice) => invoice.paymentHistory[0] && invoice.paymentHistory[0] > invoice.dueDate
  );

  if (!lateInvoices.length) {
    return { latePayments: 0, avgDaysLate: 0 };
  }

  const totalDaysLate = lateInvoices.reduce((sum, invoice) => {
    const dueDate = new Date(`${invoice.dueDate}T00:00:00Z`);
    const paymentDate = new Date(`${invoice.paymentHistory[0]}T00:00:00Z`);
    return sum + Math.round((paymentDate - dueDate) / 86400000);
  }, 0);

  return {
    latePayments: lateInvoices.length,
    avgDaysLate: totalDaysLate / lateInvoices.length
  };
}

/**
 * Maps a numeric score to a risk level.
 * @param {number} riskScore - Calculated risk score.
 * @returns {"HIGH"|"MEDIUM"|"LOW"} Risk label.
 */
function getRiskLevel(riskScore) {
  if (riskScore >= 60) {
    return "HIGH";
  }

  if (riskScore >= 30) {
    return "MEDIUM";
  }

  return "LOW";
}

/**
 * Returns risk assessment for a single client.
 * @param {string} clientName - Client business name.
 * @returns {{ client: string, riskScore: number, riskLevel: string, latePayments: number, overdueAmount: number, recommendation: string } | null}
 */
function getClientRisk(clientName) {
  const clientInvoices = invoices.filter((invoice) => invoice.client === clientName);

  if (!clientInvoices.length) {
    return null;
  }

  const { latePayments, avgDaysLate } = getLatePaymentMetrics(clientInvoices);
  const overdueInvoices = clientInvoices.filter((invoice) => invoice.status === "overdue");
  const overdueAmount = overdueInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const hasCurrentOverdue = overdueInvoices.length > 0;
  const riskScore = Number(((latePayments * 30) + (avgDaysLate * 2) + (hasCurrentOverdue ? 10 : 0)).toFixed(2));
  const riskLevel = getRiskLevel(riskScore);

  return {
    client: clientName,
    riskScore,
    riskLevel,
    latePayments,
    overdueAmount,
    recommendation: RECOMMENDATIONS[riskLevel]
  };
}

/**
 * Returns risk assessment for all clients.
 * @returns {Array<{ client: string, riskScore: number, riskLevel: string, latePayments: number, overdueAmount: number, recommendation: string }>}
 */
function getRiskReport() {
  return getClients()
    .map((client) => getClientRisk(client))
    .filter(Boolean)
    .sort((left, right) => right.riskScore - left.riskScore);
}

module.exports = {
  getRiskReport,
  getClientRisk,
  getRiskLevel,
  getLatePaymentMetrics
};
