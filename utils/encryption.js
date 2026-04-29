/**
 * utils/encryption.js
 * Utility for AES-256-GCM encryption/decryption of sensitive data.
 */
const crypto = require('crypto');
require('dotenv').config();

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard for GCM
const AUTH_TAG_LENGTH = 16;
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

/**
 * Encrypts a string.
 * @param {string} text - The plain text to encrypt.
 * @returns {string} - The encrypted text in format: iv:authTag:encryptedContent (all hex)
 */
function encrypt(text) {
    if (!text) return null;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a string.
 * @param {string} encryptedText - The encrypted string in format: iv:authTag:encryptedContent
 * @returns {string} - The decrypted plain text.
 */
function decrypt(encryptedText) {
    if (!encryptedText) return null;
    try {
        const [ivHex, authTagHex, encryptedContent] = encryptedText.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        
        const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encryptedContent, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (err) {
        console.error('Decryption failed:', err.message);
        return '[DECRYPTION ERROR]';
    }
}

/**
 * Masks a string, showing only the last N characters.
 * @param {string} text - The plain text to mask.
 * @param {number} visibleCount - Number of characters to show at the end.
 * @returns {string} - Masked string (e.g., XXXXXXXX1234)
 */
function maskData(text, visibleCount = 4) {
    if (!text) return 'N/A';
    if (text.length <= visibleCount) return text;
    const maskedPart = 'X'.repeat(text.length - visibleCount);
    const visiblePart = text.slice(-visibleCount);
    
    // For Aadhar specifically, keep the dashes if they exist
    if (text.includes('-')) {
        return text.replace(/.(?=.{4})/g, 'X');
    }
    
    return maskedPart + visiblePart;
}

module.exports = { encrypt, decrypt, maskData };
