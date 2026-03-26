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

// API Routes
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
