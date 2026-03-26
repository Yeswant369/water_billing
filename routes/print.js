const express = require('express');
const router = express.Router();
const net = require('net');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getDb, getAllSettings, getSetting } = require('../database');

// ESC/POS commands
const ESC = '\x1B';
const GS = '\x1D';
const COMMANDS = {
  INIT: ESC + '@',
  BOLD_ON: ESC + 'E' + '\x01',
  BOLD_OFF: ESC + 'E' + '\x00',
  CENTER: ESC + 'a' + '\x01',
  LEFT: ESC + 'a' + '\x00',
  RIGHT: ESC + 'a' + '\x02',
  DOUBLE_WIDTH: GS + '!' + '\x10',
  DOUBLE_HEIGHT: GS + '!' + '\x01',
  DOUBLE_BOTH: GS + '!' + '\x11',
  NORMAL_SIZE: GS + '!' + '\x00',
  UNDERLINE_ON: ESC + '-' + '\x01',
  UNDERLINE_OFF: ESC + '-' + '\x00',
  CUT: GS + 'V' + '\x00',
  PARTIAL_CUT: GS + 'V' + '\x01',
  FEED_3: ESC + 'd' + '\x03',
  FEED_5: ESC + 'd' + '\x05',
  LINE: '------------------------------------------------\n'
};

function padRight(str, len) { return (str || '').toString().substring(0, len).padEnd(len); }
function padLeft(str, len) { return (str || '').toString().substring(0, len).padStart(len); }

// Build bill for thermal printer
function buildBillEscPos(bill, settings) {
  let data = '';
  data += COMMANDS.INIT;
  data += COMMANDS.CENTER;
  data += COMMANDS.BOLD_ON;
  data += COMMANDS.DOUBLE_BOTH;
  data += (settings.org_short || 'KNGIAS') + '\n';
  data += COMMANDS.NORMAL_SIZE;
  data += (settings.org_name || '') + '\n';
  data += '(REGN. NO. ' + (settings.reg_no || '') + ')\n';
  data += (settings.area || 'I.D.A. KONDAPALLI - 521 228.') + '\n\n';

  data += COMMANDS.UNDERLINE_ON;
  data += COMMANDS.DOUBLE_BOTH;
  data += (settings.bill_title || 'DRINKING WATER SUPPLY DEMAND') + '\n';
  data += COMMANDS.NORMAL_SIZE;
  data += COMMANDS.UNDERLINE_OFF;
  data += '\n';

  data += COMMANDS.LEFT;
  data += COMMANDS.BOLD_ON;
  data += 'No: ' + bill.bill_no + padLeft('Date: ' + bill.bill_date, 30) + '\n';
  data += 'Month: ' + bill.bill_month + ' ' + bill.bill_year + '\n';
  data += COMMANDS.BOLD_OFF;
  data += COMMANDS.LINE;
  data += 'Name   : ' + (bill.consumer_name || '') + '\n';
  data += 'Plot   : ' + (bill.plot_no || '') + '  Line: ' + (bill.line_no || '') + '\n';
  data += 'Area   : ' + (bill.area || '') + '\n';
  data += 'Code   : ' + (bill.consumer_code || '') + '\n';
  data += 'Meter  : ' + (bill.meter_condition || 'Working') + '\n';
  data += COMMANDS.LINE;

  data += padRight('Present Rdg', 14) + padRight('Previous Rdg', 14) + padRight('Consumption', 12) + '\n';
  data += padRight(String(bill.present_reading), 14) + padRight(String(bill.previous_reading), 14) + padRight(String(bill.consumption) + ' Ltrs', 12) + '\n';
  data += '\n';
  data += padRight('Sanctioned', 14) + padRight('Excess', 14) + '\n';
  data += padRight(String(bill.sanctioned_qty) + ' Ltrs', 14) + padRight(String(bill.excess_qty) + ' Ltrs', 14) + '\n';
  data += COMMANDS.LINE;

  data += COMMANDS.BOLD_ON;
  data += 'CHARGES BREAKDOWN\n';
  data += COMMANDS.BOLD_OFF;
  data += padRight('Consumption @Rs.' + bill.rate_per_kl + '/KL', 34) + padLeft('Rs.' + bill.consumption_charges.toFixed(2), 14) + '\n';
  if (bill.excess_qty > 0) {
    data += padRight('Excess @Rs.' + bill.excess_rate_per_kl + '/KL', 34) + padLeft('Rs.' + bill.excess_charges.toFixed(2), 14) + '\n';
  }
  if (bill.other_charges > 0) {
    data += padRight('Other Charges', 34) + padLeft('Rs.' + bill.other_charges.toFixed(2), 14) + '\n';
  }
  if (bill.arrears > 0) {
    data += padRight('Arrears', 34) + padLeft('Rs.' + bill.arrears.toFixed(2), 14) + '\n';
  }
  data += COMMANDS.LINE;
  data += COMMANDS.BOLD_ON;
  data += COMMANDS.DOUBLE_BOTH;
  data += padRight('TOTAL', 20) + padLeft('Rs.' + bill.total_amount.toFixed(2), 14) + '\n';
  data += COMMANDS.NORMAL_SIZE;
  data += COMMANDS.BOLD_OFF;
  data += COMMANDS.LINE;

  data += '\n';
  data += COMMANDS.BOLD_ON;
  data += 'RTGS Details:\n';
  data += COMMANDS.BOLD_OFF;
  data += 'A/c : ' + (settings.bank_account || '') + '\n';
  data += 'Bank: ' + (settings.bank_name || '') + ', ' + (settings.bank_branch || '') + '\n';
  data += 'IFSC: ' + (settings.ifsc_code || '') + '\n';
  data += '\n';
  data += COMMANDS.CENTER;
  data += COMMANDS.BOLD_ON;
  data += 'SECRETARY / TREASURER\n';
  data += COMMANDS.BOLD_OFF;
  data += '\n';
  data += settings.payment_note || '';
  data += '\n';
  data += COMMANDS.FEED_5;
  data += COMMANDS.PARTIAL_CUT;
  return data;
}

