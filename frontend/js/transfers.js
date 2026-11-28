const apiStatus = document.querySelector('#api-status');
const toast = document.querySelector('#toast');
const loginPanel = document.querySelector('#login-panel');
const loginForm = document.querySelector('#login-form');
const loginUsername = document.querySelector('#login-username');
const loginPassword = document.querySelector('#login-password');
const loginFeedback = document.querySelector('#login-feedback');
const appSection = document.querySelector('#app');
const userBar = document.querySelector('#user-bar');
const userInfo = document.querySelector('#user-info');
const logoutButton = document.querySelector('#logout-button');
const mainNav = document.querySelector('#main-nav');
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

let authToken = localStorage.getItem('authToken');
let currentUser = null;
let warehouses = [];
let items = [];
let toastTimer = null;

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

  if (response.status === 401 && authToken) {
    clearLogin();
    showLogin('Your session ended. Log in again.');
  }

  if (!response.ok) {
    const text = body?.error?.message || `Request failed (${response.status})`;
    throw new Error(text);
  }

  return body;
}

function showToast(text, kind) {
  toast.textContent = text;
  toast.className = `toast ${kind}`;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 5000);
}

function setFeedback(element, text, kind) {
  element.textContent = text;
  element.className = `feedback ${kind || ''}`;
}

function fillSelect(select, entries) {
  select.replaceChildren();
  entries.forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.value;
    option.textContent = entry.label;
    select.append(option);
  });
}

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

function shortDate(isoText) {
  return new Date(isoText).toLocaleString([], {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

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
    prefillFromLink();
    await showStockHint();
  } catch (error) {
    console.error(error);
    showToast(`Could not load warehouses and items: ${error.message}`, 'bad');
  }
}

function prefillFromLink() {
  const params = new URLSearchParams(window.location.search);
  const from = params.get('from');
  const item = params.get('item');
  if (from && warehouses.some((warehouse) => warehouse.warehouseId === from)) {
    fromWarehouse.value = from;
    const other = warehouses.find((warehouse) => warehouse.warehouseId !== from);
    if (other) {
      toWarehouse.value = other.warehouseId;
    }
  }
  if (item && items.some((one) => one.itemId === item)) {
    requestItem.value = item;
  }
  if (from || item) {
    requestQuantity.focus();
  }
}

function itemLabelText(item) {
  return `${item.name} (${item.sku})`;
}

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
  const word = transfers.length === 1 ? 'request' : 'requests';
  listSummary.textContent = `${transfers.length} ${word} shown, ${waiting} waiting for a decision.`;

  transfers.forEach((transfer) => {
    const row = document.createElement('li');
    row.className = 'transfer';

    const main = document.createElement('div');
    main.append(
      makeText('transfer-route', `${warehouseName(transfer.fromWarehouseId)} to ${warehouseName(transfer.toWarehouseId)}`),
      makeText('transfer-what', itemName(transfer.itemId))
    );
    if (transfer.note) {
      main.append(makeText('transfer-note', `Note: ${transfer.note}`));
    }

    const side = document.createElement('div');
    side.className = 'transfer-side';
    const badge = document.createElement('span');
    const labels = {
      PENDING: 'Waiting', APPROVED: 'Approved', REJECTED: 'Rejected',
      DISPATCHED: 'On the way', RECEIVED: 'Received'
    };
    badge.className = `status ${transfer.status.toLowerCase()}`;
    badge.textContent = labels[transfer.status];
    side.append(makeText('transfer-qty', transfer.quantity), badge);

    row.append(main, side, buildProgress(transfer), buildNextStep(transfer));
    transferList.append(row);
  });
}

function makeText(className, text) {
  const paragraph = document.createElement('p');
  paragraph.className = className;
  paragraph.textContent = text;
  return paragraph;
}

const STEPS = [
  { label: 'Requested', by: 'requestedBy', at: 'requestedAt' },
  { label: 'Approved', by: 'decidedBy', at: 'decidedAt' },
  { label: 'Dispatched', by: 'dispatchedBy', at: 'dispatchedAt' },
  { label: 'Received', by: 'receivedBy', at: 'receivedAt' }
];

