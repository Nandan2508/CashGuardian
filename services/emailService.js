const nodemailer = require("nodemailer");
const { formatCurrency, printAlert } = require("../utils/formatter");

/**
 * Sends a payment reminder email to an overdue client.
 * @param {{ client: string, amount: number, daysOverdue: number, invoiceId: string }} invoiceData
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string, alert: string }>}
 */
async function sendPaymentReminder(invoiceData) {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT || 587),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_USER,
      subject: `Payment Reminder - Invoice #${invoiceData.invoiceId} Overdue by ${invoiceData.daysOverdue} Days`,
      text: [
        `Dear ${invoiceData.client},`,
        "",
        `This is a friendly reminder that Invoice #${invoiceData.invoiceId} for ${formatCurrency(invoiceData.amount)}`,
        `was due ${invoiceData.daysOverdue} days ago and remains unpaid.`,
        "",
        "Please arrange payment at your earliest convenience to avoid further delays.",
        "",
        "Warm regards,",
        "Mehta Wholesale Traders",
        "(Sent via CashGuardian CLI)"
      ].join("\n")
    });

    return {
      success: true,
      messageId: info.messageId,
      alert: printAlert(`Payment reminder sent for invoice ${invoiceData.invoiceId}.`, "info")
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      alert: printAlert(`Payment reminder failed: ${error.message}`, "danger")
    };
  }
}

module.exports = {
  sendPaymentReminder
};
