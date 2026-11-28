// Page elements
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
const stageTabs = document.querySelectorAll('.tab[data-stage]');
const shipmentWarehouse = document.querySelector('#shipment-warehouse');
const shipmentList = document.querySelector('#shipment-list');
const shipmentEmpty = document.querySelector('#shipment-empty');
const historyItem = document.querySelector('#history-item');
const historyWarehouse = document.querySelector('#history-warehouse');
const historySummary = document.querySelector('#history-summary');
const movementList = document.querySelector('#movement-list');
const messagesSection = document.querySelector('#messages-section');
const messagesList = document.querySelector('#messages-list');
const messagesClear = document.querySelector('#messages-clear');

// Data kept by the page
let authToken = localStorage.getItem('authToken');
let currentUser = null;
let warehouses = [];
let items = [];
let transfers = [];
let stage = 'APPROVED';
let shownMessages = [];
let toastTimer = null;

// What each stage shows when it has nothing in it: what has to happen first
const EMPTY_TEXT = {
  APPROVED: 'Nothing to dispatch. A transfer appears here after a manager approves it on the Approvals page.',
  DISPATCHED: 'Nothing is on the way. Dispatch an approved transfer first, from "To dispatch".',
  RECEIVED: 'Nothing has been received yet. Transfers appear here after the destination confirms what arrived.'
};
let firstLoad = true;

// Send a request, read the JSON answer, and throw if the status is not 2xx.
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

// Shows a short message at the top of the screen for a few seconds ('good', 'bad' or 'warn')
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

// Turns ids into names
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

// Makes a <p> with a class and a text
function makeText(className, text) {
  const paragraph = document.createElement('p');
  paragraph.className = className;
  paragraph.textContent = text;
  return paragraph;
}

// GET /api/warehouses and GET /api/items -> fill the filters
async function loadChoices() {
  try {
    warehouses = await apiRequest(`${INVENTORY_API}/api/warehouses`);
    items = await apiRequest(`${INVENTORY_API}/api/items`);

    const warehouseEntries = warehouses.map((warehouse) => ({
      value: warehouse.warehouseId,
      label: `${warehouse.name} (${warehouse.location})`
    }));
    fillSelect(shipmentWarehouse, [{ value: '', label: 'All warehouses' }, ...warehouseEntries]);
    fillSelect(historyWarehouse, [{ value: '', label: 'All warehouses' }, ...warehouseEntries]);
    fillSelect(historyItem, [
      { value: '', label: 'All items' },
      ...items.map((item) => ({ value: item.itemId, label: `${item.name} (${item.sku})` }))
    ]);

    const wanted = new URLSearchParams(window.location.search).get('item');
    if (wanted && items.some((item) => item.itemId === wanted)) {
      historyItem.value = wanted;
    }
  } catch (error) {
    console.error(error);
    showToast(`Could not load warehouses and items: ${error.message}`, 'bad');
  }
}

// GET /api/transfers on the Transfers service -> keep the list, then show the chosen stage
async function loadShipments() {
  try {
    transfers = await apiRequest(`${TRANSFERS_API}/api/transfers`);
    if (firstLoad) {
      firstLoad = false;
      const firstWithWork = ['APPROVED', 'DISPATCHED', 'RECEIVED']
        .find((one) => transfers.some((transfer) => transfer.status === one));
      stage = firstWithWork || 'APPROVED';
      showStage();
    }
    renderShipments();
  } catch (error) {
    console.error(error);
    showToast(`Could not load transfers: ${error.message}`, 'bad');
  }
}

// A transfer matches the warehouse filter if it leaves from or goes to that warehouse
function matchesWarehouse(transfer) {
  const wanted = shipmentWarehouse.value;
  return !wanted || transfer.fromWarehouseId === wanted || transfer.toWarehouseId === wanted;
}

function renderShipments() {
  ['APPROVED', 'DISPATCHED', 'RECEIVED'].forEach((one) => {
    const count = transfers.filter((transfer) => transfer.status === one && matchesWarehouse(transfer)).length;
    document.querySelector(`#count-${one}`).textContent = count;
  });

  const shown = transfers.filter((transfer) => transfer.status === stage && matchesWarehouse(transfer));
  shipmentList.replaceChildren();
  shipmentEmpty.hidden = shown.length > 0;
  shipmentEmpty.replaceChildren(EMPTY_TEXT[stage]);
  if (stage === 'APPROVED' && currentUser.role === 'manager') {
    const link = document.createElement('a');
    link.className = 'row-link';
    link.href = pageUrl('approvals');
    link.textContent = 'Open Approvals';
    shipmentEmpty.append(' ', link);
  }

  shown.forEach((transfer) => {
    shipmentList.append(buildShipment(transfer));
  });
}

