const XLSX = require('xlsx');
const path = require('path');

// --- SETUP DATA ---

// 1. Transactions (90 Days)
const transactions = [];
const categories = ['sales', 'consulting', 'rent', 'salaries', 'logistics', 'utilities', 'marketing'];
const startDate = new Date();
startDate.setDate(startDate.getDate() - 90);

for (let i = 0; i < 150; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + Math.floor(i * 0.6));
    
    const isIncome = Math.random() > 0.4;
    const category = isIncome ? (Math.random() > 0.2 ? 'sales' : 'consulting') : categories[Math.floor(Math.random() * (categories.length - 2)) + 2];
    
    // Add an Anomaly: Massive Logistics Spike in Week 8
    let amount = isIncome ? Math.floor(Math.random() * 50000) + 20000 : Math.floor(Math.random() * 15000) + 5000;
    if (category === 'logistics' && i > 120 && i < 125) {
        amount = 85000; // The Anomaly
    }

    transactions.push({
        id: `TXN${1000 + i}`,
        date: date.toISOString().split('T')[0],
        type: isIncome ? 'income' : 'expense',
        amount: amount,
        category: category,
        description: isIncome ? `Payment from Client ${i % 5}` : `${category} monthly bill`,
        client: isIncome ? (i % 2 === 0 ? 'Sharma Retail' : 'Mehta Wholesale') : null
    });
}

// 2. Invoices
const invoices = [
    { id: 'INV001', client: 'Sharma Retail', amount: 95000, issueDate: '2026-03-01', dueDate: '2026-03-15', status: 'paid' },
    { id: 'INV002', client: 'Sharma Retail', amount: 120000, issueDate: '2026-04-01', dueDate: '2026-04-15', status: 'overdue' },
    { id: 'INV003', client: 'Mehta Wholesale', amount: 80000, issueDate: '2026-03-10', dueDate: '2026-03-24', status: 'paid' },
    { id: 'INV004', client: 'Mehta Wholesale', amount: 45000, issueDate: '2026-04-05', dueDate: '2026-04-19', status: 'unpaid' },
    { id: 'INV005', client: 'Verma & Sons', amount: 215000, issueDate: '2026-02-20', dueDate: '2026-03-05', status: 'overdue' }
];

// 3. Clients (KYC Data)
const clients = [
    { name: 'Sharma Retail', email: 'sharma@example.com', contact: '9876543210', region: 'North', pan: 'ABCPS1234F' },
    { name: 'Mehta Wholesale', email: 'mehta@example.com', contact: '9123456789', region: 'West', pan: 'XYZPM5678G' },
    { name: 'Verma & Sons', email: 'verma@example.com', contact: '9000000001', region: 'South', pan: 'QRSPV9012H' }
];

// --- GENERATE XLSX ---
const wb = XLSX.utils.book_new();

const wsTransactions = XLSX.utils.json_to_sheet(transactions);
XLSX.utils.book_append_sheet(wb, wsTransactions, "Transactions");

const wsInvoices = XLSX.utils.json_to_sheet(invoices);
XLSX.utils.book_append_sheet(wb, wsInvoices, "Invoices");

const wsClients = XLSX.utils.json_to_sheet(clients);
XLSX.utils.book_append_sheet(wb, wsClients, "Clients");

const filePath = path.join(__dirname, 'Master_Demo_Dataset.xlsx');
XLSX.writeFile(wb, filePath);

console.log(`✅ Master dataset generated at: ${filePath}`);
