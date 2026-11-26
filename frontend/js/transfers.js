// INVENTORY_API comes from js/config.js and TRANSFERS_API from js/transfers-config.js.

// ---------- Page elements ----------
const apiStatus = document.querySelector('#api-status');
const toast = document.querySelector('#toast');
const inventoryLink = document.querySelector('#inventory-link');
const loginPanel = document.querySelector('#login-panel');
const loginForm = document.querySelector('#login-form');
const loginUsername = document.querySelector('#login-username');
const loginPassword = document.querySelector('#login-password');
const loginFeedback = document.querySelector('#login-feedback');
const appSection = document.querySelector('#app');
const userBar = document.querySelector('#user-bar');
const userInfo = document.querySelector('#user-info');
const logoutButton = document.querySelector('#logout-button');
const listSummary = document.querySelector('#list-summary');
const filterStatus = document.querySelector('#filter-status');
const filterWarehouse = document.querySelector('#filter-warehouse');
const transferList = document.querySelector('#transfer-list');
const listEmpty = document.querySelector('#list-empty');
const requestForm = document.querySelector('#request-form');
const fromWarehouse = document.querySelector('#from-warehouse');
const toWarehouse = document.querySelector('#to-warehouse');
const requestItem = document.querySelector('#request-item');
const stockHint = document.querySelector('#stock-hint');
const requestQuantity = document.querySelector('#request-quantity');
const requestNote = document.querySelector('#request-note');
const requestFeedback = document.querySelector('#request-feedback');

// ---------- Data kept by the page ----------
// Same login as the inventory page: the token is kept in localStorage under the same name
let authToken = localStorage.getItem('authToken');
let currentUser = null;
let warehouses = [];
let items = [];
let toastTimer = null;

// ---------- Helpers ----------

// Send a request, read the JSON answer, and throw if the status is not 2xx.
// If we are logged in, the token is added to every request.
async function apiRequest(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  const response = await fetch(url, { ...options, headers });

  let body = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    body = await response.json();
  }

  // 401 while logged in means the token is not valid any more: log in again
  if (response.status === 401 && authToken) {
    clearLogin();
    showLogin('Your session ended. Log in again.');
  }

  if (!response.ok) {
    // Our APIs answer errors as { error: { code, message } }
    const text = body?.error?.message || `Request failed (${response.status})`;
    throw new Error(text);
  }

  return body;
}

// Shows a short message at the top of the screen for a few seconds ('good' or 'bad')
function showToast(text, kind) {
  toast.textContent = text;
  toast.className = `toast ${kind}`;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 5000);
}

// Shows a message under a form, green ('good') or red ('bad')
function setFeedback(element, text, kind) {
  element.textContent = text;
  element.className = `feedback ${kind || ''}`;
}

// Puts one <option> into a <select> for each entry
function fillSelect(select, entries) {
  select.replaceChildren();
  entries.forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.value;
    option.textContent = entry.label;
    select.append(option);
  });
}

// Turns ids into names for the list
function warehouseName(warehouseId) {
  const warehouse = warehouses.find((one) => one.warehouseId === warehouseId);
  return warehouse ? warehouse.name : warehouseId;
}

function itemName(itemId) {
  const item = items.find((one) => one.itemId === itemId);
  return item ? `${item.name} (${item.sku})` : itemId;
}

function formatDate(isoText) {
  return new Date(isoText).toLocaleString();
}

// On S3 the two pages are in different buckets, so the link needs the full path
if (window.location.pathname.includes('/transfers-frontend/')) {
  inventoryLink.href = '/inventory-frontend/inventory.html';
}

// ---------- Warehouses and items (from the Inventory service) ----------

// GET /api/warehouses and GET /api/items -> fill the form and the filter
async function loadChoices() {
  try {
    warehouses = await apiRequest(`${INVENTORY_API}/api/warehouses`);
    items = await apiRequest(`${INVENTORY_API}/api/items`);

    const warehouseEntries = warehouses.map((warehouse) => ({
      value: warehouse.warehouseId,
      label: `${warehouse.name} (${warehouse.location})`
    }));
    fillSelect(fromWarehouse, warehouseEntries);
    fillSelect(toWarehouse, warehouseEntries);
    if (warehouseEntries.length > 1) {
      toWarehouse.selectedIndex = 1;
    }
    fillSelect(filterWarehouse, [{ value: '', label: 'All warehouses' }, ...warehouseEntries]);
    fillSelect(requestItem, items.map((item) => ({ value: item.itemId, label: itemLabelText(item) })));
    await showStockHint();
  } catch (error) {
    console.error(error);
    showToast(`Could not load warehouses and items: ${error.message}`, 'bad');
  }
}

