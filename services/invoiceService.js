const invoices = require("../data/invoices.json");
const { daysPastDue, daysUntil, isOverdue } = require("../utils/dateUtils");

/**
 * Returns all overdue invoices sorted by days overdue descending.
 * @returns {Array<{ id: string, client: string, amount: number, dueDate: string, daysOverdue: number }>}
 */
function getOverdueInvoices() {
  return invoices
    .filter((invoice) => invoice.status === "overdue" && isOverdue(invoice.dueDate))
    .map((invoice) => ({
      id: invoice.id,
      client: invoice.client,
      amount: invoice.amount,
      dueDate: invoice.dueDate,
      daysOverdue: daysPastDue(invoice.dueDate)
    }))
    .sort((left, right) => right.daysOverdue - left.daysOverdue);
}

/**
 * Returns all invoices for a named client.
 * @param {string} clientName - Client business name.
 * @returns {Array<object>} Matching invoices.
 */
function getInvoicesByClient(clientName) {
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
function getUpcomingDue(days = 7) {
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
