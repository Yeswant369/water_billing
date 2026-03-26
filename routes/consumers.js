const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

// List all consumers
router.get('/', (req, res) => {
  const db = getDb();
  const { search, active } = req.query;
  let sql = 'SELECT * FROM consumers WHERE 1=1';
  const params = [];
  if (active !== undefined) { sql += ' AND active = ?'; params.push(active); }
  if (search) {
    sql += ' AND (name LIKE ? OR code LIKE ? OR plot_no LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  sql += ' ORDER BY code';
  res.json(db.prepare(sql).all(...params));
});

// Get single consumer
router.get('/:id', (req, res) => {
  const db = getDb();
  const consumer = db.prepare('SELECT * FROM consumers WHERE id = ?').get(req.params.id);
  if (!consumer) return res.status(404).json({ error: 'Consumer not found' });
  res.json(consumer);
});

// Create consumer
router.post('/', (req, res) => {
  const db = getDb();
  const { code, name, plot_no, line_no, area, sanctioned_qty, meter_condition, phone, address, custom_fields } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO consumers (code, name, plot_no, line_no, area, sanctioned_qty, meter_condition, phone, address, custom_fields)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(code, name, plot_no || '', line_no || '', area || 'IDA, Kondapalli', sanctioned_qty || 0, meter_condition || 'Working', phone || '', address || '', JSON.stringify(custom_fields || {}));
    res.json({ id: result.lastInsertRowid, message: 'Consumer created' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Update consumer
router.put('/:id', (req, res) => {
  const db = getDb();
  const { code, name, plot_no, line_no, area, sanctioned_qty, meter_condition, phone, address, active, custom_fields } = req.body;
  try {
    db.prepare(`
      UPDATE consumers SET code=?, name=?, plot_no=?, line_no=?, area=?, sanctioned_qty=?, meter_condition=?, phone=?, address=?, active=?, custom_fields=?, updated_at=datetime('now','localtime')
      WHERE id=?
    `).run(code, name, plot_no || '', line_no || '', area || 'IDA, Kondapalli', sanctioned_qty || 0, meter_condition || 'Working', phone || '', address || '', active !== undefined ? active : 1, JSON.stringify(custom_fields || {}), req.params.id);
    res.json({ message: 'Consumer updated' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Delete consumer (soft delete)
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE consumers SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Consumer deactivated' });
});

module.exports = router;
