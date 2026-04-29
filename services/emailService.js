const fs = require('fs');
const path = require('path');
const nodemailer = require("nodemailer");
const { formatCurrency, printAlert } = require("../utils/formatter");
const { getClients } = require("./dataService");

/**
 * Resolves a reminder recipient email.
 * Resolution order:
 * 1) client mapping from customDataset (if provided)
 * 2) client mapping from PostgreSQL clients table
 * 3) client mapping from data/clientContacts.json
 * 4) explicit EMAIL_TO (only if set, used for debug/override)
 * 5) EMAIL_USER fallback
 * @param {string} clientName - Business client name.
 * @param {number} userId - Current user ID for DB lookup.
 * @param {Array<Object>|null} customDataset - Optional active dataset.
 * @returns {Promise<string | null>} Email address to send reminder to.
 */
async function resolveRecipient(clientName, userId, customDataset = null) {
  const normalizedClient = clientName ? clientName.toLowerCase() : "";

  // 1) Explicit EMAIL_TO override (highest priority, used for testing/demos)
  if (process.env.EMAIL_TO) {
    console.log(`📧 Using explicit EMAIL_TO override: ${process.env.EMAIL_TO}`);
    return process.env.EMAIL_TO;
  }

  // 2) Higher Priority: Client mapping from customDataset (if provided)
  if (customDataset && customDataset.length > 0) {
    const row = customDataset.find(item => {
      // Find the client key (robust)
      const clientKey = Object.keys(item).find(k => k.toLowerCase() === 'client' || k.toLowerCase() === 'customer');
      return clientKey && item[clientKey] && item[clientKey].toLowerCase() === normalizedClient;
    });

    if (row) {
      // Find an email key (robust)
      const emailKey = Object.keys(row).find(k => 
        ['email', 'Email', 'E-mail', 'recipient_email', 'contact'].some(variation => k.toLowerCase() === variation.toLowerCase()) ||
        k.toLowerCase().includes('email')
      );
      
      if (emailKey && row[emailKey]) {
        console.log(`📧 Resolved recipient from dataset: ${row[emailKey]} (for ${clientName})`);
        return row[emailKey];
      }
    }
  }

  // 3) Database lookup from PostgreSQL clients table
  if (userId) {
    const dbClients = await getClients(userId);
    // Find client case-insensitively
    const dbMatch = Object.keys(dbClients).find(k => k.toLowerCase() === normalizedClient);
    if (dbMatch && dbClients[dbMatch].includes('@')) {
      console.log(`📧 Resolved recipient from DB: ${dbClients[dbMatch]} (for ${clientName})`);
      return dbClients[dbMatch];
    }
  }

  // 4) Static client contact map (data/clientContacts.json)
  try {
    const contactPath = path.join(__dirname, "../data/clientContacts.json");
    if (fs.existsSync(contactPath)) {
      const clientContacts = require(contactPath);
      if (clientContacts[clientName]) {
        console.log(`📧 Resolved recipient from clientContacts.json: ${clientContacts[clientName]}`);
        return clientContacts[clientName];
      }
    }
  } catch (e) {}

  // 4) Last resort: EMAIL_USER fallback
  const fallback = process.env.EMAIL_USER || null;
  if (fallback) console.log(`📧 Using fallback email: ${fallback}`);
  return fallback;
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
 * @param {number} userId - Authenticated user ID.
 * @param {Array<Object>|null} customDataset - Optional active data context.
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string, alert: string, recipient?: string }>}
 */
async function sendPaymentReminder(invoiceData, userId, customDataset = null) {
  const configValidation = validateEmailConfig();
  if (!configValidation.ok) {
    const missingList = configValidation.missing.join(", ");
    return {
      success: false,
      error: `Missing email configuration: ${missingList}`,
      alert: printAlert(`Payment reminder failed: Missing email configuration (${missingList}).`, "danger")
    };
  }

  const recipient = await resolveRecipient(invoiceData.client, userId, customDataset);
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
        `Warm regards,`,
        process.env.COMPANY_NAME || "Mehta Wholesale Traders",
        "(Sent via CashGuardian Intelligence)"
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

/**
 * Sends a general AI insight report to the user.
 * @param {{ query: string, narrative: string, insightData?: any }} reportData
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string, alert: string, recipient?: string }>}
 */
async function sendInsightReport(reportData) {
  const configValidation = validateEmailConfig();
  if (!configValidation.ok) {
    return { success: false, error: "Missing email configuration", alert: "Failed to send report." };
  }

  const recipient = process.env.EMAIL_TO || process.env.EMAIL_USER;
  
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
      subject: `[CashGuardian] Insight Report: ${reportData.query.substring(0, 30)}...`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #6366F1;">CashGuardian AI Insight</h2>
          <p><strong>Query:</strong> ${reportData.query}</p>
          <hr />
          <div style="background: #f9f9fb; padding: 15px; border-radius: 8px; line-height: 1.6;">
            ${reportData.narrative.replace(/\n/g, '<br>')}
          </div>
          <p style="font-size: 12px; color: #666; margin-top: 20px;">
            Sent from your NatWest Talk to Data Dashboard.
          </p>
        </div>
      `
    });

    return {
      success: true,
      messageId: info.messageId,
      recipient,
      alert: printAlert(`Insight report sent to ${recipient}.`, "info")
    };
  } catch (error) {
    return { success: false, error: error.message, alert: "Email failed." };
  }
}

module.exports = {
  sendPaymentReminder,
  sendInsightReport,
  resolveRecipient,
  validateEmailConfig
};
