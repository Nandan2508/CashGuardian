const fs = require('fs');
const path = require('path');

const startDate = new Date('2026-01-15');
const endDate = new Date('2026-04-19');
const csvFile = path.join(__dirname, '../data/test_13_week_dataset.csv');

const clients = [
  { name: 'Alpha Retail', industry: 'Retail' },
  { name: 'Beta Logistics', industry: 'Logistics' },
  { name: 'Gamma Services', industry: 'Services' },
  { name: 'Delta Manufacturing', industry: 'Manufacturing' },
  { name: 'Sigma Traders', industry: 'Wholesale' }
];

const categories = ['sales', 'consulting', 'rent', 'salaries', 'logistics', 'utilities', 'marketing', 'miscellaneous'];

const rows = [];
rows.push('date,type,amount,category,description,client,status,dueDate,issueDate');

let current = new Date(startDate);
while (current <= endDate) {
  const dateStr = current.toISOString().slice(0, 10);
  
  // 1. Daily Sales
  const salesCount = Math.floor(Math.random() * 2) + 1;
  for (let i = 0; i < salesCount; i++) {
    const amount = Math.floor(Math.random() * 15000) + 5000;
    const client = clients[Math.floor(Math.random() * clients.length)].name;
    rows.push(`${dateStr},income,${amount},sales,Daily Retail Settlement,${client},paid,${dateStr},${dateStr}`);
  }

  // 2. Daily Small Expenses
  const expAmount = Math.floor(Math.random() * 3000) + 500;
  rows.push(`${dateStr},expense,${expAmount},utilities,Daily Operational Expense,,paid,${dateStr},${dateStr}`);

  // 3. Weekly Rent (Mondays)
  if (current.getUTCDay() === 1) {
    rows.push(`${dateStr},expense,25000,rent,Office Rent Payment,,paid,${dateStr},${dateStr}`);
  }

  // 4. Monthly Salaries (1st of month)
  if (current.getUTCDate() === 1) {
    rows.push(`${dateStr},expense,120000,salaries,Staff Salaries Deployment,,paid,${dateStr},${dateStr}`);
  }

  // 5. Invoices (Mixed Status)
  if (current.getUTCDay() === 3) { // Wednesdays
    const clientIdx = Math.floor(Math.random() * clients.length);
    const client = clients[clientIdx].name;
    const amount = Math.floor(Math.random() * 50000) + 20000;
    const due = new Date(current);
    due.setUTCDate(due.getUTCDate() + 15);
    const dueStr = due.toISOString().slice(0, 10);
    
    // Some are unpaid, some are overdue if 'current' is far back
    let status = 'paid';
    if (current > new Date('2026-04-01')) status = 'unpaid';
    if (due < new Date()) {
        // If due date has passed, it might be overdue
        status = Math.random() > 0.5 ? 'overdue' : 'paid';
    }

    rows.push(`${dateStr},income,${amount},consulting,Invoice ${rows.length},${client},${status},${dueStr},${dateStr}`);
  }

  // 6. Anomalies (Specific weeks)
  const weekNum = Math.ceil((current.getTime() - new Date(current.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
  if (weekNum === 8 && current.getUTCDay() === 5) {
      rows.push(`${dateStr},expense,85000,logistics,Surge Logistics - Emergency Shipment,,paid,${dateStr},${dateStr}`);
  }

  current.setUTCDate(current.getUTCDate() + 1);
}

fs.writeFileSync(csvFile, rows.join('\n'));
console.log(`Generated ${rows.length - 1} records in ${csvFile}`);
