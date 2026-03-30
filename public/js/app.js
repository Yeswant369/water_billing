// ===== API Helper =====
async function api(url, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ===== Toast =====
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ===== Modal =====
function openModal(title, bodyHtml, footerHtml = '') {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalFooter').innerHTML = footerHtml;
  document.getElementById('modalOverlay').classList.add('active');
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('active'); }

// ===== Navigation =====
let currentPage = 'dashboard';
let settings = {};

document.querySelectorAll('.nav-item[data-page]').forEach(el => {
  el.addEventListener('click', () => navigateTo(el.dataset.page));
});

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const nav = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (nav) nav.classList.add('active');
  document.getElementById('sidebar').classList.remove('open');
  renderPage(page);
}

async function renderPage(page) {
  settings = await api('/settings');
  const content = document.getElementById('pageContent');
  const title = document.getElementById('pageTitle');
  const actions = document.getElementById('topbarActions');
  actions.innerHTML = '';
  switch (page) {
    case 'dashboard': title.textContent = 'Dashboard'; renderDashboard(content); break;
    case 'consumers': title.textContent = 'Consumers'; renderConsumers(content, actions); break;
    case 'readings': title.textContent = 'Meter Readings'; renderReadings(content, actions); break;
    case 'bills': title.textContent = 'Generate Bills'; renderBills(content, actions); break;
    case 'payments': title.textContent = 'Payments & Receipts'; renderPayments(content, actions); break;
    case 'reports': title.textContent = 'Reports'; renderReports(content); break;
    case 'settings': title.textContent = 'Settings'; renderSettings(content); break;
    default: if (page.startsWith('custom-')) renderCustomTab(page, content);
  }
  loadCustomTabs();
}