// One shipment: route, item, who did what, and the action for its stage
function buildShipment(transfer) {
  const row = document.createElement('li');
  row.className = 'shipment';

  const main = document.createElement('div');
  main.append(
    makeText('shipment-route', `${warehouseName(transfer.fromWarehouseId)} to ${warehouseName(transfer.toWarehouseId)}`),
    makeText('shipment-what', itemName(transfer.itemId)),
    makeText('shipment-meta', `Approved by ${transfer.decidedBy} on ${formatDate(transfer.decidedAt)}`)
  );
  if (transfer.dispatchedAt) {
    main.append(makeText('shipment-meta',
      `Dispatched by ${transfer.dispatchedBy} on ${formatDate(transfer.dispatchedAt)}`));
  }
  if (transfer.receivedAt) {
    main.append(makeText('shipment-meta',
      `Received by ${transfer.receivedBy} on ${formatDate(transfer.receivedAt)}`));
  }

  const side = document.createElement('div');
  side.className = 'shipment-side';
  const qty = makeText('shipment-qty', transfer.status === 'RECEIVED'
    ? `${transfer.receivedQuantity} of ${transfer.dispatchedQuantity}`
    : transfer.quantity);
  const badge = document.createElement('span');
  const labels = { APPROVED: 'Ready', DISPATCHED: 'On the way', RECEIVED: 'Received' };
  badge.className = `status ${transfer.status.toLowerCase()}`;
  badge.textContent = labels[transfer.status];
  side.append(qty, badge);

  row.append(main, side);

  if (transfer.status === 'APPROVED') {
    row.append(buildDispatch(transfer));
  }
  if (transfer.status === 'DISPATCHED') {
    row.append(buildReceive(transfer));
  }
  if (transfer.status === 'RECEIVED' && transfer.missingQuantity > 0) {
    const missing = `${transfer.missingQuantity} ${transfer.missingQuantity === 1 ? 'unit' : 'units'} missing`;
    row.append(makeText('shipment-missing', `${missing}: ${transfer.receiptNote}`));
  }
  return row;
}

// Dispatch button for an approved transfer
function buildDispatch(transfer) {
  const box = document.createElement('div');
  box.className = 'shipment-action';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button-primary';
  button.textContent = `Dispatch ${transfer.quantity} units`;
  button.addEventListener('click', () => dispatch(transfer, button));
  box.append(button);
  return box;
}

// "Units received", note and Confirm button for a transfer on its way.
function buildReceive(transfer) {
  const box = document.createElement('div');
  box.className = 'shipment-action';

  if (transfer.dispatchedBy === currentUser.username) {
    box.append(makeText('shipment-hint', 'You dispatched this, so someone else must confirm that it arrived.'));
    return box;
  }

  const id = transfer.transferId;
  const qtyLabel = document.createElement('label');
  qtyLabel.htmlFor = `received-${id}`;
  qtyLabel.textContent = 'Units received';
  const qtyInput = document.createElement('input');
  qtyInput.id = `received-${id}`;
  qtyInput.type = 'number';
  qtyInput.min = '0';
  qtyInput.max = String(transfer.dispatchedQuantity);
  qtyInput.step = '1';
  qtyInput.value = String(transfer.dispatchedQuantity);

  const noteInput = document.createElement('input');
  noteInput.type = 'text';
  noteInput.maxLength = 200;
  noteInput.placeholder = 'Note, needed if units are missing';
  noteInput.setAttribute('aria-label', 'Note about missing units');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button-primary';
  button.textContent = 'Confirm receipt';
  button.addEventListener('click', () => receive(transfer, qtyInput.value, noteInput.value, button));

  const qtyField = document.createElement('div');
  qtyField.className = 'received-field';
  qtyField.append(qtyLabel, qtyInput);
  box.append(qtyField, noteInput, button);
  return box;
}

// PATCH /api/transfers/:id/dispatch on the Tracking service
async function dispatch(transfer, button) {
  button.disabled = true;
  try {
    const result = await apiRequest(`${TRACKING_API}/api/transfers/${transfer.transferId}/dispatch`, {
      method: 'PATCH'
    });
    let text = `Dispatched ${transfer.quantity} units from ${warehouseName(transfer.fromWarehouseId)}.`;
    if (result.lowStockAlert) {
      text = `${text} Stock there is now low, so managers were alerted.`;
    }
    showToast(text, result.lowStockAlert ? 'warn' : 'good');
    stage = 'DISPATCHED';
    showStage();
    await loadShipments();
    await loadHistory();
    await loadMessages();
  } catch (error) {
    console.error(error);
    showToast(`Not dispatched: ${error.message}`, 'bad');
    button.disabled = false;
  }
}

// PATCH /api/transfers/:id/receive on the Tracking service
async function receive(transfer, receivedText, note, button) {
  const receivedQuantity = Number(receivedText);
  const payload = { receivedQuantity };
  if (note.trim() !== '') {
    payload.note = note.trim();
  }

  button.disabled = true;
  try {
    await apiRequest(`${TRACKING_API}/api/transfers/${transfer.transferId}/receive`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const missing = transfer.dispatchedQuantity - receivedQuantity;
    let text = `Received ${receivedQuantity} units at ${warehouseName(transfer.toWarehouseId)}.`;
    if (missing > 0) {
      text = `${text} ${missing} missing, noted.`;
    }
    showToast(text, missing > 0 ? 'warn' : 'good');
    stage = 'RECEIVED';
    showStage();
    await loadShipments();
    await loadHistory();
    await loadMessages();
  } catch (error) {
    console.error(error);
    showToast(`Not received: ${error.message}`, 'bad');
    button.disabled = false;
  }
}

// Marks the chosen stage button
function showStage() {
  stageTabs.forEach((tab) => {
    tab.setAttribute('aria-pressed', String(tab.dataset.stage === stage));
  });
}

stageTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    stage = tab.dataset.stage;
    showStage();
    renderShipments();
  });
});
shipmentWarehouse.addEventListener('change', renderShipments);

