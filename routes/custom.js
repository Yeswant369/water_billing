const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

// === Custom Tabs ===
router.get('/tabs', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM custom_tabs WHERE active=1 ORDER BY sort_order').all());
});

router.post('/tabs', (req, res) => {
  const db = getDb();
  const { tab_name, tab_label, icon, sort_order } = req.body;
  try {
    const result = db.prepare('INSERT INTO custom_tabs (tab_name, tab_label, icon, sort_order) VALUES (?,?,?,?)')
      .run(tab_name, tab_label, icon || 'folder', sort_order || 0);
    res.json({ id: result.lastInsertRowid, message: 'Tab created' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/tabs/:id', (req, res) => {
  const db = getDb();
  const { tab_label, icon, sort_order, active } = req.body;
  db.prepare('UPDATE custom_tabs SET tab_label=?, icon=?, sort_order=?, active=? WHERE id=?')
    .run(tab_label, icon, sort_order || 0, active !== undefined ? active : 1, req.params.id);
  res.json({ message: 'Tab updated' });
});

router.delete('/tabs/:id', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE custom_tabs SET active=0 WHERE id=?').run(req.params.id);
  res.json({ message: 'Tab deleted' });
});

// === Custom Tab Data ===
router.get('/tabs/:tabId/data', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM custom_tab_data WHERE tab_id=? ORDER BY created_at DESC').all(req.params.tabId));
});

router.post('/tabs/:tabId/data', (req, res) => {
  const db = getDb();
  const { data } = req.body;
  const result = db.prepare('INSERT INTO custom_tab_data (tab_id, data) VALUES (?,?)')
    .run(req.params.tabId, JSON.stringify(data || {}));
  res.json({ id: result.lastInsertRowid, message: 'Data created' });
});

router.put('/tabs/:tabId/data/:id', (req, res) => {
  const db = getDb();
  const { data } = req.body;
  db.prepare("UPDATE custom_tab_data SET data=?, updated_at=datetime('now','localtime') WHERE id=? AND tab_id=?")
    .run(JSON.stringify(data || {}), req.params.id, req.params.tabId);
  res.json({ message: 'Data updated' });
});

router.delete('/tabs/:tabId/data/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM custom_tab_data WHERE id=? AND tab_id=?').run(req.params.id, req.params.tabId);
  res.json({ message: 'Data deleted' });
});

// === Custom Field Definitions ===
router.get('/fields', (req, res) => {
  const db = getDb();
  const { entity } = req.query;
  let sql = 'SELECT * FROM custom_field_defs WHERE active=1';
  const params = [];
  if (entity) { sql += ' AND entity=?'; params.push(entity); }
  sql += ' ORDER BY sort_order';
  res.json(db.prepare(sql).all(...params));
});

router.post('/fields', (req, res) => {
  const db = getDb();
  const { entity, field_name, field_label, field_type, options, required, sort_order } = req.body;
  try {
    const result = db.prepare('INSERT INTO custom_field_defs (entity, field_name, field_label, field_type, options, required, sort_order) VALUES (?,?,?,?,?,?,?)')
      .run(entity, field_name, field_label, field_type || 'text', options || '', required || 0, sort_order || 0);
    res.json({ id: result.lastInsertRowid, message: 'Field defined' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/fields/:id', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE custom_field_defs SET active=0 WHERE id=?').run(req.params.id);
  res.json({ message: 'Field removed' });
});

module.exports = router;
