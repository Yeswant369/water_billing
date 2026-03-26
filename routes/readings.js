const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

// List readings (optionally by month/year/consumer)
router.get('/', (req, res) => {
  const db = getDb();
  const { consumer_id, bill_month, bill_year } = req.query;
  let sql = `SELECT r.*, c.name as consumer_name, c.code as consumer_code
             FROM readings r JOIN consumers c ON r.consumer_id = c.id WHERE 1=1`;
  const params = [];
  if (consumer_id) { sql += ' AND r.consumer_id = ?'; params.push(consumer_id); }
  if (bill_month) { sql += ' AND r.bill_month = ?'; params.push(bill_month); }
  if (bill_year) { sql += ' AND r.bill_year = ?'; params.push(bill_year); }
  sql += ' ORDER BY r.reading_date DESC';
  res.json(db.prepare(sql).all(...params));
});

// Add/update reading
router.post('/', (req, res) => {
  const db = getDb();
  const { consumer_id, bill_month, bill_year, previous_reading, present_reading } = req.body;
  try {
    const existing = db.prepare('SELECT id FROM readings WHERE consumer_id=? AND bill_month=? AND bill_year=?')
      .get(consumer_id, bill_month, bill_year);
    if (existing) {
      db.prepare('UPDATE readings SET previous_reading=?, present_reading=?, reading_date=datetime(\'now\',\'localtime\') WHERE id=?')
        .run(previous_reading, present_reading, existing.id);
      res.json({ id: existing.id, message: 'Reading updated' });
    } else {
      const result = db.prepare('INSERT INTO readings (consumer_id, bill_month, bill_year, previous_reading, present_reading) VALUES (?,?,?,?,?)')
        .run(consumer_id, bill_month, bill_year, previous_reading, present_reading);
      res.json({ id: result.lastInsertRowid, message: 'Reading created' });
    }
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Bulk add readings
router.post('/bulk', (req, res) => {
  const db = getDb();
  const { readings } = req.body;
  const insert = db.prepare('INSERT OR REPLACE INTO readings (consumer_id, bill_month, bill_year, previous_reading, present_reading) VALUES (?,?,?,?,?)');
  const tx = db.transaction((items) => {
    for (const r of items) {
      insert.run(r.consumer_id, r.bill_month, r.bill_year, r.previous_reading, r.present_reading);
    }
  });
  try {
    tx(readings);
    res.json({ message: `${readings.length} readings saved` });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
