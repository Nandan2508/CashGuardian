/**
 * scripts/generateMonthlyRollup.js
 * Aggregates transactional data from test_13_week_dataset.csv into monthly summaries.
 */

const fs = require('fs');
const path = require('path');
const { format, parseISO, startOfMonth } = require('date-fns');

const INPUT_FILE = path.join(__dirname, '../data/test_13_week_dataset.csv');
const OUTPUT_FILE = path.join(__dirname, '../data/monthly_rollups.csv');

function safeNumber(val) {
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

try {
  console.log(`Reading ${INPUT_FILE}...`);
  const content = fs.readFileSync(INPUT_FILE, 'utf8');
  const lines = content.trim().split('\n');
  
  if (lines.length < 2) {
    throw new Error('CSV file is empty or missing headers.');
  }

  const headers = lines[0].split(',').map(h => h.replace(/"/g, "").trim());
  const transactions = lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.replace(/"/g, "").trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i]);
    return obj;
  });

  const rollups = {};

  transactions.forEach(t => {
    if (!t.date || !t.amount) return;
    
    const date = parseISO(t.date);
    if (isNaN(date.getTime())) return;

    const monthKey = format(date, 'MMMM yyyy'); // e.g., "March 2026"
    
    if (!rollups[monthKey]) {
      rollups[monthKey] = {
        month: monthKey,
        income: 0,
        expenses: 0,
        net: 0,
        transactionCount: 0,
        categories: {}
      };
    }

    const amount = safeNumber(t.amount);
    const type = t.type ? t.type.toLowerCase() : (amount > 0 ? 'income' : 'expense');

    if (type === 'income') {
      rollups[monthKey].income += amount;
    } else {
      rollups[monthKey].expenses += Math.abs(amount);
      const cat = t.category || 'Miscellaneous';
      rollups[monthKey].categories[cat] = (rollups[monthKey].categories[cat] || 0) + Math.abs(amount);
    }

    rollups[monthKey].transactionCount++;
  });

  // Convert to CSV
  const csvHeaders = ['Month', 'Total Income', 'Total Expenses', 'Net Cash Flow', 'Txn Count', 'Top Expense Category'];
  const csvRows = [csvHeaders.join(',')];

  Object.values(rollups)
    .sort((a, b) => {
      const dateA = new Date(a.month);
      const dateB = new Date(b.month);
      return dateA - dateB;
    })
    .forEach(r => {
      r.net = r.income - r.expenses;
      
      let topCat = 'None';
      let maxVal = -1;
      Object.entries(r.categories).forEach(([name, val]) => {
        if (val > maxVal) {
          maxVal = val;
          topCat = name;
        }
      });

      csvRows.push([
        `"${r.month}"`,
        r.income.toFixed(2),
        r.expenses.toFixed(2),
        r.net.toFixed(2),
        r.transactionCount,
        `"${topCat}"`
      ].join(','));
    });

  fs.writeFileSync(OUTPUT_FILE, csvRows.join('\n'));
  console.log(`✅ Success! Monthly rollup generated at ${OUTPUT_FILE}`);

} catch (err) {
  console.error('❌ Error generating rollup:', err.message);
  process.exit(1);
}
