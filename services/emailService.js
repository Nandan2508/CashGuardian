const nodemailer = require("nodemailer");
const { formatCurrency, printAlert } = require("../utils/formatter");
const clientContacts = require("../data/clientContacts.json");

/**
 * Resolves a reminder recipient email.
 * Resolution order:
 * 1) explicit EMAIL_TO override
 * 2) client mapping from data/clientContacts.json
 * 3) EMAIL_USER fallback
 * @param {string} clientName - Business client name.
 * @returns {string | null} Email address to send reminder to.
 */
function resolveRecipient(clientName) {
  if (process.env.EMAIL_TO) {
    return process.env.EMAIL_TO;
  }

  if (clientContacts[clientName]) {
    return clientContacts[clientName];
  }

  return process.env.EMAIL_USER || null;
}

/**
 * Checks whether mandatory SMTP config is present.
 * @returns {{ ok: boolean, missing: string[] }} Validation result.
 */
function validateEmailConfig() {
  const requiredVars = ["EMAIL_HOST", "EMAIL_PORT", "EMAIL_USER", "EMAIL_PASS", "EMAIL_FROM"];
  const missing = requiredVars.filter((key) => !process.env[key]);
  return {
    ok: missing.length === 0,
    missing
  };
}

/**
 * Sends a payment reminder email to an overdue client.
 * @param {{ client: string, amount: number, daysOverdue: number, invoiceId: string }} invoiceData
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string, alert: string, recipient?: string }>}
 */
async function sendPaymentReminder(invoiceData) {
  const configValidation = validateEmailConfig();
  if (!configValidation.ok) {
    const missingList = configValidation.missing.join(", ");
    return {
      success: false,
      error: `Missing email configuration: ${missingList}`,
      alert: printAlert(`Payment reminder failed: Missing email configuration (${missingList}).`, "danger")
    };
  }

  const recipient = resolveRecipient(invoiceData.client);
  if (!recipient) {
    return {
      success: false,
      error: "No reminder recipient configured",
      alert: printAlert("Payment reminder failed: no recipient email available.", "danger")
    };
  }

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
      to: recipient,
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
      recipient,
      alert: printAlert(`Payment reminder sent to ${recipient} for invoice ${invoiceData.invoiceId}.`, "info")
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      recipient,
      alert: printAlert(`Payment reminder failed: ${error.message}`, "danger")
    };
  }
}

module.exports = {
  sendPaymentReminder,
  resolveRecipient,
  validateEmailConfig
};
