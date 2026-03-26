const express = require('express');
const router = express.Router();
const { getDb, getNextSequence } = require('../database');

// List payments
router.get('/', (req, res) => {
  const db = getDb();
  const { consumer_id, bill_id, from_date, to_date } = req.query;
  let sql = `SELECT p.*, c.name as consumer_name, c.code as consumer_code, b.bill_no, b.bill_month, b.bill_year
             FROM payments p
             JOIN consumers c ON p.consumer_id = c.id
             JOIN bills b ON p.bill_id = b.id
             WHERE 1=1`;
  const params = [];
  if (consumer_id) { sql += ' AND p.consumer_id = ?'; params.push(consumer_id); }
  if (bill_id) { sql += ' AND p.bill_id = ?'; params.push(bill_id); }
  if (from_date) { sql += ' AND p.payment_date >= ?'; params.push(from_date); }
  if (to_date) { sql += ' AND p.payment_date <= ?'; params.push(to_date); }
  sql += ' ORDER BY p.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

// Get single payment/receipt
router.get('/:id', (req, res) => {
  const db = getDb();
  const payment = db.prepare(`
    SELECT p.*, c.name as consumer_name, c.code as consumer_code, c.plot_no, c.line_no, c.area,
           b.bill_no, b.bill_month, b.bill_year, b.total_amount as bill_amount
    FROM payments p
    JOIN consumers c ON p.consumer_id = c.id
    JOIN bills b ON p.bill_id = b.id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  res.json(payment);
});

// Record payment
router.post('/', (req, res) => {
  const db = getDb();
  const { bill_id, amount, payment_mode, cheque_dd_no, cheque_date, bank_name, reference_no, payment_date, towards, remarks, custom_fields } = req.body;

  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(bill_id);
  if (!bill) return res.status(404).json({ error: 'Bill not found' });

  try {
    const receiptNo = getNextSequence('receipt_no');

    const result = db.prepare(`
      INSERT INTO payments (receipt_no, bill_id, consumer_id, amount, payment_mode, cheque_dd_no, cheque_date, bank_name, reference_no, payment_date, towards, remarks, custom_fields)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(receiptNo, bill_id, bill.consumer_id, amount, payment_mode || 'Cash', cheque_dd_no || '', cheque_date || '', bank_name || '', reference_no || '', payment_date || new Date().toISOString().split('T')[0], towards || '', remarks || '', JSON.stringify(custom_fields || {}));

    // Mark bill as paid if full amount received
    if (amount >= bill.total_amount) {
      db.prepare("UPDATE bills SET status = 'paid' WHERE id = ?").run(bill_id);
    } else {
      db.prepare("UPDATE bills SET status = 'partial' WHERE id = ?").run(bill_id);
    }

    res.json({
      id: result.lastInsertRowid,
      receipt_no: receiptNo,
      message: 'Payment recorded'
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
