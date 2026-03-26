const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'water_billing.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeDatabase();
  }
  return db;
}

function initializeDatabase() {
  db.exec(`
    -- Organization settings
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Consumers (Industries)
    CREATE TABLE IF NOT EXISTS consumers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      plot_no TEXT,
      line_no TEXT,
      area TEXT DEFAULT 'IDA, Kondapalli',
      sanctioned_qty REAL DEFAULT 0,
      meter_condition TEXT DEFAULT 'Working',
      phone TEXT,
      address TEXT,
      active INTEGER DEFAULT 1,
      custom_fields TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- Monthly meter readings
    CREATE TABLE IF NOT EXISTS readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consumer_id INTEGER NOT NULL,
      bill_month TEXT NOT NULL,
      bill_year INTEGER NOT NULL,
      previous_reading REAL NOT NULL DEFAULT 0,
      present_reading REAL NOT NULL DEFAULT 0,
      consumption REAL GENERATED ALWAYS AS (present_reading - previous_reading) STORED,
      reading_date TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (consumer_id) REFERENCES consumers(id),
      UNIQUE(consumer_id, bill_month, bill_year)
    );

    -- Bills
    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_no TEXT UNIQUE NOT NULL,
      consumer_id INTEGER NOT NULL,
      reading_id INTEGER,
      bill_month TEXT NOT NULL,
      bill_year INTEGER NOT NULL,
      bill_date TEXT DEFAULT (date('now','localtime')),
      previous_reading REAL DEFAULT 0,
      present_reading REAL DEFAULT 0,
      consumption REAL DEFAULT 0,
      sanctioned_qty REAL DEFAULT 0,
      excess_qty REAL DEFAULT 0,
      rate_per_kl REAL DEFAULT 18,
      excess_rate_per_kl REAL DEFAULT 27,
      consumption_charges REAL DEFAULT 0,
      excess_charges REAL DEFAULT 0,
      other_charges REAL DEFAULT 0,
      arrears REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'unpaid',
      custom_fields TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (consumer_id) REFERENCES consumers(id),
      FOREIGN KEY (reading_id) REFERENCES readings(id)
    );

    -- Payments
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_no TEXT UNIQUE NOT NULL,
      bill_id INTEGER NOT NULL,
      consumer_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_mode TEXT DEFAULT 'Cash',
      cheque_dd_no TEXT,
      cheque_date TEXT,
      bank_name TEXT,
      reference_no TEXT,
      payment_date TEXT DEFAULT (date('now','localtime')),
      towards TEXT,
      remarks TEXT,
      custom_fields TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (bill_id) REFERENCES bills(id),
      FOREIGN KEY (consumer_id) REFERENCES consumers(id)
    );

    -- Custom tabs/categories defined by user
    CREATE TABLE IF NOT EXISTS custom_tabs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tab_name TEXT NOT NULL UNIQUE,
      tab_label TEXT NOT NULL,
      icon TEXT DEFAULT 'folder',
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- Custom fields definitions
    CREATE TABLE IF NOT EXISTS custom_field_defs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT NOT NULL,
      field_name TEXT NOT NULL,
      field_label TEXT NOT NULL,
      field_type TEXT DEFAULT 'text',
      options TEXT,
      required INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      UNIQUE(entity, field_name)
    );

    -- Custom tab data (generic key-value store for custom tabs)
    CREATE TABLE IF NOT EXISTS custom_tab_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tab_id INTEGER NOT NULL,
      data TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (tab_id) REFERENCES custom_tabs(id)
    );

    -- Serial number sequences
    CREATE TABLE IF NOT EXISTS sequences (
      name TEXT PRIMARY KEY,
      prefix TEXT DEFAULT '',
      current_value INTEGER DEFAULT 0,
      padding INTEGER DEFAULT 4
    );

    -- Insert default settings if not exist
    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('org_name', 'KONDAPALLI NOTIFIED GRAMPANCHAYATH INDUSTRIAL AREA SERVICE SOCIETY'),
      ('org_short', 'KNGIAS Society'),
      ('reg_no', '128/1998'),
      ('address', 'A.P.I.I.C. ADMINISTRATIVE BUILDING, I.D.A., KONDAPALLI - 521 228.'),
      ('phone', '2871399'),
      ('area', 'IDA, Kondapalli'),
      ('rate_per_kl', '18'),
      ('excess_rate_per_kl', '27'),
      ('bank_name', 'CANARA BANK'),
      ('bank_branch', 'Kondapalli'),
      ('bank_account', '33443070000282'),
      ('ifsc_code', 'NRB0013344'),
      ('payment_note', 'Please pay before 21st of every month otherwise supply will be disconnected without any further notice'),
      ('printer_ip', ''),
      ('printer_port', '9100'),
      ('printer_type', 'thermal'),
      ('bill_title', 'DRINKING WATER SUPPLY DEMAND');

    -- Insert default sequences
    INSERT OR IGNORE INTO sequences (name, prefix, current_value, padding) VALUES
      ('bill_no', '', 1901, 0),
      ('receipt_no', '', 951, 0);
  `);
}

function getNextSequence(name) {
  const d = getDb();
  const seq = d.prepare('SELECT * FROM sequences WHERE name = ?').get(name);
  if (!seq) throw new Error(`Sequence ${name} not found`);
  const next = seq.current_value + 1;
  d.prepare('UPDATE sequences SET current_value = ? WHERE name = ?').run(next, name);
  const padded = seq.padding > 0 ? String(next).padStart(seq.padding, '0') : String(next);
  return seq.prefix + padded;
}

function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function getAllSettings() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);
  return settings;
}

function setSetting(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
}

module.exports = { getDb, getNextSequence, getSetting, getAllSettings, setSetting };