// Build receipt for thermal printer
function buildReceiptEscPos(payment, settings) {
  let data = '';
  data += COMMANDS.INIT;
  data += COMMANDS.CENTER;
  data += COMMANDS.BOLD_ON;
  data += COMMANDS.DOUBLE_BOTH;
  data += 'RECEIPT\n';
  data += COMMANDS.NORMAL_SIZE;
  data += (settings.org_name || '') + '\n';
  data += '(REGN. NO. ' + (settings.reg_no || '') + ')\n';
  data += (settings.address || '') + '\n';
  data += 'Ph: ' + (settings.phone || '') + '\n\n';
  data += COMMANDS.BOLD_OFF;

  data += COMMANDS.LEFT;
  data += COMMANDS.BOLD_ON;
  data += 'No: ' + payment.receipt_no + padLeft('Date: ' + payment.payment_date, 30) + '\n';
  data += COMMANDS.BOLD_OFF;
  data += COMMANDS.LINE;

  data += 'Received with thanks from M/s.\n';
  data += COMMANDS.BOLD_ON;
  data += (payment.consumer_name || '') + '\n';
  data += COMMANDS.BOLD_OFF;
  data += '\nthe sum of Rupees:\n';
  data += COMMANDS.BOLD_ON;
  data += COMMANDS.DOUBLE_HEIGHT;
  data += 'Rs. ' + payment.amount.toFixed(2) + '\n';
  data += COMMANDS.NORMAL_SIZE;
  data += COMMANDS.BOLD_OFF;

  data += '\nby ' + (payment.payment_mode || 'Cash');
  if (payment.cheque_dd_no) data += ' No: ' + payment.cheque_dd_no;
  if (payment.cheque_date) data += ' Dated: ' + payment.cheque_date;
  if (payment.bank_name) data += ' Bank: ' + payment.bank_name;
  data += '\n';

  if (payment.towards) data += 'Towards: ' + payment.towards + '\n';
  data += 'Bill No: ' + (payment.bill_no || '') + ' (' + (payment.bill_month || '') + ' ' + (payment.bill_year || '') + ')\n';

  data += COMMANDS.LINE;
  data += COMMANDS.CENTER;
  data += '\nFor ' + (settings.org_name || '') + '\n\n';
  data += COMMANDS.BOLD_ON;
  data += 'Secretary / Treasurer\n';
  data += COMMANDS.BOLD_OFF;
  data += COMMANDS.FEED_5;
  data += COMMANDS.PARTIAL_CUT;
  return data;
}

