const fs = require('fs');
const path = require('path');
const { format, subDays, addDays, startOfMonth, endOfMonth, eachDayOfInterval } = require('date-fns');

/**
 * MASTER SHOWCASE DATASET GENERATOR 2026
 * Designed for "Talk to Data" Hackathon Use Cases.
 */

const outputDir = path.join(__dirname, '../data');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

const outputFile = path.join(outputDir, 'master_showcase_2026.csv');

const HEADERS = 'id,date,type,amount,category,description,client,region,channel,status,dueDate,email';

const CLIENT_EMAILS = {
  'Sharma Retail': 'nandan.nv358@gmail.com, krishanmalhotra2005@gmail.com',
  'Sigma Traders': 'sigma.contact@example.com',
  'Beta Logistics': 'beta.ops@example.com',
  'Alpha Supplies': 'alpha.trading@example.com',
  'Global Exports Ltd': 'global.support@example.com',
  'Walk-in Client': 'n/a'
};

const CLIENTS = [
  'Sigma Traders',      // Reliable, North, Wholesale
  'Beta Logistics',     // Growth, South, Wholesale
  'Alpha Supplies',     // Mid, East, Retail
  'Sharma Retail',      // High Risk, West, Retail
  'Global Exports Ltd', // Digital/Export
  'Walk-in Client'      // Miscellaneous
];

const REGIONS = ['North', 'South', 'East', 'West'];
const CHANNELS = ['Wholesale', 'Retail', 'Digital', 'Export'];

const rows = [];
let txnId = 1000;

function createTxn(date, type, amount, category, description, client, region, channel, status = 'paid', dueDate = '') {
  const id = `TXN${txnId++}`;
  const email = CLIENT_EMAILS[client] || 'contact@example.com';
  return `${id},${format(date, 'yyyy-MM-dd')},${type},${amount.toFixed(2)},${category},${description},${client},${region},${channel},${status},${dueDate},${email}`;
}

// --------------------------------------------------------------------------------
// JAN - JUNE 2026 GENERATION
// --------------------------------------------------------------------------------

const startDate = startOfMonth(new Date(2026, 0, 1)); // Jan 1
const months = [0, 1, 2, 3, 4, 5]; // Jan to June