// ===== DASHBOARD =====
async function renderDashboard(container) {
  const data = await api('/reports/dashboard');
  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Total Consumers</div><div class="stat-value text-primary">${data.totalConsumers}</div></div>
      <div class="stat-card"><div class="stat-label">Total Bills</div><div class="stat-value">${data.totalBills}</div></div>
      <div class="stat-card"><div class="stat-label">Unpaid Bills</div><div class="stat-value text-danger">${data.unpaidBills}</div></div>
      <div class="stat-card"><div class="stat-label">Pending Amount</div><div class="stat-value text-warning">Rs.${data.pendingAmount.toFixed(2)}</div></div>
      <div class="stat-card"><div class="stat-label">This Month Collection</div><div class="stat-value text-success">Rs.${data.monthlyCollection.toFixed(2)}</div></div>
      <div class="stat-card"><div class="stat-label">Total Revenue</div><div class="stat-value text-success">Rs.${data.totalRevenue.toFixed(2)}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card"><div class="card-header"><h3>Quick Actions</h3></div>
        <div class="card-body" style="display:flex;flex-wrap:wrap;gap:10px">
          <button class="btn btn-primary" onclick="navigateTo('consumers')">+ Add Consumer</button>
          <button class="btn btn-success" onclick="navigateTo('readings')">Enter Readings</button>
          <button class="btn btn-warning" onclick="navigateTo('bills')">Generate Bills</button>
          <button class="btn btn-primary" onclick="navigateTo('payments')">Record Payment</button>
        </div></div>
      <div class="card"><div class="card-header"><h3>Recent Payments</h3></div>
        <div class="card-body" id="recentPayments"><div class="loading"><div class="spinner"></div>Loading...</div></div>
      </div>
    </div>`;
  try {
    const payments = await api('/payments');
    const el = document.getElementById('recentPayments'); if (!el) return;
    if (payments.length === 0) { el.innerHTML = '<p style="color:var(--gray-400)">No payments yet</p>'; return; }
    el.innerHTML = '<table><thead><tr><th>Receipt</th><th>Consumer</th><th>Amount</th><th>Date</th></tr></thead><tbody>' +
      payments.slice(0,5).map(p => `<tr><td>${p.receipt_no}</td><td>${p.consumer_name}</td><td>Rs.${p.amount.toFixed(2)}</td><td>${p.payment_date}</td></tr>`).join('') + '</tbody></table>';
  } catch(e) {}
}

// ===== CONSUMERS =====
async function renderConsumers(container, actions) {
  actions.innerHTML = '<button class="btn btn-primary" onclick="showAddConsumer()">+ Add Consumer</button>';
  container.innerHTML = `<div class="card"><div class="card-header"><h3>All Consumers</h3>
    <div class="search-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <input type="text" class="form-control" placeholder="Search..." id="consumerSearch" oninput="loadConsumers()" style="padding-left:36px;width:250px"></div>
  </div><div class="table-container" id="consumersTable"><div class="loading"><div class="spinner"></div>Loading...</div></div></div>`;
  loadConsumers();
}

async function loadConsumers() {
  const search = document.getElementById('consumerSearch')?.value || '';
  const consumers = await api('/consumers?active=1&search=' + encodeURIComponent(search));
  const el = document.getElementById('consumersTable');
  if (consumers.length === 0) { el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gray-400)">No consumers found.</div>'; return; }
  el.innerHTML = `<table><thead><tr><th>Code</th><th>Name</th><th>Plot</th><th>Line</th><th>Area</th><th>Sanctioned (L)</th><th>Meter</th><th>Actions</th></tr></thead>
    <tbody>${consumers.map(c => `<tr><td><strong>${c.code}</strong></td><td>${c.name}</td><td>${c.plot_no}</td><td>${c.line_no}</td><td>${c.area}</td><td>${c.sanctioned_qty}</td>
    <td><span class="badge ${c.meter_condition==='Working'?'badge-success':'badge-danger'}">${c.meter_condition}</span></td>
    <td><button class="btn btn-outline btn-sm" onclick="showEditConsumer(${c.id})">Edit</button> <button class="btn btn-danger btn-sm" onclick="deleteConsumer(${c.id})">Delete</button></td></tr>`).join('')}</tbody></table>`;
}

function showAddConsumer() { openModal('Add Consumer', consumerForm(), '<button class="btn btn-primary" onclick="saveConsumer()">Save</button>'); }
async function showEditConsumer(id) { const c = await api('/consumers/'+id); openModal('Edit Consumer', consumerForm(c), `<button class="btn btn-primary" onclick="saveConsumer(${id})">Update</button>`); }

function consumerForm(c={}) {
  return `<div class="form-row"><div class="form-group"><label>Code *</label><input class="form-control" id="f_code" value="${c.code||''}"></div>
    <div class="form-group"><label>Name *</label><input class="form-control" id="f_name" value="${c.name||''}"></div></div>
    <div class="form-row"><div class="form-group"><label>Plot No.</label><input class="form-control" id="f_plot_no" value="${c.plot_no||''}"></div>
    <div class="form-group"><label>Line No.</label><input class="form-control" id="f_line_no" value="${c.line_no||''}"></div>
    <div class="form-group"><label>Area</label><input class="form-control" id="f_area" value="${c.area||'IDA, Kondapalli'}"></div></div>
    <div class="form-row"><div class="form-group"><label>Sanctioned Qty (Ltrs)</label><input type="number" class="form-control" id="f_sanctioned_qty" value="${c.sanctioned_qty||0}"></div>
    <div class="form-group"><label>Meter Condition</label><select class="form-control" id="f_meter_condition"><option ${c.meter_condition==='Working'?'selected':''}>Working</option><option ${c.meter_condition==='Not Working'?'selected':''}>Not Working</option></select></div></div>
    <div class="form-row"><div class="form-group"><label>Phone</label><input class="form-control" id="f_phone" value="${c.phone||''}"></div>
    <div class="form-group"><label>Address</label><input class="form-control" id="f_address" value="${c.address||''}"></div></div>`;
}

async function saveConsumer(id) {
  const data = { code: document.getElementById('f_code').value, name: document.getElementById('f_name').value,
    plot_no: document.getElementById('f_plot_no').value, line_no: document.getElementById('f_line_no').value,
    area: document.getElementById('f_area').value, sanctioned_qty: parseFloat(document.getElementById('f_sanctioned_qty').value)||0,
    meter_condition: document.getElementById('f_meter_condition').value, phone: document.getElementById('f_phone').value, address: document.getElementById('f_address').value };
  if (!data.code || !data.name) return toast('Code and Name required','error');
  try { if (id) await api('/consumers/'+id,'PUT',data); else await api('/consumers','POST',data); toast(id?'Updated':'Added'); closeModal(); loadConsumers(); } catch(e) { toast(e.message,'error'); }
}

async function deleteConsumer(id) { if (!confirm('Deactivate?')) return; await api('/consumers/'+id,'DELETE'); toast('Deactivated'); loadConsumers(); }

// ===== READINGS =====
async function renderReadings(container, actions) {
  const now = new Date(); const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  actions.innerHTML = '<button class="btn btn-success" onclick="saveBulkReadings()">Save All Readings</button>';
  container.innerHTML = `<div class="card"><div class="card-header"><h3>Enter Monthly Readings</h3>
    <div class="form-inline"><select class="form-control" id="readingMonth" style="width:150px">${months.map((m,i)=>`<option value="${m}" ${i===now.getMonth()?'selected':''}>${m}</option>`).join('')}</select>
    <input type="number" class="form-control" id="readingYear" value="${now.getFullYear()}" style="width:100px">
    <button class="btn btn-primary" onclick="loadReadingsTable()">Load</button></div></div>
    <div class="table-container" id="readingsTable"><div class="loading"><div class="spinner"></div>Loading...</div></div></div>`;
  loadReadingsTable();
}

async function loadReadingsTable() {
  const month = document.getElementById('readingMonth').value, year = document.getElementById('readingYear').value;
  const consumers = await api('/consumers?active=1');
  const readings = await api(`/readings?bill_month=${month}&bill_year=${year}`);
  const map = {}; readings.forEach(r => map[r.consumer_id] = r);
  document.getElementById('readingsTable').innerHTML = `<table class="quick-entry">
    <thead><tr><th>Code</th><th>Name</th><th>Previous (Ltrs)</th><th>Present (Ltrs)</th><th>Consumption</th></tr></thead>
    <tbody>${consumers.map(c => { const r = map[c.id]||{};
      return `<tr data-consumer-id="${c.id}"><td><strong>${c.code}</strong></td><td>${c.name}</td>
      <td><input type="number" class="prev-reading" value="${r.previous_reading||0}" onchange="calcConsumption(this)"></td>
      <td><input type="number" class="curr-reading" value="${r.present_reading||0}" onchange="calcConsumption(this)"></td>
      <td class="consumption-display">${r.consumption||0}</td></tr>`; }).join('')}</tbody></table>`;
}

function calcConsumption(el) { const row = el.closest('tr'); const p = parseFloat(row.querySelector('.prev-reading').value)||0; const c = parseFloat(row.querySelector('.curr-reading').value)||0; row.querySelector('.consumption-display').textContent = Math.max(0,c-p); }

async function saveBulkReadings() {
  const month = document.getElementById('readingMonth').value, year = parseInt(document.getElementById('readingYear').value);
  const rows = document.querySelectorAll('#readingsTable tr[data-consumer-id]'); const list = [];
  rows.forEach(row => { const cid = parseInt(row.dataset.consumerId); const prev = parseFloat(row.querySelector('.prev-reading').value)||0; const curr = parseFloat(row.querySelector('.curr-reading').value)||0;
    if (curr>0||prev>0) list.push({consumer_id:cid,bill_month:month,bill_year:year,previous_reading:prev,present_reading:curr}); });
  if (!list.length) return toast('No readings','error');
  try { await api('/readings/bulk','POST',{readings:list}); toast(`${list.length} readings saved`); } catch(e) { toast(e.message,'error'); }
}

// ===== BILLS =====
async function renderBills(container, actions) {
  const now = new Date(); const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  container.innerHTML = `
    <div class="card" style="margin-bottom:20px"><div class="card-header"><h3>Generate New Bill</h3></div><div class="card-body">
      <div class="form-row">
        <div class="form-group"><label>Consumer</label><select class="form-control" id="billConsumer"><option value="">-- Select --</option></select></div>
        <div class="form-group"><label>Month</label><select class="form-control" id="billMonth">${months.map((m,i)=>`<option value="${m}" ${i===now.getMonth()?'selected':''}>${m}</option>`).join('')}</select></div>
        <div class="form-group"><label>Year</label><input type="number" class="form-control" id="billYear" value="${now.getFullYear()}"></div></div>
      <div class="form-row">
        <div class="form-group"><label>Previous Reading (Ltrs)</label><input type="number" class="form-control" id="billPrevReading" value="0"></div>
        <div class="form-group"><label>Present Reading (Ltrs)</label><input type="number" class="form-control" id="billCurrReading" value="0"></div>
        <div class="form-group"><label>Arrears (Rs.)</label><input type="number" class="form-control" id="billArrears" value="0"></div>
        <div class="form-group"><label>Other Charges (Rs.)</label><input type="number" class="form-control" id="billOtherCharges" value="0"></div></div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn btn-primary" onclick="generateSingleBill()">Generate Bill</button>
        <button class="btn btn-success" onclick="generateBulkBills()">Bulk Generate (All with Readings)</button></div>
    </div></div>
    <div class="card"><div class="card-header"><h3>Generated Bills</h3>
      <div class="form-inline">
        <select class="form-control" id="filterBillMonth" style="width:130px"><option value="">All Months</option>${months.map((m,i)=>`<option value="${m}" ${i===now.getMonth()?'selected':''}>${m}</option>`).join('')}</select>
        <input type="number" class="form-control" id="filterBillYear" value="${now.getFullYear()}" style="width:90px">
        <select class="form-control" id="filterBillStatus" style="width:120px"><option value="">All Status</option><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="partial">Partial</option></select>
        <button class="btn btn-outline" onclick="loadBillsList()">Filter</button></div></div>
    <div class="table-container" id="billsTable"><div class="loading"><div class="spinner"></div>Loading...</div></div></div>`;
  const consumers = await api('/consumers?active=1');
  const sel = document.getElementById('billConsumer');
  consumers.forEach(c => { const o = document.createElement('option'); o.value=c.id; o.textContent=`${c.code} - ${c.name}`; sel.appendChild(o); });
  sel.addEventListener('change', async () => { if (!sel.value) return;
    const readings = await api(`/readings?consumer_id=${sel.value}&bill_month=${document.getElementById('billMonth').value}&bill_year=${document.getElementById('billYear').value}`);
    if (readings.length) { document.getElementById('billPrevReading').value=readings[0].previous_reading; document.getElementById('billCurrReading').value=readings[0].present_reading; } });
  loadBillsList();
}

async function generateSingleBill() {
  const cid = document.getElementById('billConsumer').value; if (!cid) return toast('Select consumer','error');
  try { const r = await api('/bills/generate','POST',{ consumer_id:parseInt(cid), bill_month:document.getElementById('billMonth').value, bill_year:parseInt(document.getElementById('billYear').value),
    previous_reading:parseFloat(document.getElementById('billPrevReading').value)||0, present_reading:parseFloat(document.getElementById('billCurrReading').value)||0,
    arrears:parseFloat(document.getElementById('billArrears').value)||0, other_charges:parseFloat(document.getElementById('billOtherCharges').value)||0 });
    toast(`Bill #${r.bill_no} - Rs.${r.total_amount.toFixed(2)}`); loadBillsList(); } catch(e) { toast(e.message,'error'); }
}

