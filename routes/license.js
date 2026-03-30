// ============================================================
// LICENSE API ROUTES
// ============================================================
// Three endpoints:
//
// GET  /api/license/status     → Check if app is licensed
// GET  /api/license/machine-id → Get this machine's unique ID
// POST /api/license/activate   → Activate a new license
//
// The machine-id endpoint is needed so the activation screen
// can display it. The customer reads it off their screen and
// tells you (admin), so you can generate a token locked to
// that specific machine.
// ============================================================

const express = require('express');
const router = express.Router();
const { saveLicense, loadLicense, verifyLicense, getMachineId } = require('../license');

// Get this machine's unique ID
// Customer reads this from the activation screen and tells you
router.get('/machine-id', (req, res) => {
  res.json({ machineId: getMachineId() });
});

// Check current license status
router.get('/status', (req, res) => {
  const token = loadLicense();

  if (!token) {
    return res.json({ licensed: false });
  }

  const result = verifyLicense(token);
  if (result.valid) {
    res.json({
      licensed: true,
      licensee: result.data.licensee,
      type: result.data.type,
      expiry: new Date(result.data.exp * 1000)
    });
  } else {
    res.json({ licensed: false, error: result.error });
  }
});

// Activate a license
router.post('/activate', (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'License token is required' });
  }

  const result = verifyLicense(token);
  if (!result.valid) {
    return res.status(400).json({ error: result.error });
  }

  saveLicense(token);

  res.json({
    licensed: true,
    licensee: result.data.licensee,
    type: result.data.type,
    message: 'License activated successfully'
  });
});

module.exports = router;
