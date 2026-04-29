const { getInvoices } = require("./dataService");

const RECOMMENDATIONS = {
  HIGH: "Require advance payment or stop credit",
  MEDIUM: "Send immediate payment reminder",
  LOW: "Monitor - no action needed"
};

/**
 * Returns unique client names from the invoice dataset.
 * @param {Array<object>} invoices - Invoice list.
 * @returns {string[]} Client names.
 */
function getClientNames(invoices) {
  return [...new Set(invoices.map((invoice) => invoice.client || invoice.client_name))];
}

/**
 * Computes the average late-payment days for invoices settled after due date.
 * @param {Array<object>} clientInvoices - Invoices for one client.
 * @returns {{ latePayments: number, avgDaysLate: number }} Late payment metrics.
 */
function getLatePaymentMetrics(clientInvoices) {
  const lateInvoices = clientInvoices.filter(
    (invoice) => {
      const history = Array.isArray(invoice.payment_history) ? invoice.payment_history : (invoice.paymentHistory || []);
      return history[0] && history[0] > (invoice.due_date || invoice.dueDate);
    }
  );

  if (!lateInvoices.length) {
    return { latePayments: 0, avgDaysLate: 0 };
  }

  const totalDaysLate = lateInvoices.reduce((sum, invoice) => {
    const dueDateStr = invoice.due_date || invoice.dueDate;
    const history = Array.isArray(invoice.payment_history) ? invoice.payment_history : (invoice.paymentHistory || []);
    const paymentDateStr = history[0];
    
    const dueDate = new Date(`${dueDateStr}T00:00:00Z`);
    const paymentDate = new Date(`${paymentDateStr}T00:00:00Z`);
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
  if (riskScore >= 60) return "HIGH";
  if (riskScore >= 30) return "MEDIUM";
  return "LOW";
}

/**
 * Returns risk assessment for a single client.
 * @param {string} clientName - Client business name.
 * @param {Array<object>} allInvoices - Full invoice set.
 * @returns {{ client: string, riskScore: number, riskLevel: string, latePayments: number, overdueAmount: number, recommendation: string } | null}
 */
function getClientRisk(clientName, allInvoices) {
  const clientInvoices = allInvoices.filter((invoice) => (invoice.client || invoice.client_name) === clientName);

  if (!clientInvoices.length) return null;

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
 * @param {number} userId - Authenticated user ID.
 * @param {Array<object>|null} dataset - Optional custom dataset.
 * @returns {Promise<Array<Object>>}
 */
async function getRiskReport(userId, dataset = null) {
  const invoices = await getInvoices(userId, dataset);
  const names = getClientNames(invoices);
  
  return names
    .map((name) => getClientRisk(name, invoices))
    .filter(Boolean)
    .sort((a, b) => b.riskScore - a.riskScore);
}

module.exports = {
  getRiskReport,
  getClientRisk,
  getRiskLevel,
  getLatePaymentMetrics
};