function buildProgress(transfer) {
  const list = document.createElement('ol');
  list.className = 'progress';
  const rejected = transfer.status === 'REJECTED';
  let nextMarked = false;

  STEPS.forEach((step, index) => {
    const item = document.createElement('li');
    const done = Boolean(transfer[step.at]);
    let label = step.label;

    if (rejected && index === 1) {
      label = 'Rejected';
      item.className = 'step rejected';
    } else if (rejected && index > 1) {
      item.className = 'step skipped';
    } else if (done) {
      item.className = 'step done';
    } else if (!nextMarked) {
      item.className = 'step current';
      nextMarked = true;
    } else {
      item.className = 'step';
    }

    const name = document.createElement('span');
    name.className = 'step-name';
    name.textContent = label;
    const detail = document.createElement('span');
    detail.className = 'step-detail';
    detail.textContent = done ? `${transfer[step.by]}, ${shortDate(transfer[step.at])}` : '';
    item.append(name, detail);
    list.append(item);
  });
  return list;
}

function buildNextStep(transfer) {
  const line = document.createElement('p');
  line.className = 'transfer-next';

  const link = (page, text, params) => {
    const anchor = document.createElement('a');
    anchor.className = 'row-link';
    anchor.href = pageUrl(page, params);
    anchor.textContent = text;
    return anchor;
  };

  if (transfer.status === 'PENDING') {
    if (currentUser.role === 'manager') {
      line.append('Next: a manager approves or rejects it. ', link('approvals', 'Open Approvals'));
    } else {
      line.append('Next: a manager approves or rejects it on the Approvals page.');
    }
    if (transfer.requestedBy === currentUser.username) {
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'link-button danger cancel-request';
      cancel.textContent = 'Cancel request';
      cancel.addEventListener('click', () => cancelRequest(transfer, cancel));
      line.append(' ', cancel);
    }
  } else if (transfer.status === 'APPROVED') {
    line.append('Next: dispatch it from the source warehouse. ', link('tracking', 'Open Tracking'));
  } else if (transfer.status === 'DISPATCHED') {
    line.append('Next: confirm what arrived at the destination. ', link('tracking', 'Open Tracking'));
  } else if (transfer.status === 'RECEIVED') {
    const missing = transfer.missingQuantity > 0
      ? ` ${transfer.missingQuantity} missing: ${transfer.receiptNote}.`
      : '';
    line.append(`Done: ${transfer.receivedQuantity} of ${transfer.dispatchedQuantity} arrived.${missing} `,
      link('tracking', 'See movement history', { item: transfer.itemId }));
  } else if (transfer.status === 'REJECTED') {
    line.append(`Stopped: ${transfer.decisionReason || 'rejected by a manager'}.`);
  }
  return line;
}

async function cancelRequest(transfer, button) {
  button.disabled = true;
  try {
    await apiRequest(`${TRANSFERS_API}/api/transfers/${transfer.transferId}`, { method: 'DELETE' });
    showToast(`Request cancelled: ${transfer.quantity} units of ${itemName(transfer.itemId)}.`, 'good');
    await loadTransfers();
    await refreshApprovalCount();
  } catch (error) {
    console.error(error);
    showToast(`Not cancelled: ${error.message}`, 'bad');
    button.disabled = false;
  }
}

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
    const text = `Request sent: ${payload.quantity} units to ${warehouseName(payload.toWarehouseId)}. A manager will decide on the Approvals page.`;
    setFeedback(requestFeedback, text, 'good');
    showToast(text, 'good');
    await loadTransfers();
    await refreshApprovalCount();
  } catch (error) {
    console.error(error);
    setFeedback(requestFeedback, `Not sent: ${error.message}`, 'bad');
  }
});

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

function clearLogin() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('authToken');
}

function showLogin(text) {
  appSection.hidden = true;
  userBar.hidden = true;
  mainNav.hidden = true;
  loginPanel.hidden = false;
  resetLoginSteps();
  setFeedback(loginFeedback, text || '', text ? 'bad' : '');
}

async function showApp(user) {
  currentUser = user;
  loginPanel.hidden = true;
  appSection.hidden = false;
  userBar.hidden = false;
  mainNav.hidden = false;
  userInfo.textContent = roleLabel(user.role);
  setFeedback(requestFeedback, '');
  await setupNavForUser(user);
  await loadChoices();
  await loadTransfers();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const role = chosenRole();
  if (!role) {
    setFeedback(loginFeedback, 'Choose Manager or Staff first.', 'bad');
    return;
  }

  try {
    const user = await apiRequest(`${INVENTORY_API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: loginUsername.value.trim(),
        password: loginPassword.value,
        role
      })
    });
    authToken = user.token;
    localStorage.setItem('authToken', authToken);
    loginForm.reset();
    hidePasswords();
    setFeedback(loginFeedback, '');
    await showApp(user);
  } catch (error) {
    console.error(error);
    setFeedback(loginFeedback, `Could not log in: ${error.message}`, 'bad');
  }
});

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
