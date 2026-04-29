/**
 * scripts/verify_encryption.js
 * Verifies that sensitive data is stored encrypted in DB and can be decrypted.
 */
const { Pool } = require('pg');
const { decrypt, maskData } = require('../utils/encryption');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function verify() {
  try {
    const res = await pool.query('SELECT name, aadhar_card, pan_card, bank_account FROM clients LIMIT 1');
    const client = res.rows[0];

    if (!client) {
        console.log('No clients found.');
        return;
    }

    console.log(`\n🔍 Verifying Data for Client: ${client.name}`);
    console.log('-------------------------------------------');
    
    console.log('Aadhar (Raw from DB):', client.aadhar_card);
    const decryptedAadhar = decrypt(client.aadhar_card);
    console.log('Aadhar (Decrypted):  ', decryptedAadhar);
    console.log('Aadhar (Masked):     ', maskData(decryptedAadhar));
    
    console.log('\nPAN (Raw from DB):   ', client.pan_card);
    const decryptedPan = decrypt(client.pan_card);
    console.log('PAN (Decrypted):     ', decryptedPan);
    console.log('PAN (Masked):        ', maskData(decryptedPan));
    
    console.log('\nBank A/C (Raw DB):   ', client.bank_account);
    const decryptedBank = decrypt(client.bank_account);
    console.log('Bank A/C (Decrypted):', decryptedBank);
    console.log('Bank A/C (Masked):   ', maskData(decryptedBank));
    
  } catch (err) {
    console.error('Verification failed:', err);
  } finally {
    await pool.end();
  }
}

verify();
