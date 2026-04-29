const { getInvoices } = require("./dataService");
const { daysPastDue, daysUntil, isOverdue } = require("../utils/dateUtils");

/**
 * Returns all overdue invoices sorted by days overdue descending.
 * @returns {Array<{ id: string, client: string, amount: number, dueDate: string, daysOverdue: number }>}
 */
/**
 * Classifies an invoice based on dynamic date logic (Dynamic Status).
 * @param {Object} invoice 
 * @returns {string} - 'paid' | 'overdue' | 'unpaid' | 'high_risk' | 'critical' | 'due_soon'
 */
function getEffectiveStatus(invoice) {
    if (String(invoice.status).toLowerCase() === 'paid') return 'paid';
    
    const days = daysPastDue(invoice.dueDate || invoice.duedate);
    if (days > 60) return 'critical';
    if (days > 30) return 'high_risk';
    if (days > 0) return 'overdue';
    
    const remaining = daysUntil(invoice.dueDate || invoice.duedate);
    if (remaining <= 7 && remaining >= 0) return 'due_soon';
    
    return 'unpaid';
}

/**
 * Returns all overdue/at-risk invoices sorted by severity.
 */
async function getOverdueInvoices(userId, customDataset = null) {
  const invoices = await getInvoices(userId, customDataset);
  
  return invoices
    .map(invoice => {
        const dDate = invoice.dueDate || invoice.duedate;
        const status = getEffectiveStatus(invoice);
        const days = daysPastDue(dDate);
        
        let riskLabel = 'On Track';
        if (status === 'overdue') riskLabel = 'Overdue';
        if (status === 'high_risk') riskLabel = 'High Risk';
        if (status === 'critical') riskLabel = 'Critical';
        if (status === 'due_soon') riskLabel = 'Due Soon';

        return {
            ...invoice,
            effectiveStatus: status,
            riskLabel: riskLabel,
            daysOverdue: days,
            dueDate: dDate
        };
    })
    .filter(i => ['overdue', 'high_risk', 'critical'].includes(i.effectiveStatus))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/**
 * Returns all invoices for a named client.
 * @param {string} clientName - Client business name.
 * @returns {Array<object>} Matching invoices.
 */
async function getInvoicesByClient(userId, clientName, customDataset = null) {
  const invoices = await getInvoices(userId, customDataset);
  const normalizedClient = String(clientName || "").trim().toLowerCase();

  if (!normalizedClient) {
    return [];
  }

  return invoices.filter((invoice) => invoice.client.toLowerCase() === normalizedClient);
}

/**
 * Returns invoices due within N days and not yet overdue.
 * @param {number} days - Upcoming window in days.
 * @returns {Array<{ id: string, client: string, amount: number, dueDate: string, daysUntilDue: number }>}
 */
async function getUpcomingDue(userId, days = 7, customDataset = null) {
  const invoices = await getInvoices(userId, customDataset);
  return invoices
    .filter((invoice) => invoice.status === "unpaid" && !isOverdue(invoice.dueDate))
    .map((invoice) => ({
      id: invoice.id,
      client: invoice.client,
      amount: invoice.amount,
      dueDate: invoice.dueDate,
      daysUntilDue: daysUntil(invoice.dueDate)
    }))
    .filter((invoice) => invoice.daysUntilDue <= days)
    .sort((left, right) => left.daysUntilDue - right.daysUntilDue);
}

module.exports = {
  getOverdueInvoices,
  getInvoicesByClient,
  getUpcomingDue
};