function itemLabelText(item) {
  return `${item.name} (${item.sku})`;
}

// Shows how many units the chosen source warehouse has of the chosen item
// (GET /api/inventory/availability on the Inventory service)
async function showStockHint() {
  stockHint.className = 'stock-hint';
  if (!fromWarehouse.value || !requestItem.value) {
    stockHint.textContent = '';
    return;
  }
  try {
    const url = `${INVENTORY_API}/api/inventory/availability` +
      `?warehouseId=${encodeURIComponent(fromWarehouse.value)}` +
      `&itemId=${encodeURIComponent(requestItem.value)}&quantity=1`;
    const result = await apiRequest(url);
    stockHint.textContent = `${warehouseName(fromWarehouse.value)} has ${result.availableQuantity} units of this item now.`;
    if (result.availableQuantity === 0) {
      stockHint.className = 'stock-hint bad';
    }
  } catch (error) {
    console.error(error);
    stockHint.textContent = '';
  }
}

fromWarehouse.addEventListener('change', showStockHint);
requestItem.addEventListener('change', showStockHint);

// ---------- Transfer requests (from the Transfers service) ----------

// GET /api/transfers?status=&warehouseId= -> show the list
async function loadTransfers() {
  try {
    const query = new URLSearchParams();
    if (filterStatus.value) {
      query.set('status', filterStatus.value);
    }
    if (filterWarehouse.value) {
      query.set('warehouseId', filterWarehouse.value);
    }
    const transfers = await apiRequest(`${TRANSFERS_API}/api/transfers?${query}`);
    renderTransfers(transfers);
  } catch (error) {
    console.error(error);
    showToast(`Could not load transfer requests: ${error.message}`, 'bad');
  }
}

filterStatus.addEventListener('change', loadTransfers);
filterWarehouse.addEventListener('change', loadTransfers);

function renderTransfers(transfers) {
  transferList.replaceChildren();
  listEmpty.hidden = transfers.length > 0;

  const waiting = transfers.filter((one) => one.status === 'PENDING').length;
  listSummary.textContent = `${transfers.length} requests shown, ${waiting} waiting for a decision.`;

  transfers.forEach((transfer) => {
    const row = document.createElement('li');
    row.className = 'transfer';

    // Left side: route, item, who and when
    const main = document.createElement('div');
    const route = document.createElement('p');
    route.className = 'transfer-route';
    route.textContent = `${warehouseName(transfer.fromWarehouseId)} to ${warehouseName(transfer.toWarehouseId)}`;
    const what = document.createElement('p');
    what.className = 'transfer-what';
    what.textContent = itemName(transfer.itemId);
    const meta = document.createElement('p');
    meta.className = 'transfer-meta';
    meta.textContent = `Requested by ${transfer.requestedBy} on ${formatDate(transfer.requestedAt)}`;
    main.append(route, what, meta);

    if (transfer.note) {
      const note = document.createElement('p');
      note.className = 'transfer-note';
      note.textContent = `Note: ${transfer.note}`;
      main.append(note);
    }
    if (transfer.status !== 'PENDING') {
      const decided = document.createElement('p');
      decided.className = 'transfer-meta';
      const verb = transfer.status === 'APPROVED' ? 'Approved' : 'Rejected';
      const reason = transfer.decisionReason ? `: ${transfer.decisionReason}` : '';
      decided.textContent = `${verb} by ${transfer.decidedBy} on ${formatDate(transfer.decidedAt)}${reason}`;
      main.append(decided);
    }

    // Right side: units and status label
    const side = document.createElement('div');
    side.className = 'transfer-side';
    const qty = document.createElement('p');
    qty.className = 'transfer-qty';
    qty.textContent = transfer.quantity;
    const badge = document.createElement('span');
    const labels = { PENDING: 'Waiting', APPROVED: 'Approved', REJECTED: 'Rejected' };
    badge.className = `status ${transfer.status.toLowerCase()}`;
    badge.textContent = labels[transfer.status];
    side.append(qty, badge);

    row.append(main, side);

    // Managers can decide requests that are waiting, except their own
    if (currentUser.role === 'manager' && transfer.status === 'PENDING' &&
        transfer.requestedBy !== currentUser.username) {
      row.append(buildDecision(transfer));
    }

    transferList.append(row);
  });
}