months.forEach(m => {
  const monthStart = startOfMonth(new Date(2026, m, 1));
  const monthEnd = endOfMonth(monthStart);
  const monthName = format(monthStart, 'MMMM');

  // 1. REGULAR INCOME (WHOLESALE)
  // North Region - Sigma Traders (Baseline ~ ₹2L - ₹3L)
  let northAmount = 250000 + (Math.random() * 50000);
  
  // SPECIAL CASE: JUNE DROP
  if (m === 5) { // June
    northAmount = 90000; // CRISIS! 60% drop
    rows.push(createTxn(monthStart, 'income', northAmount, 'sales', 'Wholesale delivery - supply chain shortage', 'Sigma Traders', 'North', 'Wholesale'));
  } else {
    rows.push(createTxn(monthStart, 'income', northAmount, 'sales', 'Monthly wholesale distribution', 'Sigma Traders', 'North', 'Wholesale'));
  }

  // NEW: CONSULTING INCOME (Diversification)
  const consultingAmount = 45000 + (Math.random() * 10000);
  rows.push(createTxn(addDays(monthStart, 3), 'income', consultingAmount, 'consulting', 'Quarterly supply-chain advisory', 'Sigma Traders', 'North', 'Export'));

  // South Region - Beta Logistics (Steady Growth 5%)
  const southAmount = 100000 * Math.pow(1.05, m);
  rows.push(createTxn(addDays(monthStart, 5), 'income', southAmount, 'sales', 'Logistics hub revenue', 'Beta Logistics', 'South', 'Wholesale'));

  // 2. RETAIL INCOME
  // East Region - Alpha Supplies
  rows.push(createTxn(addDays(monthStart, 10), 'income', 45000 + (Math.random() * 10000), 'sales', 'Retail supplies', 'Alpha Supplies', 'East', 'Retail'));

  // West Region - Sharma Retail (High Risk Setup)
  const sharmaAmount = 55000 + (Math.random() * 5000);
  if (m === 5) { // June - Problematic
    rows.push(createTxn(addDays(monthStart, 15), 'income', sharmaAmount, 'sales', 'Bulk retail order', 'Sharma Retail', 'West', 'Retail', 'overdue', format(addDays(monthStart, 30), 'yyyy-MM-dd')));
    rows.push(createTxn(addDays(monthStart, 20), 'income', sharmaAmount + 10000, 'sales', 'Seasonal stock', 'Sharma Retail', 'West', 'Retail', 'overdue', format(addDays(monthStart, 35), 'yyyy-MM-dd')));
  } else {
    rows.push(createTxn(addDays(monthStart, 15), 'income', sharmaAmount, 'sales', 'Bulk retail order', 'Sharma Retail', 'West', 'Retail'));
  }

  // 3. DIGITAL CHANNEL
  let digitalAmount = 20000 + (Math.random() * 5000);
  if (m === 4) digitalAmount = 85000; // MAY SPIKE (after April Marketing)
  if (m === 5) digitalAmount = 110000; // JUNE CONTINUED GROWTH
  rows.push(createTxn(addDays(monthStart, 25), 'income', digitalAmount, 'sales', 'Online store orders', 'Global Exports Ltd', 'All', 'Digital'));

  // 4. OPERATIONAL EXPENSES (Baseline)
  rows.push(createTxn(addDays(monthStart, 2), 'expense', 45000, 'rent', 'HQ Rent', 'Mehta Realty', 'North', 'Internal'));
  rows.push(createTxn(addDays(monthStart, 28), 'expense', 120000, 'salaries', 'Staff Payroll', 'Multiple', 'All', 'Internal'));
  rows.push(createTxn(addDays(monthStart, 12), 'expense', 15000 + (Math.random() * 5000), 'logistics', 'Local shipping', 'BlueDart', 'All', 'Retail'));

  // 5. ANOMALY CASE: APRIL MARKETING SPIKE
  if (m === 3) { // April
    rows.push(createTxn(addDays(monthStart, 14), 'expense', 150000, 'marketing', 'Digital Ad Campaign - Q2 Blitz', 'Google Ads', 'All', 'Digital'));
  } else {
    rows.push(createTxn(addDays(monthStart, 14), 'expense', 15000, 'marketing', 'Social media management', 'Ad Agency', 'All', 'Digital'));
  }

  // Random Daily Transactions (~1 per day)
  const interval = eachDayOfInterval({ start: monthStart, end: monthEnd });
  interval.forEach(day => {
    if (Math.random() > 0.5) {
      const isIncome = Math.random() > 0.7;
      const amt = Math.random() * 5000;
      if (isIncome) {
        rows.push(createTxn(day, 'income', amt, 'sales', 'Daily transaction', 'Walk-in Client', 'North', 'Retail'));
      } else {
        rows.push(createTxn(day, 'expense', amt, 'utilities', 'Miscellaneous office cost', 'Utility Corp', 'North', 'Internal'));
      }
    }
  });
});

const finalContent = [HEADERS, ...rows].join('\n');
fs.writeFileSync(outputFile, finalContent);

console.log(`✅ Master Showcase Dataset generated: ${outputFile}`);
console.log(`📊 Totals: ${rows.length} transactions across 6 months.`);
console.log(`💡 Designed to highlight:
- Revenue Drop in June (Supply Chain/North/Wholesale)
- Marketing Anomaly in April (₹1.5L vs ₹15k)
- Correlation: April Ads -> May/June Digital sales spike
- Risk: Sharma Retail overdue in June
- Regions: 40% North bias for breakdown verification`);
