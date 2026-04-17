const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const files = [
  'val_transactions.json',
  'val_invoices.json',
  'val_metrics.json',
  'val_clientContacts.json'
];

console.log('--- VALIDATION DATA VERIFICATION ---');

let allPassed = true;

files.forEach(file => {
  const filePath = path.join(dataDir, file);
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Missing: ${file}`);
    allPassed = false;
    return;
  }

  try {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`✅ ${file}: Valid JSON`);

    // Schema checks
    if (file === 'val_transactions.json') {
      const net = content.reduce((acc, t) => acc + (t.type === 'income' ? t.amount : -t.amount), 0);
      console.log(`   - Net Balance: ₹${net.toLocaleString('en-IN')}`);
      if (net <= 0) console.warn('   ⚠️ Warning: Net balance is not positive as expected in plan.');
      
      const marketingSpike = content.some(t => t.category === 'marketing' && t.amount > 30000);
      if (marketingSpike) console.log('   - Marketing Anomaly: Detected');
      else console.warn('   ⚠️ Warning: Marketing anomaly not detected.');
    }

    if (file === 'val_invoices.json') {
      const jain = content.filter(i => i.client === 'Jain Textiles');
      const lateCount = jain.filter(i => i.paymentHistory.length > 0 && i.paymentHistory[0] > i.dueDate).length;
      console.log(`   - Jain Textiles: ${lateCount} late payments found`);
      if (lateCount < 3) console.warn('   ⚠️ Warning: Jain Textiles risk profile might be too low.');
    }

  } catch (e) {
    console.error(`❌ ${file}: Invalid JSON or Schema Error - ${e.message}`);
    allPassed = false;
  }
});

if (allPassed) {
  console.log('\n✨ ALL VALIDATION DATA CHECKS PASSED');
  process.exit(0);
} else {
  console.log('\n❌ SOME CHECKS FAILED');
  process.exit(1);
}