async function generateBulkBills() {
  if (!confirm('Generate bills for all consumers with readings?')) return;
  try { const r = await api('/bills/generate-bulk','POST',{bill_month:document.getElementById('billMonth').value,bill_year:parseInt(document.getElementById('billYear').value)});
    toast(`${r.generated} bills generated`); loadBillsList(); } catch(e) { toast(e.message,'error'); }
}

async function loadBillsList() {
  let url='/bills?'; const m=document.getElementById('filterBillMonth')?.value; const y=document.getElementById('filterBillYear')?.value; const s=document.getElementById('filterBillStatus')?.value;
  if(m)url+=`bill_month=${m}&`; if(y)url+=`bill_year=${y}&`; if(s)url+=`status=${s}&`;
  const bills = await api(url); const el = document.getElementById('billsTable');
  if (!bills.length) { el.innerHTML='<div style="padding:30px;text-align:center;color:var(--gray-400)">No bills found</div>'; return; }
  el.innerHTML = `<table><thead><tr><th>Bill No</th><th>Consumer</th><th>Month</th><th>Consumption</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${bills.map(b=>`<tr><td><strong>${b.bill_no}</strong></td><td>${b.consumer_code} - ${b.consumer_name}</td><td>${b.bill_month} ${b.bill_year}</td><td>${b.consumption} Ltrs</td>
    <td><strong>Rs.${b.total_amount.toFixed(2)}</strong></td><td><span class="badge ${b.status==='paid'?'badge-success':b.status==='partial'?'badge-warning':'badge-danger'}">${b.status}</span></td>
    <td><button class="btn btn-outline btn-sm" onclick="viewBill(${b.id})">View</button>
    <button class="btn btn-primary btn-sm" onclick="printBill(${b.id})">Print</button>
    ${b.status!=='paid'?`<button class="btn btn-success btn-sm" onclick="showPayBill(${b.id})">Pay</button>`:''}</td></tr>`).join('')}</tbody></table>`;
}

async function viewBill(id) {
  const b = await api('/bills/'+id);
  openModal(`Bill #${b.bill_no}`, `
    <div style="font-family:monospace;font-size:13px;line-height:1.8">
      <div style="text-align:center;margin-bottom:16px"><strong style="font-size:16px">${settings.org_name||''}</strong><br>(REGN. NO. ${settings.reg_no||''})<br>${settings.area||''}<br>
        <strong style="text-decoration:underline;font-size:15px">${settings.bill_title||'DRINKING WATER SUPPLY DEMAND'}</strong></div>
      <div style="display:flex;justify-content:space-between"><span><strong>No:</strong> ${b.bill_no}</span><span><strong>Date:</strong> ${b.bill_date}</span></div>
      <div><strong>Month:</strong> ${b.bill_month} ${b.bill_year}</div><hr>
      <div><strong>Name:</strong> ${b.consumer_name}</div>
      <div style="display:flex;gap:20px"><span><strong>Plot:</strong> ${b.plot_no}</span><span><strong>Line:</strong> ${b.line_no}</span><span><strong>Code:</strong> ${b.consumer_code}</span></div><hr>
      <table style="width:100%;border-collapse:collapse;margin:8px 0"><tr style="background:#f0f0f0"><th style="border:1px solid #ccc;padding:6px">Present</th><th style="border:1px solid #ccc;padding:6px">Previous</th><th style="border:1px solid #ccc;padding:6px">Consumption</th><th style="border:1px solid #ccc;padding:6px">Sanctioned</th><th style="border:1px solid #ccc;padding:6px">Excess</th></tr>
      <tr><td style="border:1px solid #ccc;padding:6px;text-align:center">${b.present_reading}</td><td style="border:1px solid #ccc;padding:6px;text-align:center">${b.previous_reading}</td><td style="border:1px solid #ccc;padding:6px;text-align:center">${b.consumption}</td><td style="border:1px solid #ccc;padding:6px;text-align:center">${b.sanctioned_qty}</td><td style="border:1px solid #ccc;padding:6px;text-align:center">${b.excess_qty}</td></tr></table>
      <div>a) Consumption @ Rs.${b.rate_per_kl}/KL <span style="float:right">Rs.${b.consumption_charges.toFixed(2)}</span></div>
      ${b.excess_qty>0?`<div>b) Excess @ Rs.${b.excess_rate_per_kl}/KL <span style="float:right">Rs.${b.excess_charges.toFixed(2)}</span></div>`:''}
      ${b.other_charges>0?`<div>c) Other Charges <span style="float:right">Rs.${b.other_charges.toFixed(2)}</span></div>`:''}
      ${b.arrears>0?`<div>d) Arrears <span style="float:right">Rs.${b.arrears.toFixed(2)}</span></div>`:''}
      <hr><div style="font-size:16px"><strong>Total: <span style="float:right">Rs.${b.total_amount.toFixed(2)}</span></strong></div><hr>
      <div style="margin-top:10px"><strong>RTGS:</strong> A/c: ${settings.bank_account||''} | ${settings.bank_name||''}, ${settings.bank_branch||''} | IFSC: ${settings.ifsc_code||''}</div>
      <div style="text-align:right;margin-top:16px"><strong>SECRETARY / TREASURER</strong></div>
    </div>`, `<button class="btn btn-primary" onclick="printBill(${b.id});closeModal()">Print</button>
    ${b.status!=='paid'?`<button class="btn btn-success" onclick="closeModal();showPayBill(${b.id})">Pay</button>`:''}`);
}

// ===== PAYMENTS =====
async function renderPayments(container) {
  container.innerHTML = `<div class="card"><div class="card-header"><h3>Payment History</h3>
    <div class="form-inline"><input type="date" class="form-control" id="payFromDate" style="width:150px"><input type="date" class="form-control" id="payToDate" style="width:150px">
    <button class="btn btn-outline" onclick="loadPaymentsList()">Filter</button></div></div>
    <div class="table-container" id="paymentsTable"><div class="loading"><div class="spinner"></div>Loading...</div></div></div>`;
  loadPaymentsList();
}