// Approve button, reason box and Reject button for one request
function buildDecision(transfer) {
  const box = document.createElement('div');
  box.className = 'decision';

  const approve = document.createElement('button');
  approve.type = 'button';
  approve.className = 'button-primary';
  approve.textContent = 'Approve';
  approve.addEventListener('click', () => decide(transfer, 'approve', ''));

  const reason = document.createElement('input');
  reason.type = 'text';
  reason.maxLength = 200;
  reason.placeholder = 'Reason for rejecting';
  reason.setAttribute('aria-label', 'Reason for rejecting');

  const reject = document.createElement('button');
  reject.type = 'button';
  reject.className = 'button-secondary';
  reject.textContent = 'Reject';
  reject.addEventListener('click', () => decide(transfer, 'reject', reason.value));

  box.append(approve, reason, reject);
  return box;
}

// PATCH /api/transfers/:id/decision -> approve or reject
async function decide(transfer, decision, reason) {
  try {
    const body = decision === 'reject' ? { decision, reason } : { decision };
    await apiRequest(`${TRANSFERS_API}/api/transfers/${transfer.transferId}/decision`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    await loadTransfers();
    await showStockHint();
    const done = decision === 'approve' ? 'Approved' : 'Rejected';
    showToast(`${done}: ${transfer.quantity} units from ${warehouseName(transfer.fromWarehouseId)}.`, 'good');
  } catch (error) {
    console.error(error);
    showToast(`Not ${decision === 'approve' ? 'approved' : 'rejected'}: ${error.message}`, 'bad');
  }
}

// POST /api/transfers -> send a new request
requestForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = {
    fromWarehouseId: fromWarehouse.value,
    toWarehouseId: toWarehouse.value,
    itemId: requestItem.value,
    quantity: Number(requestQuantity.value)
  };
  if (requestNote.value.trim() !== '') {
    payload.note = requestNote.value.trim();
  }

  try {
    await apiRequest(`${TRANSFERS_API}/api/transfers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    requestQuantity.value = '';
    requestNote.value = '';
    const text = `Request sent: ${payload.quantity} units to ${warehouseName(payload.toWarehouseId)}. A manager will decide.`;
    setFeedback(requestFeedback, text, 'good');
    showToast(text, 'good');
    await loadTransfers();
  } catch (error) {
    console.error(error);
    setFeedback(requestFeedback, `Not sent: ${error.message}`, 'bad');
  }
});

// ---------- Connection status ----------

// Both services must answer: Inventory for login and stock, Transfers for requests
async function checkApis() {
  try {
    await apiRequest(`${INVENTORY_API}/api/health`);
    const health = await apiRequest(`${TRANSFERS_API}/api/health`);
    apiStatus.textContent = `Connected (${health.environment})`;
    apiStatus.className = 'api-status online';
  } catch (error) {
    console.error(error);
    apiStatus.textContent = 'Not connected: start both backends';
    apiStatus.className = 'api-status offline';
  }
}

// ---------- Login and logout (Inventory service) ----------

function clearLogin() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('authToken');
}

function showLogin(text) {
  appSection.hidden = true;
  userBar.hidden = true;
  loginPanel.hidden = false;
  setFeedback(loginFeedback, text || '', text ? 'bad' : '');
}

async function showApp(user) {
  currentUser = user;
  loginPanel.hidden = true;
  appSection.hidden = false;
  userBar.hidden = false;
  userInfo.textContent = `${user.username}, ${user.role}`;
  setFeedback(requestFeedback, '');
  await loadChoices();
  await loadTransfers();
}

// POST /api/auth/login on the Inventory service -> save the token, then show the app
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const user = await apiRequest(`${INVENTORY_API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: loginUsername.value.trim(),
        password: loginPassword.value
      })
    });
    authToken = user.token;
    localStorage.setItem('authToken', authToken);
    loginForm.reset();
    setFeedback(loginFeedback, '');
    await showApp(user);
  } catch (error) {
    console.error(error);
    setFeedback(loginFeedback, `Could not log in: ${error.message}`, 'bad');
  }
});

// POST /api/auth/logout -> the token stops working everywhere
logoutButton.addEventListener('click', async () => {
  try {
    await apiRequest(`${INVENTORY_API}/api/auth/logout`, { method: 'POST' });
  } catch (error) {
    console.error(error);
  }
  clearLogin();
  showLogin();
  showToast('Logged out.', 'good');
});

// When the page opens: if a token is saved, ask Inventory who we are
async function startPage() {
  await checkApis();

  if (!authToken) {
    showLogin();
    return;
  }
  try {
    const user = await apiRequest(`${INVENTORY_API}/api/auth/me`);
    await showApp(user);
  } catch (error) {
    console.error(error);
    clearLogin();
    showLogin();
  }
}

startPage();