// One item chosen: GET /api/items/:id/movements. Otherwise: GET /api/movements
async function loadHistory() {
  try {
    let movements;
    if (historyItem.value) {
      const data = await apiRequest(`${TRACKING_API}/api/items/${encodeURIComponent(historyItem.value)}/movements`);
      movements = data.movements;
      if (historyWarehouse.value) {
        movements = movements.filter((movement) => movement.warehouseId === historyWarehouse.value);
      }
    } else {
      const query = historyWarehouse.value
        ? `?warehouseId=${encodeURIComponent(historyWarehouse.value)}`
        : '';
      movements = await apiRequest(`${TRACKING_API}/api/movements${query}`);
    }
    renderHistory(movements);
  } catch (error) {
    console.error(error);
    showToast(`Could not load the movement history: ${error.message}`, 'bad');
  }
}

historyItem.addEventListener('change', loadHistory);
historyWarehouse.addEventListener('change', loadHistory);

function renderHistory(movements) {
  movementList.replaceChildren();
  if (movements.length === 0) {
    historySummary.textContent = 'No movements yet. They appear when a transfer is dispatched or received.';
    return;
  }

  let unitsOut = 0;
  let unitsIn = 0;
  movements.forEach((movement) => {
    if (movement.movementType === 'OUT') {
      unitsOut = unitsOut + movement.quantity;
    } else {
      unitsIn = unitsIn + movement.quantity;
    }
  });
  const word = movements.length === 1 ? 'movement' : 'movements';
  historySummary.textContent = `${movements.length} ${word}: ${unitsOut} units out, ${unitsIn} units in.`;

  movements.forEach((movement) => {
    const line = document.createElement('li');
    line.className = `movement ${movement.movementType === 'OUT' ? 'movement-out' : 'movement-in'}`;

    const info = document.createElement('div');
    const place = movement.movementType === 'OUT'
      ? `Out of ${warehouseName(movement.warehouseId)}`
      : `Into ${warehouseName(movement.warehouseId)}`;
    info.append(
      makeText('movement-place', place),
      makeText('movement-item', itemName(movement.itemId)),
      makeText('movement-meta', `${formatDate(movement.date)} by ${movement.performedBy}`)
    );
    if (movement.note) {
      info.append(makeText('movement-note', `Note: ${movement.note}`));
    }

    const qty = makeText('movement-qty',
      movement.movementType === 'OUT' ? `-${movement.quantity}` : `+${movement.quantity}`);
    line.append(info, qty);
    movementList.append(line);
  });
}

// GET /api/messages -> the new dispatch and receipt messages since the last check
async function loadMessages() {
  try {
    const messages = await apiRequest(`${TRACKING_API}/api/messages`);
    shownMessages = [...messages.reverse(), ...shownMessages].slice(0, 10);
    renderMessages();
  } catch (error) {
    console.error(error);
  }
}

function renderMessages() {
  messagesList.replaceChildren();
  messagesSection.hidden = shownMessages.length === 0;
  shownMessages.forEach((message) => {
    const line = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = `${message.subject}: ${message.text}`;
    const time = document.createElement('span');
    time.className = 'alerts-time';
    time.textContent = new Date(message.sentAt).toLocaleTimeString();
    line.append(text, time);
    messagesList.append(line);
  });
}

messagesClear.addEventListener('click', () => {
  shownMessages = [];
  renderMessages();
});

// Check for new messages every 20 seconds while the page is open
setInterval(() => {
  if (currentUser && !appSection.hidden) {
    loadMessages();
  }
}, 20000);

// All three services must answer: Inventory for login, Transfers for the requests,
// Tracking for dispatch, receipt and history
async function checkApis() {
  try {
    await apiRequest(`${INVENTORY_API}/api/health`);
    await apiRequest(`${TRANSFERS_API}/api/health`);
    const health = await apiRequest(`${TRACKING_API}/api/health`);
    apiStatus.textContent = `Connected (${health.environment})`;
    apiStatus.className = 'api-status online';
  } catch (error) {
    console.error(error);
    apiStatus.textContent = 'Not connected: start all three backends';
    apiStatus.className = 'api-status offline';
  }
}

// Login and logout (Inventory service)

function clearLogin() {
  authToken = null;
  currentUser = null;
  shownMessages = [];
  messagesSection.hidden = true;
  firstLoad = true;
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
  await setupNavForUser(user);
  await loadChoices();
  await loadShipments();
  await loadHistory();
  await loadMessages();
}

// POST /api/auth/login on the Inventory service -> save the token, then show the app
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