async function loadPaymentsList() {
  let url='/payments?'; const f=document.getElementById('payFromDate')?.value; const t=document.getElementById('payToDate')?.value;
  if(f)url+=`from_date=${f}&`; if(t)url+=`to_date=${t}&`;
  const payments = await api(url); const el = document.getElementById('paymentsTable');
  if (!payments.length) { el.innerHTML='<div style="padding:30px;text-align:center;color:var(--gray-400)">No payments found</div>'; return; }
  el.innerHTML = `<table><thead><tr><th>Receipt</th><th>Consumer</th><th>Bill</th><th>Amount</th><th>Mode</th><th>Date</th><th>Actions</th></tr></thead>
    <tbody>${payments.map(p=>`<tr><td><strong>${p.receipt_no}</strong></td><td>${p.consumer_code} - ${p.consumer_name}</td><td>${p.bill_no}</td>
    <td><strong>Rs.${p.amount.toFixed(2)}</strong></td><td>${p.payment_mode}</td><td>${p.payment_date}</td>
    <td><button class="btn btn-outline btn-sm" onclick="viewReceipt(${p.id})">View</button> <button class="btn btn-primary btn-sm" onclick="printReceipt(${p.id})">Print</button></td></tr>`).join('')}</tbody></table>`;
}

function showPayBill(billId) {
  openModal('Record Payment', `<input type="hidden" id="pay_bill_id" value="${billId}">
    <div class="form-row"><div class="form-group"><label>Amount (Rs.) *</label><input type="number" class="form-control" id="pay_amount"></div>
    <div class="form-group"><label>Payment Mode</label><select class="form-control" id="pay_mode"><option>Cash</option><option>Cheque</option><option>D.D.</option><option>RTGS</option><option>NEFT</option><option>UPI</option><option>Online</option></select></div></div>
    <div class="form-row"><div class="form-group"><label>Cheque/DD No</label><input class="form-control" id="pay_cheque_no"></div>
    <div class="form-group"><label>Dated</label><input type="date" class="form-control" id="pay_cheque_date"></div>
    <div class="form-group"><label>Bank</label><input class="form-control" id="pay_bank"></div></div>
    <div class="form-row"><div class="form-group"><label>Reference No</label><input class="form-control" id="pay_ref"></div>
    <div class="form-group"><label>Payment Date</label><input type="date" class="form-control" id="pay_date" value="${new Date().toISOString().split('T')[0]}"></div></div>
    <div class="form-group"><label>Towards</label><input class="form-control" id="pay_towards" value="Water supply charges"></div>
    <div class="form-group"><label>Remarks</label><input class="form-control" id="pay_remarks"></div>`,
    `<button class="btn btn-success" onclick="recordPayment()">Record Payment</button>`);
  api('/bills/'+billId).then(b => { document.getElementById('pay_amount').value = b.total_amount.toFixed(2); });
}

async function recordPayment() {
  const billId = document.getElementById('pay_bill_id').value;
  const amount = parseFloat(document.getElementById('pay_amount').value);
  if (!amount||amount<=0) return toast('Enter valid amount','error');
  try { const r = await api('/payments','POST',{ bill_id:parseInt(billId), amount, payment_mode:document.getElementById('pay_mode').value,
    cheque_dd_no:document.getElementById('pay_cheque_no').value, cheque_date:document.getElementById('pay_cheque_date').value,
    bank_name:document.getElementById('pay_bank').value, reference_no:document.getElementById('pay_ref').value,
    payment_date:document.getElementById('pay_date').value, towards:document.getElementById('pay_towards').value, remarks:document.getElementById('pay_remarks').value });
    toast(`Receipt #${r.receipt_no}`); closeModal();
    if (confirm('Print receipt?')) printReceipt(r.id);
    if (currentPage==='bills') loadBillsList(); else if (currentPage==='payments') loadPaymentsList();
  } catch(e) { toast(e.message,'error'); }
}

async function viewReceipt(id) {
  const p = await api('/payments/'+id);
  openModal(`Receipt #${p.receipt_no}`, `
    <div style="font-family:monospace;font-size:13px;line-height:1.8;max-width:500px;margin:auto">
      <div style="text-align:center;margin-bottom:12px"><strong style="text-decoration:underline;font-size:16px">RECEIPT</strong><br><strong>${settings.org_name||''}</strong><br>(REGN. NO. ${settings.reg_no||''})<br>${settings.address||''}<br>Ph: ${settings.phone||''}</div>
      <div style="display:flex;justify-content:space-between"><span><strong>No:</strong> ${p.receipt_no}</span><span><strong>Date:</strong> ${p.payment_date}</span></div><hr>
      <div><strong>Received with thanks from M/s.</strong></div><div style="font-size:15px"><strong>${p.consumer_name}</strong></div>
      <div style="margin-top:8px">the sum of Rupees:</div>
      <div style="font-size:20px;font-weight:bold;margin:8px 0;border:2px solid #000;display:inline-block;padding:4px 16px">Rs. ${p.amount.toFixed(2)}</div>
      <div>by ${p.payment_mode}${p.cheque_dd_no?` No: ${p.cheque_dd_no}`:''}${p.bank_name?` Bank: ${p.bank_name}`:''}</div>
      ${p.towards?`<div>towards: ${p.towards}</div>`:''}
      <div>Bill No: ${p.bill_no} (${p.bill_month} ${p.bill_year})</div><hr>
      <div style="text-align:right;margin-top:16px">For ${settings.org_name||''}<br><br><strong>Secretary / Treasurer</strong></div>
    </div>`, `<button class="btn btn-primary" onclick="printReceipt(${p.id});closeModal()">Print</button>`);
}

// ===== PRINTING =====
function printBill(billId) {
  api('/print/bill-html/'+billId).then(({bill:b,settings:s}) => {
    const html = getBillPrintHTML(b,s); openPrintWindow(html);
  });
}

function printReceipt(paymentId) {
  api('/print/receipt-html/'+paymentId).then(({payment:p,settings:s}) => {
    const html = getReceiptPrintHTML(p,s); openPrintWindow(html);
  });
}

function openPrintWindow(html) {
  const win = window.open('','_blank','width=800,height=600');
  win.document.write(html); win.document.close();
  win.onload = () => { win.print(); };
}

