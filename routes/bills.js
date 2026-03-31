const express = require('express');
const router = express.Router();
const { getDb, getNextSequence, getSetting } = require('../database');

// List bills
router.get('/', (req, res) => {
  const db = getDb();
  const { consumer_id, bill_month, bill_year, status } = req.query;
  let sql = `SELECT b.*, c.name as consumer_name, c.code as consumer_code, c.plot_no, c.line_no, c.area
             FROM bills b JOIN consumers c ON b.consumer_id = c.id WHERE 1=1`;
  const params = [];
  if (consumer_id) { sql += ' AND b.consumer_id = ?'; params.push(consumer_id); }
  if (bill_month) { sql += ' AND b.bill_month = ?'; params.push(bill_month); }
  if (bill_year) { sql += ' AND b.bill_year = ?'; params.push(bill_year); }
  if (status) { sql += ' AND b.status = ?'; params.push(status); }
  sql += ' ORDER BY b.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

// Get single bill with full details
router.get('/:id', (req, res) => {
  const db = getDb();
  const bill = db.prepare(`
    SELECT b.*, c.name as consumer_name, c.code as consumer_code, c.plot_no, c.line_no, c.area, c.meter_condition
    FROM bills b JOIN consumers c ON b.consumer_id = c.id WHERE b.id = ?
  `).get(req.params.id);
  if (!bill) return res.status(404).json({ error: 'Bill not found' });
  res.json(bill);
});

// Generate bill for a consumer
router.post('/generate', (req, res) => {
  const db = getDb();
  const { consumer_id, bill_month, bill_year, previous_reading, present_reading, arrears, other_charges, custom_fields } = req.body;

  const consumer = db.prepare('SELECT * FROM consumers WHERE id = ?').get(consumer_id);
  if (!consumer) return res.status(404).json({ error: 'Consumer not found' });

  const rate = parseFloat(getSetting('rate_per_kl')) || 18;
  const excessRate = parseFloat(getSetting('excess_rate_per_kl')) || 27;

  const consumption = (present_reading || 0) - (previous_reading || 0);
  const dailySanctioned = consumer.sanctioned_qty || 0;
  const sanctionedQty = dailySanctioned * 30; // Monthly = daily × 30

  // Minimum billing: if consumption < 60% of sanctioned qty, bill at 60% minimum
  const minQty = sanctionedQty > 0 ? sanctionedQty * 0.6 : 0;
  const billableQty = Math.max(consumption, minQty);

  const excessQty = sanctionedQty > 0 ? Math.max(0, billableQty - sanctionedQty) : 0;
  const normalQty = billableQty - excessQty;

  const consumptionCharges = (normalQty * rate) / 1000;
  const excessCharges = (excessQty * excessRate) / 1000;
  const arr = parseFloat(arrears) || 0;
  const other = parseFloat(other_charges) || 0;
  const total = consumptionCharges + excessCharges + arr + other;

  try {
    // Save reading
    const existingReading = db.prepare('SELECT id FROM readings WHERE consumer_id=? AND bill_month=? AND bill_year=?')
      .get(consumer_id, bill_month, bill_year);
    let readingId;
    if (existingReading) {
      db.prepare('UPDATE readings SET previous_reading=?, present_reading=? WHERE id=?')
        .run(previous_reading, present_reading, existingReading.id);
      readingId = existingReading.id;
    } else {
      const rResult = db.prepare('INSERT INTO readings (consumer_id, bill_month, bill_year, previous_reading, present_reading) VALUES (?,?,?,?,?)')
        .run(consumer_id, bill_month, bill_year, previous_reading, present_reading);
      readingId = rResult.lastInsertRowid;
    }

    const billNo = getNextSequence('bill_no');

    const result = db.prepare(`
      INSERT INTO bills (bill_no, consumer_id, reading_id, bill_month, bill_year, previous_reading, present_reading,
        consumption, sanctioned_qty, excess_qty, rate_per_kl, excess_rate_per_kl,
        consumption_charges, excess_charges, other_charges, arrears, total_amount, custom_fields)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(billNo, consumer_id, readingId, bill_month, bill_year, previous_reading, present_reading,
      consumption, sanctionedQty, excessQty, rate, excessRate,
      consumptionCharges, excessCharges, other, arr, total, JSON.stringify(custom_fields || {}));

    res.json({
      id: result.lastInsertRowid,
      bill_no: billNo,
      total_amount: total,
      message: 'Bill generated'
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Bulk generate bills
router.post('/generate-bulk', (req, res) => {
  const db = getDb();
  const { bill_month, bill_year, consumer_ids } = req.body;
  const rate = parseFloat(getSetting('rate_per_kl')) || 18;
  const excessRate = parseFloat(getSetting('excess_rate_per_kl')) || 27;

  const results = [];
  const tx = db.transaction(() => {
    const consumers = consumer_ids
      ? db.prepare(`SELECT * FROM consumers WHERE id IN (${consumer_ids.map(() => '?').join(',')}) AND active = 1`).all(...consumer_ids)
      : db.prepare('SELECT * FROM consumers WHERE active = 1').all();

    for (const consumer of consumers) {
      const reading = db.prepare('SELECT * FROM readings WHERE consumer_id=? AND bill_month=? AND bill_year=?')
        .get(consumer.id, bill_month, bill_year);
      if (!reading) continue;

      // Check if bill already exists
      const existingBill = db.prepare('SELECT id FROM bills WHERE consumer_id=? AND bill_month=? AND bill_year=?')
        .get(consumer.id, bill_month, bill_year);
      if (existingBill) continue;

      const consumption = reading.consumption;
      const dailySanctioned = consumer.sanctioned_qty || 0;
      const sanctionedQty = dailySanctioned * 30; // Monthly = daily × 30

      // Minimum billing: if consumption < 60% of sanctioned qty, bill at 60% minimum
      const minQty = sanctionedQty > 0 ? sanctionedQty * 0.6 : 0;
      const billableQty = Math.max(consumption, minQty);

      const excessQty = sanctionedQty > 0 ? Math.max(0, billableQty - sanctionedQty) : 0;
      const normalQty = billableQty - excessQty;
      const consumptionCharges = normalQty * rate;
      const excessCharges = excessQty * excessRate;

      // Get arrears from last unpaid bill
      const lastBill = db.prepare("SELECT total_amount FROM bills WHERE consumer_id=? AND status='unpaid' ORDER BY created_at DESC LIMIT 1")
        .get(consumer.id);
      const arrears = lastBill ? lastBill.total_amount : 0;

      const total = consumptionCharges + excessCharges + arrears;
      const billNo = getNextSequence('bill_no');

      db.prepare(`
        INSERT INTO bills (bill_no, consumer_id, reading_id, bill_month, bill_year, previous_reading, present_reading,
          consumption, sanctioned_qty, excess_qty, rate_per_kl, excess_rate_per_kl,
          consumption_charges, excess_charges, other_charges, arrears, total_amount)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(billNo, consumer.id, reading.id, bill_month, bill_year, reading.previous_reading, reading.present_reading,
        consumption, sanctionedQty, excessQty, rate, excessRate,
        consumptionCharges, excessCharges, 0, arrears, total);

      results.push({ consumer_code: consumer.code, consumer_name: consumer.name, bill_no: billNo, total });
    }
  });

  try {
    tx();
    res.json({ generated: results.length, bills: results });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Update bill status
router.put('/:id', (req, res) => {
  const db = getDb();
  const { status, arrears, other_charges } = req.body;
  if (status) db.prepare('UPDATE bills SET status = ? WHERE id = ?').run(status, req.params.id);
  if (arrears !== undefined) {
    const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
    const newTotal = bill.consumption_charges + bill.excess_charges + parseFloat(arrears) + (bill.other_charges || 0);
    db.prepare('UPDATE bills SET arrears = ?, total_amount = ? WHERE id = ?').run(arrears, newTotal, req.params.id);
  }
  res.json({ message: 'Bill updated' });
});

module.exports = router;
