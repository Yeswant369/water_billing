const express = require('express');
const path = require('path');
const { getDb } = require('./database');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database on startup
getDb();

// License routes — must come BEFORE the gate so activation is always reachable
app.use('/api/license', require('./routes/license'));

// License gate middleware — blocks all other /api routes if unlicensed
// Every request (except /api/license) passes through here first.
// It loads the saved token, verifies it, and either allows or rejects the request.
const { loadLicense, verifyLicense } = require('./license');
app.use('/api', (req, res, next) => {
  const token = loadLicense();
  if (!token || !verifyLicense(token).valid) {
    return res.status(403).json({ error: 'License required' });
  }
  next();
});

// API Routes — only reachable if license is valid
app.use('/api/consumers', require('./routes/consumers'));
app.use('/api/readings', require('./routes/readings'));
app.use('/api/bills', require('./routes/bills'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/custom', require('./routes/custom'));
app.use('/api/print', require('./routes/print'));
app.use('/api/reports', require('./routes/reports'));

// Serve the main app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Water Billing System running at http://localhost:${PORT}`);
});