function getBillPrintHTML(b,s) {
  return `<!DOCTYPE html><html><head><style>
    body{font-family:serif;max-width:700px;margin:20px auto;padding:20px;font-size:14px;line-height:1.6}
    .header{text-align:center;border:2px solid #003;padding:20px;margin-bottom:0} .header h1{font-size:16px;margin:0 0 4px;color:#003} .header h2{font-size:14px;text-decoration:underline;color:#003;margin:10px 0 0}
    table{width:100%;border-collapse:collapse;margin:10px 0} th,td{border:1px solid #333;padding:6px 10px;text-align:center;font-size:13px} th{background:#e8e8f0;font-weight:bold}
    .row{display:flex;justify-content:space-between;padding:4px 0} .charges div{padding:2px 0} .total{font-size:18px;font-weight:bold;border-top:2px solid #000;padding-top:8px;margin-top:8px}
    .rtgs{border:1px solid #333;padding:10px;margin-top:15px;display:inline-block} .note{font-size:11px;color:#666;margin-top:15px}
    @media print{body{margin:0;padding:10px}}
  </style></head><body>
  <div class="header"><h1>${s.org_name||''}</h1><div>(REGN. NO. ${s.reg_no||''})</div><div>${s.area||''}</div><h2>${s.bill_title||'DRINKING WATER SUPPLY DEMAND'}</h2></div>
  <div style="padding:10px;border:2px solid #003;border-top:0">
    <div class="row"><span><strong>No.</strong> <span style="color:red;font-size:18px">${b.bill_no}</span></span><span><strong>Date:</strong> ${b.bill_date}</span></div>
    <div class="row"><span><strong>For the Month of</strong> ${b.bill_month} ${b.bill_year}</span></div>
    <div class="row"><span><strong>Name:</strong> ${b.consumer_name}</span></div>
    <div class="row"><span><strong>Plot</strong> ${b.plot_no}</span><span><strong>Line</strong> ${b.line_no}</span><span>${b.area||''}</span><span><strong>Code</strong> ${b.consumer_code}</span></div>
    <div><strong>Meter:</strong> ${b.meter_condition||'Working'}</div>
    <table><tr><th>Present (Ltrs)</th><th>Previous (Ltrs)</th><th>Consumption (Ltrs)</th><th>Sanctioned (Ltrs)</th><th>Excess (Ltrs)</th></tr>
    <tr><td>${b.present_reading}</td><td>${b.previous_reading}</td><td>${b.consumption}</td><td>${b.sanctioned_qty}</td><td>${b.excess_qty}</td></tr></table>
    <div class="charges">
      <div>a) Consumption @ Rs.<strong style="color:red">${b.rate_per_kl}/-</strong>/K.L <span style="float:right">: Rs. ${b.consumption_charges.toFixed(2)}</span></div>
      <div>b) Excess @ Rs.<strong style="color:red">${b.excess_rate_per_kl}/-</strong>/K.L <span style="float:right">: Rs. ${b.excess_charges.toFixed(2)}</span></div>
      <div>c) Other Charges <span style="float:right">: Rs. ${(b.other_charges||0).toFixed(2)}</span></div>
      <div>d) Arrears <span style="float:right">: Rs. ${(b.arrears||0).toFixed(2)}</span></div></div>
    <div style="display:flex;justify-content:space-between;align-items:start;margin-top:15px">
      <div class="rtgs"><strong style="text-decoration:underline">R.T.G.S. Details:</strong><br>Account No. : <strong>${s.bank_account||''}</strong><br>Branch : <strong>${s.bank_name||''}</strong>, ${s.bank_branch||''}<br>IFSC : <strong>${s.ifsc_code||''}</strong></div>
      <div style="text-align:center"><div class="total">Total Rs. ${b.total_amount.toFixed(2)}</div><br><br><strong>SECRETARY / TREASURER</strong></div></div>
    <div class="note">Note: ${s.payment_note||''}</div>
  </div></body></html>`;
}

function getReceiptPrintHTML(p,s) {
  return `<!DOCTYPE html><html><head><style>
    body{font-family:serif;max-width:600px;margin:20px auto;padding:20px;font-size:14px;line-height:1.8}
    .header{text-align:center;border:2px solid #003;padding:15px} .header h1{font-size:18px;text-decoration:underline;margin:0 0 8px;color:#003} .header h2{font-size:14px;margin:4px 0;color:#003}
    .content{padding:15px;border:2px solid #003;border-top:0} .amount-box{border:2px solid #000;display:inline-block;padding:8px 20px;font-size:20px;font-weight:bold;margin:10px 0}
    @media print{body{margin:0;padding:10px}}
  </style></head><body>
  <div class="header"><div style="float:right">Ph: ${s.phone||''}</div><h1>RECEIPT</h1><h2>${s.org_name||''}</h2><div>(REGN. NO. ${s.reg_no||''})</div><div>${s.address||''}</div></div>
  <div class="content">
    <div style="display:flex;justify-content:space-between"><span><strong>No.</strong> <span style="color:red;font-size:18px">${p.receipt_no}</span></span><span><strong>Date:</strong> ${p.payment_date}</span></div>
    <div style="margin-top:10px"><strong>RECEIVED</strong> with thanks from M/s. <strong>${p.consumer_name}</strong></div>
    <div>the sum of Rupees</div><div class="amount-box">Rs. ${p.amount.toFixed(2)}</div>
    <div>by ${p.payment_mode}${p.cheque_dd_no?` No. ${p.cheque_dd_no}`:''}${p.cheque_date?` Dated ${p.cheque_date}`:''}${p.bank_name?` Bank ${p.bank_name}`:''}</div>
    ${p.towards?`<div>towards ${p.towards}</div>`:''}
    <div style="display:flex;justify-content:space-between;margin-top:30px"><div></div><div style="text-align:center">For ${s.org_name||''}<br><br><br><strong>Secretary / Treasurer</strong></div></div>
  </div></body></html>`;
}

// ===== REPORTS =====
async function renderReports(container) {
  const now = new Date(); const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  container.innerHTML = `<div class="tab-bar"><button class="tab-btn active" onclick="showReportTab('monthly',this)">Monthly Report</button>
    <button class="tab-btn" onclick="showReportTab('collections',this)">Collections</button>
    <button class="tab-btn" onclick="showReportTab('ledger',this)">Consumer Ledger</button></div>
    <div id="reportContent"><div class="card"><div class="card-header"><h3>Monthly Report</h3>
    <div class="form-inline"><select class="form-control" id="rptMonth" style="width:130px">${months.map((m,i)=>`<option value="${m}" ${i===now.getMonth()?'selected':''}>${m}</option>`).join('')}</select>
    <input type="number" class="form-control" id="rptYear" value="${now.getFullYear()}" style="width:90px"><button class="btn btn-primary" onclick="loadMonthlyReport()">Generate</button></div></div><div id="reportData"></div></div></div>`;
}

function showReportTab(tab,btn) {
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  const now=new Date(); const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const rc=document.getElementById('reportContent');
  if(tab==='monthly') rc.innerHTML=`<div class="card"><div class="card-header"><h3>Monthly Report</h3><div class="form-inline"><select class="form-control" id="rptMonth" style="width:130px">${months.map((m,i)=>`<option value="${m}" ${i===now.getMonth()?'selected':''}>${m}</option>`).join('')}</select><input type="number" class="form-control" id="rptYear" value="${now.getFullYear()}" style="width:90px"><button class="btn btn-primary" onclick="loadMonthlyReport()">Generate</button></div></div><div id="reportData"></div></div>`;
  else if(tab==='collections') rc.innerHTML=`<div class="card"><div class="card-header"><h3>Collections</h3><div class="form-inline"><input type="date" class="form-control" id="colFrom" style="width:150px"><input type="date" class="form-control" id="colTo" style="width:150px"><button class="btn btn-primary" onclick="loadCollectionReport()">Generate</button></div></div><div id="reportData"></div></div>`;
  else if(tab==='ledger') { rc.innerHTML=`<div class="card"><div class="card-header"><h3>Consumer Ledger</h3><div class="form-inline"><select class="form-control" id="ledgerConsumer" style="width:250px"><option value="">-- Select --</option></select><button class="btn btn-primary" onclick="loadLedger()">View</button></div></div><div id="reportData"></div></div>`;
    api('/consumers?active=1').then(cs=>{ const sel=document.getElementById('ledgerConsumer'); cs.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=`${c.code} - ${c.name}`;sel.appendChild(o);}); }); }
}

