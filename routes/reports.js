const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

// Dashboard summary
router.get('/dashboard', (req, res) => {
  const db = getDb();
  const totalConsumers = db.prepare('SELECT COUNT(*) as count FROM consumers WHERE active=1').get().count;
  const totalBills = db.prepare('SELECT COUNT(*) as count FROM bills').get().count;
  const unpaidBills = db.prepare("SELECT COUNT(*) as count FROM bills WHERE status='unpaid'").get().count;
  const totalRevenue = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM payments').get().total;
  const pendingAmount = db.prepare("SELECT COALESCE(SUM(total_amount),0) as total FROM bills WHERE status='unpaid'").get().total;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthlyCollection = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE payment_date LIKE ?').get(thisMonth + '%').total;

  res.json({ totalConsumers, totalBills, unpaidBills, totalRevenue, pendingAmount, monthlyCollection });
});

// Monthly report
router.get('/monthly', (req, res) => {
  const db = getDb();
  const { bill_month, bill_year } = req.query;
  const bills = db.prepare(`
    SELECT b.*, c.name as consumer_name, c.code as consumer_code,
           (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.bill_id = b.id) as paid_amount
    FROM bills b JOIN consumers c ON b.consumer_id = c.id
    WHERE b.bill_month = ? AND b.bill_year = ?
    ORDER BY c.code
  `).all(bill_month, bill_year);
  const totals = {
    total_consumption: bills.reduce((s, b) => s + b.consumption, 0),
    total_charges: bills.reduce((s, b) => s + b.total_amount, 0),
    total_paid: bills.reduce((s, b) => s + b.paid_amount, 0),
    total_pending: bills.reduce((s, b) => s + (b.total_amount - b.paid_amount), 0)
  };
  res.json({ bills, totals });
});

// Consumer ledger
router.get('/ledger/:consumerId', (req, res) => {
  const db = getDb();
  const consumer = db.prepare('SELECT * FROM consumers WHERE id=?').get(req.params.consumerId);
  const bills = db.prepare('SELECT * FROM bills WHERE consumer_id=? ORDER BY bill_year, bill_month').all(req.params.consumerId);
  const payments = db.prepare('SELECT * FROM payments WHERE consumer_id=? ORDER BY payment_date').all(req.params.consumerId);
  res.json({ consumer, bills, payments });
});

// Collection report
router.get('/collections', (req, res) => {
  const db = getDb();
  const { from_date, to_date } = req.query;
  let sql = `SELECT p.*, c.name as consumer_name, c.code as consumer_code, b.bill_no
             FROM payments p
             JOIN consumers c ON p.consumer_id = c.id
             JOIN bills b ON p.bill_id = b.id
             WHERE 1=1`;
  const params = [];
  if (from_date) { sql += ' AND p.payment_date >= ?'; params.push(from_date); }
  if (to_date) { sql += ' AND p.payment_date <= ?'; params.push(to_date); }
  sql += ' ORDER BY p.payment_date DESC';
  const payments = db.prepare(sql).all(...params);
  const total = payments.reduce((s, p) => s + p.amount, 0);
  res.json({ payments, total });
});

module.exports = router;
