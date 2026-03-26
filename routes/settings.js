const express = require('express');
const router = express.Router();
const { getDb, getAllSettings, setSetting } = require('../database');

// Get all settings
router.get('/', (req, res) => {
  res.json(getAllSettings());
});

// Update settings
router.put('/', (req, res) => {
  const settings = req.body;
  for (const [key, value] of Object.entries(settings)) {
    setSetting(key, value);
  }
  res.json({ message: 'Settings updated' });
});

// Get sequences
router.get('/sequences', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM sequences').all());
});

// Update sequence
router.put('/sequences/:name', (req, res) => {
  const db = getDb();
  const { prefix, current_value, padding } = req.body;
  db.prepare('UPDATE sequences SET prefix=?, current_value=?, padding=? WHERE name=?')
    .run(prefix || '', current_value || 0, padding || 0, req.params.name);
  res.json({ message: 'Sequence updated' });
});

module.exports = router;