async function loadMonthlyReport() {
  const d = await api(`/reports/monthly?bill_month=${document.getElementById('rptMonth').value}&bill_year=${document.getElementById('rptYear').value}`);
  const el=document.getElementById('reportData');
  if(!d.bills.length){el.innerHTML='<div style="padding:30px;text-align:center;color:var(--gray-400)">No bills</div>';return;}
  el.innerHTML=`<div style="padding:16px"><div class="stats-grid" style="margin-bottom:16px">
    <div class="stat-card"><div class="stat-label">Total Consumption</div><div class="stat-value">${d.totals.total_consumption} Ltrs</div></div>
    <div class="stat-card"><div class="stat-label">Total Charges</div><div class="stat-value">Rs.${d.totals.total_charges.toFixed(2)}</div></div>
    <div class="stat-card"><div class="stat-label">Collected</div><div class="stat-value text-success">Rs.${d.totals.total_paid.toFixed(2)}</div></div>
    <div class="stat-card"><div class="stat-label">Pending</div><div class="stat-value text-danger">Rs.${d.totals.total_pending.toFixed(2)}</div></div></div>
    <table><thead><tr><th>Bill</th><th>Code</th><th>Name</th><th>Consumption</th><th>Total</th><th>Paid</th><th>Status</th></tr></thead>
    <tbody>${d.bills.map(b=>`<tr><td>${b.bill_no}</td><td>${b.consumer_code}</td><td>${b.consumer_name}</td><td>${b.consumption}</td><td>Rs.${b.total_amount.toFixed(2)}</td><td>Rs.${b.paid_amount.toFixed(2)}</td><td><span class="badge ${b.status==='paid'?'badge-success':'badge-danger'}">${b.status}</span></td></tr>`).join('')}</tbody></table></div>`;
}

async function loadCollectionReport() {
  const d = await api(`/reports/collections?from_date=${document.getElementById('colFrom')?.value||''}&to_date=${document.getElementById('colTo')?.value||''}`);
  document.getElementById('reportData').innerHTML=`<div style="padding:16px"><div class="stat-card" style="display:inline-block;margin-bottom:16px"><div class="stat-label">Total</div><div class="stat-value text-success">Rs.${d.total.toFixed(2)}</div></div>
    <table><thead><tr><th>Receipt</th><th>Consumer</th><th>Bill</th><th>Amount</th><th>Mode</th><th>Date</th></tr></thead>
    <tbody>${d.payments.map(p=>`<tr><td>${p.receipt_no}</td><td>${p.consumer_code} - ${p.consumer_name}</td><td>${p.bill_no}</td><td>Rs.${p.amount.toFixed(2)}</td><td>${p.payment_mode}</td><td>${p.payment_date}</td></tr>`).join('')}</tbody></table></div>`;
}

async function loadLedger() {
  const cid=document.getElementById('ledgerConsumer').value; if(!cid)return;
  const d = await api('/reports/ledger/'+cid);
  document.getElementById('reportData').innerHTML=`<div style="padding:16px"><h4 style="margin-bottom:12px">${d.consumer.code} - ${d.consumer.name}</h4>
    <h5>Bills</h5><table><thead><tr><th>Bill</th><th>Month</th><th>Consumption</th><th>Total</th><th>Status</th></tr></thead>
    <tbody>${d.bills.map(b=>`<tr><td>${b.bill_no}</td><td>${b.bill_month} ${b.bill_year}</td><td>${b.consumption}</td><td>Rs.${b.total_amount.toFixed(2)}</td><td><span class="badge ${b.status==='paid'?'badge-success':'badge-danger'}">${b.status}</span></td></tr>`).join('')}</tbody></table>
    <h5 style="margin-top:16px">Payments</h5><table><thead><tr><th>Receipt</th><th>Amount</th><th>Mode</th><th>Date</th></tr></thead>
    <tbody>${d.payments.map(p=>`<tr><td>${p.receipt_no}</td><td>Rs.${p.amount.toFixed(2)}</td><td>${p.payment_mode}</td><td>${p.payment_date}</td></tr>`).join('')}</tbody></table></div>`;
}

// ===== SETTINGS =====
async function renderSettings(container) {
  container.innerHTML = `<div class="tab-bar">
    <button class="tab-btn active" onclick="showSettingsTab('org',this)">Organization</button>
    <button class="tab-btn" onclick="showSettingsTab('billing',this)">Billing Rates</button>
    <button class="tab-btn" onclick="showSettingsTab('bank',this)">Bank Details</button>
    <button class="tab-btn" onclick="showSettingsTab('printer',this)">Printer</button>
    <button class="tab-btn" onclick="showSettingsTab('sequences',this)">Serial Numbers</button>
    <button class="tab-btn" onclick="showSettingsTab('customtabs',this)">Custom Tabs</button>
    <button class="tab-btn" onclick="showSettingsTab('customfields',this)">Custom Fields</button>
  </div><div class="card"><div class="card-body" id="settingsContent"></div></div>`;
  showSettingsTab('org',document.querySelector('.tab-btn.active'));
}

function showSettingsTab(tab,btn) {
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  const el=document.getElementById('settingsContent');
  if(tab==='org') el.innerHTML=`<div class="form-group"><label>Organization Name</label><input class="form-control" id="s_org_name" value="${settings.org_name||''}"></div>
    <div class="form-group"><label>Short Name</label><input class="form-control" id="s_org_short" value="${settings.org_short||''}"></div>
    <div class="form-group"><label>Registration No.</label><input class="form-control" id="s_reg_no" value="${settings.reg_no||''}"></div>
    <div class="form-group"><label>Address</label><input class="form-control" id="s_address" value="${settings.address||''}"></div>
    <div class="form-group"><label>Phone</label><input class="form-control" id="s_phone" value="${settings.phone||''}"></div>
    <div class="form-group"><label>Area</label><input class="form-control" id="s_area" value="${settings.area||''}"></div>
    <div class="form-group"><label>Bill Title</label><input class="form-control" id="s_bill_title" value="${settings.bill_title||''}"></div>
    <div class="form-group"><label>Payment Note</label><input class="form-control" id="s_payment_note" value="${settings.payment_note||''}"></div>
    <button class="btn btn-primary" onclick="saveOrgSettings()">Save</button>`;
  else if(tab==='billing') el.innerHTML=`<div class="form-row"><div class="form-group"><label>Rate per KL (Rs.)</label><input type="number" class="form-control" id="s_rate" value="${settings.rate_per_kl||18}"></div>
    <div class="form-group"><label>Excess Rate per KL (Rs.)</label><input type="number" class="form-control" id="s_excess_rate" value="${settings.excess_rate_per_kl||27}"></div></div><button class="btn btn-primary" onclick="saveBillingSettings()">Save</button>`;
  else if(tab==='bank') el.innerHTML=`<div class="form-row"><div class="form-group"><label>Bank Name</label><input class="form-control" id="s_bank_name" value="${settings.bank_name||''}"></div>
    <div class="form-group"><label>Branch</label><input class="form-control" id="s_bank_branch" value="${settings.bank_branch||''}"></div></div>
    <div class="form-row"><div class="form-group"><label>Account No.</label><input class="form-control" id="s_bank_account" value="${settings.bank_account||''}"></div>
    <div class="form-group"><label>IFSC Code</label><input class="form-control" id="s_ifsc_code" value="${settings.ifsc_code||''}"></div></div><button class="btn btn-primary" onclick="saveBankSettings()">Save</button>`;
  else if(tab==='printer') el.innerHTML=`
    <div class="alert alert-info">Printing uses your system's default print dialog. Click Print on any bill/receipt and select your printer (WiFi, USB, or network). For thermal POS printers, configure the IP below.</div>
    <h4 style="margin:16px 0 8px">Thermal / POS Printer (ESC/POS)</h4>
    <div class="form-row"><div class="form-group"><label>Printer IP Address</label><input class="form-control" id="s_printer_ip" value="${settings.printer_ip||''}" placeholder="e.g. 192.168.1.100"></div>
    <div class="form-group"><label>Printer Port</label><input type="number" class="form-control" id="s_printer_port" value="${settings.printer_port||9100}"></div></div>
    <div style="display:flex;gap:10px"><button class="btn btn-primary" onclick="savePrinterSettings()">Save</button><button class="btn btn-outline" onclick="testPrinter()">Test Print</button></div>`;
  else if(tab==='sequences') loadSequencesUI(el);
  else if(tab==='customtabs') loadCustomTabsUI(el);
  else if(tab==='customfields') loadCustomFieldsUI(el);
}