// Send to thermal printer via TCP
function sendToPrinter(ip, port, data) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(5000);
    client.connect(port, ip, () => {
      client.write(data, 'binary', () => {
        client.end();
        resolve({ success: true });
      });
    });
    client.on('error', (err) => {
      reject(new Error('Printer connection failed: ' + err.message));
    });
    client.on('timeout', () => {
      client.destroy();
      reject(new Error('Printer connection timed out'));
    });
  });
}

// Print bill (thermal)
router.post('/bill/:billId', async (req, res) => {
  const db = getDb();
  const settings = getAllSettings();
  const bill = db.prepare(`
    SELECT b.*, c.name as consumer_name, c.code as consumer_code, c.plot_no, c.line_no, c.area, c.meter_condition
    FROM bills b JOIN consumers c ON b.consumer_id = c.id WHERE b.id = ?
  `).get(req.params.billId);

  if (!bill) return res.status(404).json({ error: 'Bill not found' });

  const printerIp = req.body.printer_ip || settings.printer_ip;
  const printerPort = parseInt(req.body.printer_port || settings.printer_port || '9100');

  if (!printerIp) {
    return res.status(400).json({ error: 'Printer IP not configured' });
  }

  try {
    const escData = buildBillEscPos(bill, settings);
    await sendToPrinter(printerIp, printerPort, escData);
    res.json({ message: 'Bill printed successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Print receipt (thermal)
router.post('/receipt/:paymentId', async (req, res) => {
  const db = getDb();
  const settings = getAllSettings();
  const payment = db.prepare(`
    SELECT p.*, c.name as consumer_name, c.code as consumer_code,
           b.bill_no, b.bill_month, b.bill_year
    FROM payments p
    JOIN consumers c ON p.consumer_id = c.id
    JOIN bills b ON p.bill_id = b.id
    WHERE p.id = ?
  `).get(req.params.paymentId);

  if (!payment) return res.status(404).json({ error: 'Payment not found' });

  const printerIp = req.body.printer_ip || settings.printer_ip;
  const printerPort = parseInt(req.body.printer_port || settings.printer_port || '9100');

  if (!printerIp) {
    return res.status(400).json({ error: 'Printer IP not configured' });
  }

  try {
    const escData = buildReceiptEscPos(payment, settings);
    await sendToPrinter(printerIp, printerPort, escData);
    res.json({ message: 'Receipt printed successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get bill HTML for browser printing (normal printers)
router.get('/bill-html/:billId', (req, res) => {
  const db = getDb();
  const settings = getAllSettings();
  const bill = db.prepare(`
    SELECT b.*, c.name as consumer_name, c.code as consumer_code, c.plot_no, c.line_no, c.area, c.meter_condition
    FROM bills b JOIN consumers c ON b.consumer_id = c.id WHERE b.id = ?
  `).get(req.params.billId);
  if (!bill) return res.status(404).json({ error: 'Bill not found' });
  res.json({ bill, settings });
});

// Get receipt HTML for browser printing
router.get('/receipt-html/:paymentId', (req, res) => {
  const db = getDb();
  const settings = getAllSettings();
  const payment = db.prepare(`
    SELECT p.*, c.name as consumer_name, c.code as consumer_code, c.plot_no, c.line_no, c.area,
           b.bill_no, b.bill_month, b.bill_year
    FROM payments p
    JOIN consumers c ON p.consumer_id = c.id
    JOIN bills b ON p.bill_id = b.id
    WHERE p.id = ?
  `).get(req.params.paymentId);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  res.json({ payment, settings });
});

// Test thermal printer connection
router.post('/test', async (req, res) => {
  const { printer_ip, printer_port } = req.body;
  try {
    const testData = COMMANDS.INIT + COMMANDS.CENTER + COMMANDS.BOLD_ON + 'PRINTER TEST OK\n' + COMMANDS.BOLD_OFF + COMMANDS.FEED_3 + COMMANDS.PARTIAL_CUT;
    await sendToPrinter(printer_ip, parseInt(printer_port || '9100'), testData);
    res.json({ message: 'Printer connected successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== SYSTEM PRINTER DISCOVERY & PRINTING =====

// Discover OS-installed printers (macOS/Linux via lpstat, Windows via wmic)
router.get('/system-printers', (req, res) => {
  try {
    const platform = os.platform();
    let printers = [];

    if (platform === 'darwin' || platform === 'linux') {
      // Use lpstat to list printers
      const output = execSync('lpstat -p -d 2>/dev/null || true', { encoding: 'utf8', timeout: 5000 });
      const defaultMatch = output.match(/system default destination: (.+)/);
      const defaultPrinter = defaultMatch ? defaultMatch[1].trim() : '';

      const lines = output.split('\n');
      for (const line of lines) {
        const match = line.match(/^printer\s+(\S+)\s+(.*)$/);
        if (match) {
          const name = match[1];
          const rest = match[2] || '';
          const isEnabled = !rest.includes('disabled');
          const isIdle = rest.includes('idle');

          // Try to get more details
          let description = name;
          try {
            const info = execSync(`lpstat -l -p ${name} 2>/dev/null || true`, { encoding: 'utf8', timeout: 3000 });
            const descMatch = info.match(/Description:\s*(.+)/);
            if (descMatch) description = descMatch[1].trim();
          } catch (e) { /* ignore */ }

          // Try to get printer URI for location info
          let uri = '';
          let location = '';
          try {
            const lpInfo = execSync(`lpinfo -l -v 2>/dev/null | grep -A5 "${name}" || true`, { encoding: 'utf8', timeout: 3000 });
            // Alternative: parse from lpoptions
            const opts = execSync(`lpoptions -p ${name} -l 2>/dev/null || true`, { encoding: 'utf8', timeout: 3000 });
          } catch (e) { /* ignore */ }

          let status = 'unknown';
          if (rest.includes('idle')) status = 'idle';
          else if (rest.includes('printing')) status = 'printing';
          else if (rest.includes('disabled')) status = 'offline';
          else if (isEnabled) status = 'ready';

          printers.push({
            name,
            displayName: description,
            isDefault: name === defaultPrinter,
            status,
            enabled: isEnabled,
          });
        }
      }

      // If lpstat didn't give descriptions, try lpoptions for each
      for (const p of printers) {
        if (p.displayName === p.name) {
          try {
            const opts = execSync(`lpoptions -p ${p.name} 2>/dev/null || true`, { encoding: 'utf8', timeout: 3000 });
            // Parse the printer-info or printer-make-and-model
            const makeMatch = opts.match(/printer-info='([^']+)'/);
            if (makeMatch) p.displayName = makeMatch[1];
          } catch (e) { /* ignore */ }
        }
      }
    } else if (platform === 'win32') {
      // Windows: use wmic
      try {
        const output = execSync('wmic printer get Name,Default,PortName,PrinterStatus /format:csv', { encoding: 'utf8', timeout: 5000 });
        const lines = output.trim().split('\n').filter(l => l.trim());
        // Skip header
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(',');
          if (parts.length >= 4) {
            const isDefault = parts[1] && parts[1].trim().toUpperCase() === 'TRUE';
            const name = (parts[2] || '').trim();
            const port = (parts[3] || '').trim();
            const statusCode = parseInt(parts[4]) || 0;
            let status = 'ready';
            if (statusCode === 1) status = 'paused';
            else if (statusCode === 2) status = 'error';
            else if (statusCode === 3) status = 'deleting';
            else if (statusCode === 5) status = 'offline';
            if (name) {
              printers.push({ name, displayName: name, isDefault, status, enabled: statusCode !== 5 });
            }
          }
        }
      } catch (e) { /* ignore */ }
    }

    res.json(printers);
  } catch (e) {
    res.status(500).json({ error: 'Failed to discover printers: ' + e.message, printers: [] });
  }
});

// Find Chrome/Chromium path
function findChromePath() {
  const platform = os.platform();
  const candidates = platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  ] : platform === 'win32' ? [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  ] : [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch (e) {}
  }
  return null;
}

// Convert HTML to PDF using Chrome headless, then print via lp
function printHTMLViaSystem(html, printerName) {
  return new Promise((resolve, reject) => {
    const tmpDir = os.tmpdir();
    const timestamp = Date.now();
    const tmpHtml = path.join(tmpDir, `water_print_${timestamp}.html`);
    const tmpPdf = path.join(tmpDir, `water_print_${timestamp}.pdf`);
    fs.writeFileSync(tmpHtml, html, 'utf8');

    const chromePath = findChromePath();
    if (!chromePath) {
      fs.unlinkSync(tmpHtml);
      return reject(new Error('Chrome/Chromium not found. Please install Google Chrome for PDF printing.'));
    }

    // Step 1: Convert HTML to PDF using Chrome headless
    const chromeArgs = [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-software-rasterizer',
      `--print-to-pdf=${tmpPdf}`,
      '--print-to-pdf-no-header',
      `file://${tmpHtml}`
    ];

    exec(`"${chromePath}" ${chromeArgs.map(a => `"${a}"`).join(' ')}`, { timeout: 15000 }, (err, stdout, stderr) => {
      // Clean up HTML temp file
      try { fs.unlinkSync(tmpHtml); } catch (e) {}

      if (!fs.existsSync(tmpPdf)) {
        return reject(new Error('PDF generation failed: ' + (stderr || 'Chrome could not create PDF')));
      }

      // Step 2: Send PDF to printer via lp
      const platform = os.platform();
      let cmd;
      if (platform === 'darwin' || platform === 'linux') {
        cmd = printerName
          ? `lp -d "${printerName}" -o fit-to-page "${tmpPdf}"`
          : `lp -o fit-to-page "${tmpPdf}"`;
      } else if (platform === 'win32') {
        cmd = printerName
          ? `print /d:"${printerName}" "${tmpPdf}"`
          : `print "${tmpPdf}"`;
      } else {
        try { fs.unlinkSync(tmpPdf); } catch (e) {}
        return reject(new Error('Unsupported platform'));
      }

      exec(cmd, { timeout: 15000 }, (err2, stdout2, stderr2) => {
        // Clean up PDF after a delay (printer spooler needs time)
        setTimeout(() => { try { fs.unlinkSync(tmpPdf); } catch (e) {} }, 10000);
        if (err2) {
          reject(new Error(`Print failed: ${stderr2 || err2.message}`));
        } else {
          resolve({ success: true, message: stdout2.trim() || 'Sent to printer' });
        }
      });
    });
  });
}

// Print bill via system printer
router.post('/system/bill/:billId', async (req, res) => {
  const db = getDb();
  const settings = getAllSettings();
  const bill = db.prepare(`
    SELECT b.*, c.name as consumer_name, c.code as consumer_code, c.plot_no, c.line_no, c.area, c.meter_condition
    FROM bills b JOIN consumers c ON b.consumer_id = c.id WHERE b.id = ?
  `).get(req.params.billId);

  if (!bill) return res.status(404).json({ error: 'Bill not found' });

  const printerName = req.body.printer_name || getSetting('system_printer') || '';

  try {
    const html = buildBillHTML(bill, settings);
    const result = await printHTMLViaSystem(html, printerName);
    res.json({ message: 'Bill sent to ' + (printerName || 'default printer') });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Print receipt via system printer
router.post('/system/receipt/:paymentId', async (req, res) => {
  const db = getDb();
  const settings = getAllSettings();
  const payment = db.prepare(`
    SELECT p.*, c.name as consumer_name, c.code as consumer_code, c.plot_no, c.line_no, c.area,
           b.bill_no, b.bill_month, b.bill_year
    FROM payments p
    JOIN consumers c ON p.consumer_id = c.id
    JOIN bills b ON p.bill_id = b.id
    WHERE p.id = ?
  `).get(req.params.paymentId);

  if (!payment) return res.status(404).json({ error: 'Payment not found' });

  const printerName = req.body.printer_name || getSetting('system_printer') || '';

  try {
    const html = buildReceiptHTML(payment, settings);
    const result = await printHTMLViaSystem(html, printerName);
    res.json({ message: 'Receipt sent to ' + (printerName || 'default printer') });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Test system printer
router.post('/system/test', async (req, res) => {
  const { printer_name } = req.body;
  try {
    const html = `<!DOCTYPE html><html><head><style>body{font-family:sans-serif;text-align:center;padding:40px}</style></head><body>
      <h1>PRINTER TEST</h1><p>Water Billing System</p><p>Printer: ${printer_name || 'Default'}</p><p>${new Date().toLocaleString()}</p>
      <p>If you can see this, the printer is working correctly.</p></body></html>`;
    const result = await printHTMLViaSystem(html, printer_name || '');
    res.json({ message: 'Test page sent to ' + (printer_name || 'default printer') });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Bill HTML builder (for system printing)
function buildBillHTML(b, s) {
  return `<!DOCTYPE html><html><head><style>
    body{font-family:serif;max-width:700px;margin:20px auto;padding:20px;font-size:14px;line-height:1.6}
    .header{text-align:center;border:2px solid #003;padding:20px;margin-bottom:0}
    .header h1{font-size:16px;margin:0 0 4px;color:#003}
    .header h2{font-size:14px;text-decoration:underline;color:#003;margin:10px 0 0}
    table{width:100%;border-collapse:collapse;margin:10px 0}
    th,td{border:1px solid #333;padding:6px 10px;text-align:center;font-size:13px}
    th{background:#e8e8f0;font-weight:bold}
    .row{display:flex;justify-content:space-between;padding:4px 0}
    .charges div{padding:2px 0}
    .total{font-size:18px;font-weight:bold;border-top:2px solid #000;padding-top:8px;margin-top:8px}
    .rtgs{border:1px solid #333;padding:10px;margin-top:15px;display:inline-block}
    .note{font-size:11px;color:#666;margin-top:15px}
    @media print{body{margin:0;padding:10px}}
  </style></head><body>
  <div class="header">
    <h1>${s.org_name || ''}</h1>
    <div>(REGN. NO. ${s.reg_no || ''})</div>
    <div>${s.area || 'I.D.A. KONDAPALLI - 521 228.'}</div>
    <h2>${s.bill_title || 'DRINKING WATER SUPPLY DEMAND'}</h2>
  </div>
  <div style="padding:10px;border:2px solid #003;border-top:0">
    <div class="row"><span><strong>No.</strong> <span style="color:red;font-size:18px">${b.bill_no}</span></span><span><strong>Date:</strong> ${b.bill_date}</span></div>
    <div class="row"><span><strong>For the Month of</strong> ${b.bill_month} ${b.bill_year}</span></div>
    <div class="row"><span><strong>Name of the Consumer:</strong> ${b.consumer_name}</span></div>
    <div class="row">
      <span><strong>Plot No.</strong> ${b.plot_no}</span>
      <span><strong>Line No.</strong> ${b.line_no}</span>
      <span>${b.area || s.area || ''}</span>
      <span><strong>Code No.</strong> ${b.consumer_code}</span>
    </div>
    <div><strong>1. Meter Condition:</strong> ${b.meter_condition || 'Working'}</div>
    <table>
      <tr><th>Present Reading (Ltrs)</th><th>Previous Reading (Ltrs)</th><th>Consumption Quantity (Ltrs)</th><th>Sanctioned Quantity (Ltrs)</th><th>Excess Quantity (Ltrs)</th></tr>
      <tr><td>${b.present_reading}</td><td>${b.previous_reading}</td><td>${b.consumption}</td><td>${b.sanctioned_qty}</td><td>${b.excess_qty}</td></tr>
    </table>
    <div class="charges">
      <div>3. a) Consumption Charges @ Rs.<strong style="color:red">${b.rate_per_kl}/-</strong>/K.L <span style="float:right">: Rs. ${b.consumption_charges.toFixed(2)}</span></div>
      <div>&nbsp;&nbsp;&nbsp;b) Excess Consumption Charges @ Rs.<strong style="color:red">${b.excess_rate_per_kl}/-</strong>/K.L <span style="float:right">: Rs. ${b.excess_charges.toFixed(2)}</span></div>
      <div>&nbsp;&nbsp;&nbsp;c) Other Charges if any <span style="float:right">: Rs. ${(b.other_charges || 0).toFixed(2)}</span></div>
      <div>&nbsp;&nbsp;&nbsp;d) Arrears <span style="float:right">: Rs. ${(b.arrears || 0).toFixed(2)}</span></div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:start;margin-top:15px">
      <div class="rtgs">
        <strong style="text-decoration:underline">R.T.G.S. Details:</strong><br>
        Account No. : <strong>${s.bank_account || ''}</strong><br>
        Branch &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: <strong>${s.bank_name || ''}</strong><br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${s.bank_branch || ''}<br>
        IFSC Code &nbsp;: <strong>${s.ifsc_code || ''}</strong>
      </div>
      <div style="text-align:center">
        <div class="total">Total Rs. ${b.total_amount.toFixed(2)}</div>
        <br><br><strong>SECRETARY / TREASURER</strong>
      </div>
    </div>
    <div class="note">Note: ${s.payment_note || ''}</div>
  </div>
  </body></html>`;
}

// Receipt HTML builder (for system printing)
function buildReceiptHTML(p, s) {
  return `<!DOCTYPE html><html><head><style>
    body{font-family:serif;max-width:600px;margin:20px auto;padding:20px;font-size:14px;line-height:1.8}
    .header{text-align:center;border:2px solid #003;padding:15px}
    .header h1{font-size:18px;text-decoration:underline;margin:0 0 8px;color:#003}
    .header h2{font-size:14px;margin:4px 0;color:#003}
    .content{padding:15px;border:2px solid #003;border-top:0}
    .amount-box{border:2px solid #000;display:inline-block;padding:8px 20px;font-size:20px;font-weight:bold;margin:10px 0}
    @media print{body{margin:0;padding:10px}}
  </style></head><body>
  <div class="header">
    <div style="float:right">Ph: ${s.phone || ''}</div>
    <h1>RECEIPT</h1>
    <h2>${s.org_name || ''}</h2>
    <div>(REGN. NO. ${s.reg_no || ''})</div>
    <div>${s.address || ''}</div>
  </div>
  <div class="content">
    <div style="display:flex;justify-content:space-between"><span><strong>No.</strong> <span style="color:red;font-size:18px">${p.receipt_no}</span></span><span><strong>Date:</strong> ${p.payment_date}</span></div>
    <div style="margin-top:10px"><strong>RECEIVED</strong> with thanks from M/s. <strong>${p.consumer_name}</strong></div>
    <div>the sum of Rupees</div>
    <div class="amount-box">Rs. ${p.amount.toFixed(2)}</div>
    <div>by ${p.payment_mode}${p.cheque_dd_no ? ` / ${p.payment_mode} No. ${p.cheque_dd_no}` : ''}${p.cheque_date ? ` Dated ${p.cheque_date}` : ''}${p.bank_name ? ` Bank ${p.bank_name}` : ''}</div>
    ${p.towards ? `<div>towards ${p.towards}</div>` : ''}
    <div style="display:flex;justify-content:space-between;margin-top:30px">
      <div></div>
      <div style="text-align:center">
        For ${s.org_name || ''}<br><br><br>
        <strong>Secretary / Treasurer</strong>
      </div>
    </div>
  </div>
  </body></html>`;
}

module.exports = router;
