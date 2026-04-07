(function () {
  const STORAGE_KEY = 'waterBillingPwaDb_v1';

  const defaultSettings = {
    org_name: 'KONDAPALLI NOTIFIED GRAMPANCHAYATH INDUSTRIAL AREA SERVICE SOCIETY',
    org_short: 'KNGIAS Society',
    reg_no: '128/1998',
    address: 'A.P.I.I.C. ADMINISTRATIVE BUILDING, I.D.A., KONDAPALLI - 521 228.',
    phone: '2871399',
    area: 'IDA, Kondapalli',
    rate_per_kl: '18',
    excess_rate_per_kl: '27',
    bank_name: 'CANARA BANK',
    bank_branch: 'Kondapalli',
    bank_account: '33443070000282',
    ifsc_code: 'NRB0013344',
    payment_note: 'Please pay before 21st of every month otherwise supply will be disconnected without any further notice',
    printer_ip: '',
    printer_port: '9100',
    printer_type: 'thermal',
    bill_title: 'DRINKING WATER SUPPLY DEMAND'
  };

  const defaultSequences = {
    bill_no: { name: 'bill_no', prefix: '', current_value: 1901, padding: 0 },
    receipt_no: { name: 'receipt_no', prefix: '', current_value: 951, padding: 0 }
  };

  function nowDate() { return new Date().toISOString().slice(0, 10); }
  function nowDateTime() { return new Date().toISOString(); }
  function toNum(v) { return Number(v || 0); }

  function loadDb() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        parsed.settings = { ...defaultSettings, ...(parsed.settings || {}) };
        parsed.sequences = { ...defaultSequences, ...(parsed.sequences || {}) };
        return parsed;
      } catch (e) {}
    }

    return {
      meta: { ids: { consumer: 0, reading: 0, bill: 0, payment: 0, customTab: 0, customField: 0, customTabData: 0 } },
      settings: { ...defaultSettings },
      sequences: { ...defaultSequences },
      license: { token: 'pwa-trial', licensed: true, machineId: `PWA-${Math.random().toString(36).slice(2, 10).toUpperCase()}` },
      consumers: [],
      readings: [],
      bills: [],
      payments: [],
      customTabs: [],
      customFields: [],
      customTabData: []
    };
  }

  let db = loadDb();

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }

  function nextId(type) {
    db.meta.ids[type] += 1;
    return db.meta.ids[type];
  }

  function nextSequence(name) {
    const seq = db.sequences[name];
    if (!seq) throw new Error(`Sequence ${name} not found`);
    seq.current_value += 1;
    const padded = seq.padding > 0 ? String(seq.current_value).padStart(seq.padding, '0') : String(seq.current_value);
    return `${seq.prefix}${padded}`;
  }

  function splitUrl(url) {
    const [path, qs] = url.split('?');
    const query = new URLSearchParams(qs || '');
    const parts = path.split('/').filter(Boolean);
    return { path, query, parts };
  }

  function withConsumerBill(b) {
    const c = db.consumers.find(x => x.id === b.consumer_id) || {};
    return { ...b, consumer_name: c.name || '', consumer_code: c.code || '', plot_no: c.plot_no || '', line_no: c.line_no || '', area: c.area || '', meter_condition: c.meter_condition || 'Working' };
  }

  async function route(url, method, body) {
    const { query, parts } = splitUrl(url);

    if (parts[0] === 'license') {
      if (parts[1] === 'status' && method === 'GET') return { licensed: !!db.license.licensed };
      if (parts[1] === 'machine-id' && method === 'GET') return { machineId: db.license.machineId };
      if (parts[1] === 'activate' && method === 'POST') {
        if (!body?.token) throw new Error('Token required');
        db.license = { ...db.license, token: body.token, licensed: true };
        persist();
        return { message: 'License activated', licensee: 'PWA User' };
      }
    }

    if (parts[0] === 'settings') {
      if (method === 'GET' && parts.length === 1) return db.settings;
      if (method === 'PUT' && parts.length === 1) {
        Object.entries(body || {}).forEach(([k, v]) => { db.settings[k] = String(v); });
        persist();
        return { message: 'Settings updated' };
      }
      if (parts[1] === 'sequences' && method === 'GET') return Object.values(db.sequences);
      if (parts[1] === 'sequences' && method === 'PUT') {
        const name = parts[2];
        db.sequences[name] = { name, prefix: body?.prefix || '', current_value: toNum(body?.current_value), padding: toNum(body?.padding) };
        persist();
        return { message: 'Sequence updated' };
      }
    }

    if (parts[0] === 'consumers') {
      if (method === 'GET' && parts.length === 1) {
        let rows = [...db.consumers];
        if (query.get('active') !== null) rows = rows.filter(c => String(c.active) === String(query.get('active')));
        const search = (query.get('search') || '').toLowerCase().trim();
        if (search) rows = rows.filter(c => [c.name, c.code, c.plot_no].some(v => (v || '').toLowerCase().includes(search)));
        return rows.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      }
      if (method === 'GET' && parts[1]) {
        const c = db.consumers.find(x => x.id === toNum(parts[1]));
        if (!c) throw new Error('Consumer not found');
        return c;
      }
      if (method === 'POST') {
        if (!body?.code || !body?.name) throw new Error('Code and name required');
        if (db.consumers.some(c => c.code === body.code)) throw new Error('UNIQUE constraint failed: consumers.code');
        const row = { id: nextId('consumer'), code: body.code, name: body.name, plot_no: body.plot_no || '', line_no: body.line_no || '', area: body.area || 'IDA, Kondapalli', sanctioned_qty: toNum(body.sanctioned_qty), meter_condition: body.meter_condition || 'Working', phone: body.phone || '', address: body.address || '', active: 1, custom_fields: JSON.stringify(body.custom_fields || {}), created_at: nowDateTime(), updated_at: nowDateTime() };
        db.consumers.push(row);
        persist();
        return { id: row.id, message: 'Consumer created' };
      }
      if (method === 'PUT' && parts[1]) {
        const id = toNum(parts[1]);
        const i = db.consumers.findIndex(c => c.id === id);
        if (i < 0) throw new Error('Consumer not found');
        db.consumers[i] = { ...db.consumers[i], ...body, sanctioned_qty: toNum(body?.sanctioned_qty), active: body?.active !== undefined ? toNum(body.active) : db.consumers[i].active, updated_at: nowDateTime() };
        persist();
        return { message: 'Consumer updated' };
      }
      if (method === 'DELETE' && parts[1]) {
        const c = db.consumers.find(x => x.id === toNum(parts[1]));
        if (c) c.active = 0;
        persist();
        return { message: 'Consumer deactivated' };
      }
    }

    if (parts[0] === 'readings') {
      if (method === 'GET') {
        let rows = [...db.readings];
        if (query.get('consumer_id')) rows = rows.filter(r => r.consumer_id === toNum(query.get('consumer_id')));
        if (query.get('bill_month')) rows = rows.filter(r => r.bill_month === query.get('bill_month'));
        if (query.get('bill_year')) rows = rows.filter(r => r.bill_year === toNum(query.get('bill_year')));
        return rows.map(r => ({ ...r, consumption: toNum(r.present_reading) - toNum(r.previous_reading), consumer_name: (db.consumers.find(c => c.id === r.consumer_id) || {}).name || '', consumer_code: (db.consumers.find(c => c.id === r.consumer_id) || {}).code || '' }));
      }
      if (parts[1] === 'bulk' && method === 'POST') {
        (body?.readings || []).forEach(r => {
          const ex = db.readings.find(x => x.consumer_id === toNum(r.consumer_id) && x.bill_month === r.bill_month && x.bill_year === toNum(r.bill_year));
          if (ex) {
            ex.previous_reading = toNum(r.previous_reading);
            ex.present_reading = toNum(r.present_reading);
            ex.reading_date = nowDateTime();
          } else {
            db.readings.push({ id: nextId('reading'), consumer_id: toNum(r.consumer_id), bill_month: r.bill_month, bill_year: toNum(r.bill_year), previous_reading: toNum(r.previous_reading), present_reading: toNum(r.present_reading), reading_date: nowDateTime() });
          }
        });
        persist();
        return { message: `${(body?.readings || []).length} readings saved` };
      }
    }

    if (parts[0] === 'bills') {
      if (method === 'GET' && parts.length === 1) {
        let rows = [...db.bills];
        if (query.get('consumer_id')) rows = rows.filter(b => b.consumer_id === toNum(query.get('consumer_id')));
        if (query.get('bill_month')) rows = rows.filter(b => b.bill_month === query.get('bill_month'));
        if (query.get('bill_year')) rows = rows.filter(b => b.bill_year === toNum(query.get('bill_year')));
        if (query.get('status')) rows = rows.filter(b => b.status === query.get('status'));
        return rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).map(withConsumerBill);
      }
      if (method === 'GET' && parts[1]) {
        const b = db.bills.find(x => x.id === toNum(parts[1]));
        if (!b) throw new Error('Bill not found');
        return withConsumerBill(b);
      }
      if (parts[1] === 'generate' && method === 'POST') {
        const consumer = db.consumers.find(c => c.id === toNum(body.consumer_id));
        if (!consumer) throw new Error('Consumer not found');
        const rate = parseFloat(db.settings.rate_per_kl || '18');
        const excessRate = parseFloat(db.settings.excess_rate_per_kl || '27');
        const consumption = toNum(body.present_reading) - toNum(body.previous_reading);
        const sanctionedQty = toNum(consumer.sanctioned_qty) * 30;
        const minQty = sanctionedQty > 0 ? sanctionedQty * 0.6 : 0;
        const billableQty = Math.max(consumption, minQty);
        const excessQty = sanctionedQty > 0 ? Math.max(0, billableQty - sanctionedQty) : 0;
        const normalQty = billableQty - excessQty;
        const consumptionCharges = (normalQty * rate) / 1000;
        const excessCharges = (excessQty * excessRate) / 1000;
        const arr = toNum(body.arrears);
        const other = toNum(body.other_charges);
        const total = consumptionCharges + excessCharges + arr + other;

        let reading = db.readings.find(r => r.consumer_id === consumer.id && r.bill_month === body.bill_month && r.bill_year === toNum(body.bill_year));
        if (!reading) {
          reading = { id: nextId('reading'), consumer_id: consumer.id, bill_month: body.bill_month, bill_year: toNum(body.bill_year), previous_reading: toNum(body.previous_reading), present_reading: toNum(body.present_reading), reading_date: nowDateTime() };
          db.readings.push(reading);
        } else {
          reading.previous_reading = toNum(body.previous_reading);
          reading.present_reading = toNum(body.present_reading);
        }

        const row = {
          id: nextId('bill'), bill_no: nextSequence('bill_no'), consumer_id: consumer.id, reading_id: reading.id,
          bill_month: body.bill_month, bill_year: toNum(body.bill_year), bill_date: nowDate(), previous_reading: toNum(body.previous_reading), present_reading: toNum(body.present_reading), consumption,
          sanctioned_qty: sanctionedQty, excess_qty: excessQty, rate_per_kl: rate, excess_rate_per_kl: excessRate,
          consumption_charges: consumptionCharges, excess_charges: excessCharges, other_charges: other, arrears: arr, total_amount: total,
          status: 'unpaid', custom_fields: JSON.stringify(body.custom_fields || {}), created_at: nowDateTime()
        };
        db.bills.push(row);
        persist();
        return { id: row.id, bill_no: row.bill_no, total_amount: row.total_amount, message: 'Bill generated' };
      }
      if (parts[1] === 'generate-bulk' && method === 'POST') {
        const rate = parseFloat(db.settings.rate_per_kl || '18');
        const excessRate = parseFloat(db.settings.excess_rate_per_kl || '27');
        const out = [];
        const consumers = (body?.consumer_ids?.length ? db.consumers.filter(c => body.consumer_ids.includes(c.id)) : db.consumers).filter(c => c.active === 1);
        consumers.forEach(consumer => {
          const reading = db.readings.find(r => r.consumer_id === consumer.id && r.bill_month === body.bill_month && r.bill_year === toNum(body.bill_year));
          if (!reading) return;
          if (db.bills.some(b => b.consumer_id === consumer.id && b.bill_month === body.bill_month && b.bill_year === toNum(body.bill_year))) return;
          const consumption = toNum(reading.present_reading) - toNum(reading.previous_reading);
          const sanctionedQty = toNum(consumer.sanctioned_qty) * 30;
          const minQty = sanctionedQty > 0 ? sanctionedQty * 0.6 : 0;
          const billableQty = Math.max(consumption, minQty);
          const excessQty = sanctionedQty > 0 ? Math.max(0, billableQty - sanctionedQty) : 0;
          const normalQty = billableQty - excessQty;
          const consumptionCharges = normalQty * rate;
          const excessCharges = excessQty * excessRate;
          const prevUnpaid = [...db.bills].reverse().find(b => b.consumer_id === consumer.id && b.status === 'unpaid');
          const arrears = prevUnpaid ? toNum(prevUnpaid.total_amount) : 0;
          const total = consumptionCharges + excessCharges + arrears;
          const row = { id: nextId('bill'), bill_no: nextSequence('bill_no'), consumer_id: consumer.id, reading_id: reading.id, bill_month: body.bill_month, bill_year: toNum(body.bill_year), bill_date: nowDate(), previous_reading: toNum(reading.previous_reading), present_reading: toNum(reading.present_reading), consumption, sanctioned_qty: sanctionedQty, excess_qty: excessQty, rate_per_kl: rate, excess_rate_per_kl: excessRate, consumption_charges: consumptionCharges, excess_charges: excessCharges, other_charges: 0, arrears, total_amount: total, status: 'unpaid', custom_fields: '{}', created_at: nowDateTime() };
          db.bills.push(row);
          out.push({ consumer_code: consumer.code, consumer_name: consumer.name, bill_no: row.bill_no, total });
        });
        persist();
        return { generated: out.length, bills: out };
      }
    }

    if (parts[0] === 'payments') {
      if (method === 'GET' && parts.length === 1) {
        let rows = [...db.payments];
        if (query.get('consumer_id')) rows = rows.filter(p => p.consumer_id === toNum(query.get('consumer_id')));
        if (query.get('bill_id')) rows = rows.filter(p => p.bill_id === toNum(query.get('bill_id')));
        if (query.get('from_date')) rows = rows.filter(p => p.payment_date >= query.get('from_date'));
        if (query.get('to_date')) rows = rows.filter(p => p.payment_date <= query.get('to_date'));
        return rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).map(p => {
          const c = db.consumers.find(x => x.id === p.consumer_id) || {};
          const b = db.bills.find(x => x.id === p.bill_id) || {};
          return { ...p, consumer_name: c.name || '', consumer_code: c.code || '', bill_no: b.bill_no || '', bill_month: b.bill_month || '', bill_year: b.bill_year || '' };
        });
      }
      if (method === 'GET' && parts[1]) {
        const p = db.payments.find(x => x.id === toNum(parts[1]));
        if (!p) throw new Error('Payment not found');
        const c = db.consumers.find(x => x.id === p.consumer_id) || {};
        const b = db.bills.find(x => x.id === p.bill_id) || {};
        return { ...p, consumer_name: c.name || '', consumer_code: c.code || '', plot_no: c.plot_no || '', line_no: c.line_no || '', area: c.area || '', bill_no: b.bill_no || '', bill_month: b.bill_month || '', bill_year: b.bill_year || '', bill_amount: b.total_amount || 0 };
      }
      if (method === 'POST') {
        const bill = db.bills.find(x => x.id === toNum(body.bill_id));
        if (!bill) throw new Error('Bill not found');
        const row = { id: nextId('payment'), receipt_no: nextSequence('receipt_no'), bill_id: bill.id, consumer_id: bill.consumer_id, amount: toNum(body.amount), payment_mode: body.payment_mode || 'Cash', cheque_dd_no: body.cheque_dd_no || '', cheque_date: body.cheque_date || '', bank_name: body.bank_name || '', reference_no: body.reference_no || '', payment_date: body.payment_date || nowDate(), towards: body.towards || '', remarks: body.remarks || '', custom_fields: JSON.stringify(body.custom_fields || {}), created_at: nowDateTime() };
        db.payments.push(row);
        bill.status = row.amount >= toNum(bill.total_amount) ? 'paid' : 'partial';
        persist();
        return { id: row.id, receipt_no: row.receipt_no, message: 'Payment recorded' };
      }
    }

    if (parts[0] === 'reports') {
      if (parts[1] === 'dashboard') {
        const month = new Date().toISOString().slice(0, 7);
        const totalConsumers = db.consumers.filter(c => c.active === 1).length;
        const totalBills = db.bills.length;
        const unpaidBills = db.bills.filter(b => b.status === 'unpaid').length;
        const totalRevenue = db.payments.reduce((s, p) => s + toNum(p.amount), 0);
        const pendingAmount = db.bills.filter(b => b.status === 'unpaid').reduce((s, b) => s + toNum(b.total_amount), 0);
        const monthlyCollection = db.payments.filter(p => (p.payment_date || '').startsWith(month)).reduce((s, p) => s + toNum(p.amount), 0);
        return { totalConsumers, totalBills, unpaidBills, totalRevenue, pendingAmount, monthlyCollection };
      }
      if (parts[1] === 'monthly') {
        const month = query.get('bill_month');
        const year = toNum(query.get('bill_year'));
        const bills = db.bills.filter(b => b.bill_month === month && b.bill_year === year).map(b => {
          const c = db.consumers.find(x => x.id === b.consumer_id) || {};
          const paid_amount = db.payments.filter(p => p.bill_id === b.id).reduce((s, p) => s + toNum(p.amount), 0);
          return { ...b, consumer_name: c.name || '', consumer_code: c.code || '', paid_amount };
        }).sort((a, b) => (a.consumer_code || '').localeCompare(b.consumer_code || ''));
        const totals = { total_consumption: bills.reduce((s, b) => s + toNum(b.consumption), 0), total_charges: bills.reduce((s, b) => s + toNum(b.total_amount), 0), total_paid: bills.reduce((s, b) => s + toNum(b.paid_amount), 0), total_pending: bills.reduce((s, b) => s + (toNum(b.total_amount) - toNum(b.paid_amount)), 0) };
        return { bills, totals };
      }
      if (parts[1] === 'ledger') {
        const cid = toNum(parts[2]);
        return { consumer: db.consumers.find(c => c.id === cid) || null, bills: db.bills.filter(b => b.consumer_id === cid), payments: db.payments.filter(p => p.consumer_id === cid) };
      }
      if (parts[1] === 'collections') {
        const from = query.get('from_date');
        const to = query.get('to_date');
        let payments = [...db.payments];
        if (from) payments = payments.filter(p => p.payment_date >= from);
        if (to) payments = payments.filter(p => p.payment_date <= to);
        payments = payments.map(p => {
          const c = db.consumers.find(x => x.id === p.consumer_id) || {};
          const b = db.bills.find(x => x.id === p.bill_id) || {};
          return { ...p, consumer_name: c.name || '', consumer_code: c.code || '', bill_no: b.bill_no || '' };
        }).sort((a, b) => (b.payment_date || '').localeCompare(a.payment_date || ''));
        return { payments, total: payments.reduce((s, p) => s + toNum(p.amount), 0) };
      }
    }

    if (parts[0] === 'print') {
      if (parts[1] === 'bill-html') {
        const bill = db.bills.find(b => b.id === toNum(parts[2]));
        if (!bill) throw new Error('Bill not found');
        return { bill: withConsumerBill(bill), settings: db.settings };
      }
      if (parts[1] === 'receipt-html') {
        const p = db.payments.find(x => x.id === toNum(parts[2]));
        if (!p) throw new Error('Payment not found');
        const consumer = db.consumers.find(c => c.id === p.consumer_id) || {};
        const bill = db.bills.find(b => b.id === p.bill_id) || {};
        return { payment: { ...p, consumer_name: consumer.name || '', consumer_code: consumer.code || '', plot_no: consumer.plot_no || '', line_no: consumer.line_no || '', area: consumer.area || '', bill_no: bill.bill_no || '', bill_month: bill.bill_month || '', bill_year: bill.bill_year || '' }, settings: db.settings };
      }
      if (parts[1] === 'test' && method === 'POST') return { message: 'Browser mode: use system print dialog' };
    }

    if (parts[0] === 'custom') {
      if (parts[1] === 'tabs' && parts.length === 2 && method === 'GET') return db.customTabs.filter(t => t.active === 1).sort((a, b) => toNum(a.sort_order) - toNum(b.sort_order));
      if (parts[1] === 'tabs' && parts.length === 2 && method === 'POST') {
        if (db.customTabs.some(t => t.tab_name === body.tab_name)) throw new Error('Tab name already exists');
        const row = { id: nextId('customTab'), tab_name: body.tab_name, tab_label: body.tab_label, icon: body.icon || 'folder', sort_order: toNum(body.sort_order), active: 1, created_at: nowDateTime() };
        db.customTabs.push(row); persist(); return { id: row.id, message: 'Tab created' };
      }
      if (parts[1] === 'tabs' && parts.length === 3 && method === 'DELETE') {
        const t = db.customTabs.find(x => x.id === toNum(parts[2])); if (t) t.active = 0; persist(); return { message: 'Tab deleted' };
      }
      if (parts[1] === 'tabs' && parts[3] === 'data' && parts.length === 5 && method === 'GET') return db.customTabData.filter(d => d.tab_id === toNum(parts[2])).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      if (parts[1] === 'tabs' && parts[3] === 'data' && parts.length === 5 && method === 'POST') {
        const row = { id: nextId('customTabData'), tab_id: toNum(parts[2]), data: JSON.stringify(body?.data || {}), created_at: nowDateTime(), updated_at: nowDateTime() };
        db.customTabData.push(row); persist(); return { id: row.id, message: 'Data created' };
      }
      if (parts[1] === 'tabs' && parts[3] === 'data' && parts.length === 6 && method === 'PUT') {
        const d = db.customTabData.find(x => x.id === toNum(parts[5]) && x.tab_id === toNum(parts[2]));
        if (!d) throw new Error('Data not found');
        d.data = JSON.stringify(body?.data || {}); d.updated_at = nowDateTime(); persist(); return { message: 'Data updated' };
      }
      if (parts[1] === 'tabs' && parts[3] === 'data' && parts.length === 6 && method === 'DELETE') {
        db.customTabData = db.customTabData.filter(x => !(x.id === toNum(parts[5]) && x.tab_id === toNum(parts[2]))); persist(); return { message: 'Data deleted' };
      }

      if (parts[1] === 'fields' && method === 'GET') {
        let rows = db.customFields.filter(f => f.active === 1);
        if (query.get('entity')) rows = rows.filter(f => f.entity === query.get('entity'));
        return rows.sort((a, b) => toNum(a.sort_order) - toNum(b.sort_order));
      }
      if (parts[1] === 'fields' && method === 'POST') {
        if (db.customFields.some(f => f.entity === body.entity && f.field_name === body.field_name && f.active === 1)) throw new Error('Field already exists');
        const row = { id: nextId('customField'), entity: body.entity, field_name: body.field_name, field_label: body.field_label, field_type: body.field_type || 'text', options: body.options || '', required: toNum(body.required), sort_order: toNum(body.sort_order), active: 1 };
        db.customFields.push(row); persist(); return { id: row.id, message: 'Field defined' };
      }
      if (parts[1] === 'fields' && method === 'DELETE') {
        const f = db.customFields.find(x => x.id === toNum(parts[2])); if (f) f.active = 0; persist(); return { message: 'Field removed' };
      }
    }

    throw new Error(`Unsupported endpoint: ${method} /api/${url}`);
  }

  window.localApiRequest = async function (url, method = 'GET', body = null) {
    return route(url.replace(/^\//, ''), method.toUpperCase(), body);
  };
})();