async function saveOrgSettings() { try { await api('/settings','PUT',{org_name:document.getElementById('s_org_name').value,org_short:document.getElementById('s_org_short').value,reg_no:document.getElementById('s_reg_no').value,address:document.getElementById('s_address').value,phone:document.getElementById('s_phone').value,area:document.getElementById('s_area').value,bill_title:document.getElementById('s_bill_title').value,payment_note:document.getElementById('s_payment_note').value}); toast('Saved'); } catch(e){toast(e.message,'error');} }
async function saveBillingSettings() { try { await api('/settings','PUT',{rate_per_kl:document.getElementById('s_rate').value,excess_rate_per_kl:document.getElementById('s_excess_rate').value}); toast('Saved'); } catch(e){toast(e.message,'error');} }
async function saveBankSettings() { try { await api('/settings','PUT',{bank_name:document.getElementById('s_bank_name').value,bank_branch:document.getElementById('s_bank_branch').value,bank_account:document.getElementById('s_bank_account').value,ifsc_code:document.getElementById('s_ifsc_code').value}); toast('Saved'); } catch(e){toast(e.message,'error');} }
async function savePrinterSettings() { try { await api('/settings','PUT',{printer_ip:document.getElementById('s_printer_ip').value,printer_port:document.getElementById('s_printer_port').value}); toast('Saved'); } catch(e){toast(e.message,'error');} }
async function testPrinter() { const ip=document.getElementById('s_printer_ip').value; if(!ip)return toast('Enter IP','error'); try { await api('/print/test','POST',{printer_ip:ip,printer_port:document.getElementById('s_printer_port').value}); toast('Test sent'); } catch(e){toast(e.message,'error');} }

async function loadSequencesUI(el) {
  const seqs = await api('/settings/sequences');
  el.innerHTML=`<p style="margin-bottom:16px;color:var(--gray-500)">Configure serial number sequences.</p>
    ${seqs.map(s=>`<div class="card" style="margin-bottom:12px;padding:16px"><h4 style="margin-bottom:12px">${s.name==='bill_no'?'Bill Numbers':'Receipt Numbers'}</h4>
    <div class="form-row"><div class="form-group"><label>Prefix</label><input class="form-control seq-prefix" data-name="${s.name}" value="${s.prefix}"></div>
    <div class="form-group"><label>Current Number</label><input type="number" class="form-control seq-value" data-name="${s.name}" value="${s.current_value}"></div>
    <div class="form-group"><label>Zero Padding</label><input type="number" class="form-control seq-padding" data-name="${s.name}" value="${s.padding}"></div></div>
    <button class="btn btn-primary btn-sm" onclick="saveSequence('${s.name}')">Save</button></div>`).join('')}`;
}

async function saveSequence(name) { try { await api(`/settings/sequences/${name}`,'PUT',{prefix:document.querySelector(`.seq-prefix[data-name="${name}"]`).value,current_value:parseInt(document.querySelector(`.seq-value[data-name="${name}"]`).value),padding:parseInt(document.querySelector(`.seq-padding[data-name="${name}"]`).value)}); toast('Updated'); } catch(e){toast(e.message,'error');} }

// ===== CUSTOM TABS =====
async function loadCustomTabs() {
  const tabs = await api('/custom/tabs');
  const nav = document.getElementById('customTabsNav');
  if(!tabs.length){nav.innerHTML='';return;}
  nav.innerHTML='<div class="nav-divider"></div><div class="nav-section-title">Custom</div>'+tabs.map(t=>`<div class="nav-item ${currentPage==='custom-'+t.id?'active':''}" data-page="custom-${t.id}" onclick="navigateTo('custom-${t.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>${t.tab_label}</div>`).join('');
}

async function loadCustomTabsUI(el) {
  const tabs = await api('/custom/tabs');
  el.innerHTML=`<p style="margin-bottom:16px;color:var(--gray-500)">Create custom tabs for additional data.</p>
    <div class="form-inline" style="margin-bottom:16px"><input class="form-control" id="newTabName" placeholder="Tab ID"><input class="form-control" id="newTabLabel" placeholder="Tab Label"><button class="btn btn-primary" onclick="addCustomTab()">Add</button></div>
    ${tabs.length?`<table><thead><tr><th>Name</th><th>Label</th><th>Actions</th></tr></thead><tbody>${tabs.map(t=>`<tr><td>${t.tab_name}</td><td>${t.tab_label}</td><td><button class="btn btn-danger btn-sm" onclick="deleteCustomTab(${t.id})">Remove</button></td></tr>`).join('')}</tbody></table>`:''}`;
}

async function addCustomTab() { const n=document.getElementById('newTabName').value.trim(),l=document.getElementById('newTabLabel').value.trim(); if(!n||!l)return toast('Enter both','error'); try{await api('/custom/tabs','POST',{tab_name:n,tab_label:l});toast('Created');renderSettings(document.getElementById('pageContent'));loadCustomTabs();}catch(e){toast(e.message,'error');} }
async function deleteCustomTab(id) { if(!confirm('Remove?'))return; await api('/custom/tabs/'+id,'DELETE'); toast('Removed'); renderSettings(document.getElementById('pageContent')); loadCustomTabs(); }

async function loadCustomFieldsUI(el) {
  const fields = await api('/custom/fields');
  el.innerHTML=`<p style="margin-bottom:16px;color:var(--gray-500)">Define custom fields.</p>
    <div class="form-row" style="margin-bottom:16px"><div class="form-group"><label>Entity</label><select class="form-control" id="cfEntity"><option>consumer</option><option>bill</option><option>payment</option></select></div>
    <div class="form-group"><label>Field Name</label><input class="form-control" id="cfName" placeholder="e.g. gst_no"></div>
    <div class="form-group"><label>Label</label><input class="form-control" id="cfLabel" placeholder="e.g. GST Number"></div>
    <div class="form-group"><label>Type</label><select class="form-control" id="cfType"><option>text</option><option>number</option><option>date</option><option>select</option></select></div></div>
    <button class="btn btn-primary" onclick="addCustomField()" style="margin-bottom:16px">Add</button>
    ${fields.length?`<table><thead><tr><th>Entity</th><th>Name</th><th>Label</th><th>Type</th><th>Actions</th></tr></thead><tbody>${fields.map(f=>`<tr><td>${f.entity}</td><td>${f.field_name}</td><td>${f.field_label}</td><td>${f.field_type}</td><td><button class="btn btn-danger btn-sm" onclick="deleteCustomField(${f.id})">Remove</button></td></tr>`).join('')}</tbody></table>`:''}`;
}

