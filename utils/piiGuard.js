/**
 * utils/piiGuard.js
 * High-precision PII masking for Indian financial data.
 */

/**
 * Redacts 9-18 digit numbers ONLY if they are likely bank accounts
 * (based on keywords) or specifically provided in a redaction list.
 * @param {string} text - The text to scrub.
 * @param {string[]} redactionList - Array of exact strings to mask.
 * @returns {string} Scrubbed text.
 */
function maskPII(text, redactionList = []) {
  if (!text) return text;
  let maskedText = text;

  // 1. Mask exact matches from our known database (Highest Accuracy)
  redactionList.forEach(item => {
    if (item && String(item).length > 5) {
      const strItem = String(item);
      const masked = 'X'.repeat(Math.max(1, strItem.length - 4)) + strItem.slice(-4);
      // Escape special characters and replace case-insensitively
      const escaped = strItem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const itemRegex = new RegExp(escaped, 'gi');
      maskedText = maskedText.replace(itemRegex, masked);
    }
  });

  // 2. Pattern-based masking for PAN Cards (e.g. ABCDE1234F)
  const panRegex = /[A-Z]{5}[0-9]{4}[A-Z]{1}/gi;
  maskedText = maskedText.replace(panRegex, (match) => {
    return 'XXXXX' + match.slice(5).toUpperCase();
  });

  // 3. Pattern-based masking for Aadhaar (e.g. 1234 5678 9012)
  const aadharRegex = /\b\d{4}\s\d{4}\s\d{4}\b/g;
  maskedText = maskedText.replace(aadharRegex, "XXXX XXXX XXXX");

  // 4. Contextual masking for Bank Accounts (e.g. A/C: 9102837465)
  const bankContextRegex = /(A\/C|Account|Bank|SB|Acc|No\.?|Banking_Ref|Reference)\s*:?\s*(\d{9,18})/gi;
  maskedText = maskedText.replace(bankContextRegex, (match, p1, p2) => {
    const masked = 'X'.repeat(Math.max(1, p2.length - 4)) + p2.slice(-4);
    return `${p1}: ${masked}`;
  });

  return maskedText;
}

module.exports = { maskPII };
