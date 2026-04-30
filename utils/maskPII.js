/**
 * utils/maskPII.js
 * Simple object-based masking for PII before sending to AI.
 */
function maskPII(data) {
  if (!data) return data;
  
  const masked = { ...data };

  // Aadhar — show only last 4 digits
  if (masked.aadhar || masked.aadhar_card) {
    const val = masked.aadhar || masked.aadhar_card;
    masked.aadhar = "XXXX-XXXX-" + String(val).slice(-4);
    masked.aadhar_card = masked.aadhar;
  }

  // PAN — mask middle digits  
  if (masked.pan || masked.pan_card) {
    const val = masked.pan || masked.pan_card;
    const s = String(val);
    masked.pan = s[0] + "XXXX" + s.slice(-4);
    masked.pan_card = masked.pan;
  }

  // Bank account — show only last 4
  if (masked.bank || masked.bank_account) {
    const val = masked.bank || masked.bank_account;
    masked.bank = "XXXX-XXXX-" + String(val).slice(-4);
    masked.bank_account = masked.bank;
  }

  // Phone
  if (masked.contact_number || masked.phone) {
    const val = masked.contact_number || masked.phone;
    const s = String(val);
    masked.contact_number = s.slice(0, 2) + "XXXXXX" + s.slice(-2);
    masked.phone = masked.contact_number;
  }

  // Email
  if (masked.email) {
    const [user, domain] = masked.email.split('@');
    if (user && domain) {
      masked.email = user[0] + "***@" + domain;
    }
  }

  return masked;
}

module.exports = { maskPII };