async function addCustomField() { try{await api('/custom/fields','POST',{entity:document.getElementById('cfEntity').value,field_name:document.getElementById('cfName').value,field_label:document.getElementById('cfLabel').value,field_type:document.getElementById('cfType').value});toast('Added');loadCustomFieldsUI(document.getElementById('settingsContent'));}catch(e){toast(e.message,'error');} }
async function deleteCustomField(id) { await api('/custom/fields/'+id,'DELETE'); toast('Removed'); loadCustomFieldsUI(document.getElementById('settingsContent')); }

async function renderCustomTab(page, container) {
  const tabId=page.replace('custom-',''); const tabs=await api('/custom/tabs'); const tab=tabs.find(t=>t.id==tabId);
  if(!tab){container.innerHTML='<p>Tab not found</p>';return;}
  document.getElementById('pageTitle').textContent=tab.tab_label;
  const data=await api(`/custom/tabs/${tabId}/data`);
  container.innerHTML=`<div class="card"><div class="card-header"><h3>${tab.tab_label}</h3><button class="btn btn-primary" onclick="addTabEntry(${tabId})">+ Add Entry</button></div>
    <div class="table-container">${!data.length?'<div style="padding:30px;text-align:center;color:var(--gray-400)">No entries</div>':
    `<table><thead><tr><th>ID</th><th>Data</th><th>Created</th><th>Actions</th></tr></thead>
    <tbody>${data.map(d=>`<tr><td>${d.id}</td><td><pre style="margin:0;font-size:12px">${JSON.stringify(JSON.parse(d.data),null,2)}</pre></td><td>${d.created_at||''}</td>
    <td><button class="btn btn-outline btn-sm" onclick="editTabEntry(${tabId},${d.id},'${encodeURIComponent(d.data)}')">Edit</button> <button class="btn btn-danger btn-sm" onclick="deleteTabEntry(${tabId},${d.id})">Delete</button></td></tr>`).join('')}</tbody></table>`}</div></div>`;
}

function addTabEntry(tabId){openModal('Add Entry',`<div class="form-group"><label>Data (JSON)</label><textarea class="form-control" id="customEntryData" rows="6">{}</textarea></div>`,`<button class="btn btn-primary" onclick="saveTabEntry(${tabId})">Save</button>`);}
function editTabEntry(tabId,id,enc){const d=JSON.parse(decodeURIComponent(enc));openModal('Edit',`<div class="form-group"><label>Data (JSON)</label><textarea class="form-control" id="customEntryData" rows="6">${JSON.stringify(d,null,2)}</textarea></div>`,`<button class="btn btn-primary" onclick="saveTabEntry(${tabId},${id})">Update</button>`);}
async function saveTabEntry(tabId,id){try{const d=JSON.parse(document.getElementById('customEntryData').value);if(id)await api(`/custom/tabs/${tabId}/data/${id}`,'PUT',{data:d});else await api(`/custom/tabs/${tabId}/data`,'POST',{data:d});toast(id?'Updated':'Created');closeModal();renderCustomTab('custom-'+tabId,document.getElementById('pageContent'));}catch(e){toast('Error: '+e.message,'error');}}
async function deleteTabEntry(tabId,id){if(!confirm('Delete?'))return;await api(`/custom/tabs/${tabId}/data/${id}`,'DELETE');toast('Deleted');renderCustomTab('custom-'+tabId,document.getElementById('pageContent'));}

// ===== LICENSE CHECK =====
// On app load, check if a valid license exists.
// If not, show the activation screen and block access to the app.
// If yes, boot the app normally.
//
// Flow:
//   1. GET /api/license/status
//   2. If licensed: true  → renderPage('dashboard') — normal boot
//   3. If licensed: false → show activation screen with token input
//   4. User pastes token → POST /api/license/activate
//   5. If valid → reload app → step 1 now passes → normal boot
//   6. If invalid → show error, let them retry

async function showLicenseScreen(errorMsg) {
  // Hide sidebar and topbar — unlicensed users shouldn't see the app
  document.getElementById('sidebar').style.display = 'none';
  document.querySelector('.main-content').style.marginLeft = '0';

  const content = document.getElementById('pageContent');
  document.getElementById('pageTitle').textContent = 'License Activation';
  document.getElementById('topbarActions').innerHTML = '';

  // Fetch this machine's unique ID to display to the customer
  // They need to share this with you (admin) so you can generate
  // a token locked to their machine
  let machineId = 'Loading...';
  try {
    const res = await fetch('/api/license/machine-id');
    const data = await res.json();
    machineId = data.machineId;
  } catch (e) {
    machineId = 'Error loading';
  }

  content.innerHTML = `
    <div style="max-width:500px;margin:80px auto;text-align:center">
      <div style="margin-bottom:24px">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5" width="64" height="64">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <h2 style="margin-bottom:8px">License Required</h2>
      <p style="color:var(--gray-500);margin-bottom:24px">Enter your license token to activate the application.</p>
      ${errorMsg ? `<div style="background:#fef2f2;color:#dc2626;padding:10px 14px;border-radius:var(--radius);margin-bottom:16px;font-size:14px">${errorMsg}</div>` : ''}
      <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius);padding:14px;margin-bottom:20px;text-align:left">
        <div style="font-size:12px;color:var(--gray-500);margin-bottom:6px">Your Machine ID (share this with your administrator)</div>
        <div style="display:flex;align-items:center;gap:8px">
          <code style="flex:1;font-size:15px;font-weight:600;letter-spacing:1px;color:var(--primary);user-select:all">${machineId}</code>
          <button class="btn btn-outline btn-sm" onclick="navigator.clipboard.writeText('${machineId}');toast('Machine ID copied!')">Copy</button>
        </div>
      </div>
      <div class="form-group" style="text-align:left">
        <label>License Token</label>
        <textarea class="form-control" id="licenseTokenInput" rows="5" placeholder="Paste your license token here..." style="font-family:monospace;font-size:12px"></textarea>
      </div>
      <button class="btn btn-primary" style="width:100%;padding:12px" onclick="activateLicense()">Activate License</button>
    </div>
  `;
}

async function activateLicense() {
  const token = document.getElementById('licenseTokenInput').value.trim();
  if (!token) {
    toast('Please enter a license token', 'error');
    return;
  }

  try {
    const res = await fetch('/api/license/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const data = await res.json();

    if (!res.ok) {
      // Show error on the license screen — let them retry
      showLicenseScreen(data.error || 'Invalid license token');
      return;
    }

    // License valid — reload to boot the full app
    toast('License activated for ' + data.licensee);
    setTimeout(() => location.reload(), 1000);
  } catch (e) {
    showLicenseScreen('Activation failed: ' + e.message);
  }
}

async function checkLicense() {
  try {
    const res = await fetch('/api/license/status');
    const data = await res.json();

    if (data.licensed) {
      // Valid license — show sidebar and boot normally
      document.getElementById('sidebar').style.display = '';
      document.querySelector('.main-content').style.marginLeft = '';
      renderPage('dashboard');
    } else {
      // No license or expired — show activation screen
      showLicenseScreen(data.error || null);
    }
  } catch (e) {
    // Server error — still show activation screen
    showLicenseScreen('Could not verify license');
  }
}

// ===== INIT =====
checkLicense();
