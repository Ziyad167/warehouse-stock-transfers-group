// INVENTORY_API and LOW_STOCK_LIMIT come from js/config.js (loaded first).

// ---------- Page elements ----------
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
const warehouseSelect = document.querySelector('#warehouse-select');
const warehouseName = document.querySelector('#warehouse-name');
const warehouseSummary = document.querySelector('#warehouse-summary');
const stockRows = document.querySelector('#stock-rows');
const stockEmpty = document.querySelector('#stock-empty');
const checkForm = document.querySelector('#check-form');
const checkItem = document.querySelector('#check-item');
const checkQuantity = document.querySelector('#check-quantity');
const checkResult = document.querySelector('#check-result');
const addSection = document.querySelector('#add-section');
const addForm = document.querySelector('#add-form');
const addItem = document.querySelector('#add-item');
const addQuantity = document.querySelector('#add-quantity');
const addButton = document.querySelector('#add-button');
const addFeedback = document.querySelector('#add-feedback');
const searchForm = document.querySelector('#search-form');
const searchText = document.querySelector('#search-text');
const itemsList = document.querySelector('#items-list');

// ---------- Data kept by the page ----------
// Lab 8: the login token is kept in localStorage, so a page refresh stays logged in
let authToken = localStorage.getItem('authToken');
let allItems = [];      // every item, for the item lists
let currentStock = [];  // stock records of the chosen warehouse
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
    // Our API errors look like { error: { code, message } }
    const text = body?.error?.message || `Request failed (${response.status})`;
    throw new Error(text);
  }

  return body;
}

// Shows a short message at the top of the screen for a few seconds.
// kind is 'good', 'bad' or 'warn'
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

function itemLabel(item) {
  return `${item.name} (${item.sku})`;
}

// "OK", "Low" or "Out" for a quantity
function stockStatus(quantity) {
  if (quantity === 0) {
    return 'out';
  }
  if (quantity < LOW_STOCK_LIMIT) {
    return 'low';
  }
  return 'ok';
}

// ---------- Warehouses and stock ----------

// GET /api/warehouses -> fill the warehouse list, then show its stock
async function loadWarehouses() {
  try {
    const warehouses = await apiRequest(`${INVENTORY_API}/api/warehouses`);
    fillSelect(warehouseSelect, warehouses.map((warehouse) => ({
      value: warehouse.warehouseId,
      label: `${warehouse.name} (${warehouse.location})`
    })));
    await loadStock();
  } catch (error) {
    console.error(error);
    showToast(`Could not load warehouses: ${error.message}`, 'bad');
  }
}

// GET /api/warehouses/:id/inventory -> show the stock of the chosen warehouse
async function loadStock() {
  try {
    const data = await apiRequest(
      `${INVENTORY_API}/api/warehouses/${warehouseSelect.value}/inventory`);
    currentStock = data.stock;
    warehouseName.textContent = data.warehouse.name;
    renderSummary(data.warehouse, data.stock);
    renderStock(data.stock);
    refreshAddChoices();
  } catch (error) {
    console.error(error);
    showToast(`Could not load stock: ${error.message}`, 'bad');
  }
}

// One sentence under the warehouse name, e.g. "Cairo. 3 items, 202 units, 1 running low."
function renderSummary(warehouse, stock) {
  let units = 0;
  let low = 0;
  stock.forEach((record) => {
    units = units + record.quantity;
    if (stockStatus(record.quantity) !== 'ok') {
      low = low + 1;
    }
  });
  const lowText = low === 0 ? 'nothing running low' : `${low} running low`;
  warehouseSummary.textContent =
    `${warehouse.location}. ${stock.length} items, ${units} units in stock, ${lowText}.`;
}

function renderStock(stock) {
  stockRows.replaceChildren();
  stockEmpty.hidden = stock.length > 0;

  stock.forEach((record) => {
    const status = stockStatus(record.quantity);
    const row = document.createElement('tr');
    row.className = status;

    // Item name and SKU
    const itemCell = document.createElement('td');
    const name = document.createElement('span');
    name.className = 'item-name';
    name.textContent = record.itemName;
    const sku = document.createElement('span');
    sku.className = 'item-sku';
    sku.textContent = record.sku;
    itemCell.append(name, sku);

    // Quantity in big numbers
    const qtyCell = document.createElement('td');
    qtyCell.className = 'qty';
    qtyCell.textContent = record.quantity;

    // Status label
    const statusCell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `status ${status}`;
    badge.textContent = status === 'ok' ? 'OK' : status === 'low' ? 'Low' : 'Out of stock';
    statusCell.append(badge);

    // Units box with Receive and Dispatch buttons
    const moveCell = document.createElement('td');
    moveCell.className = 'move-cell';
    const move = document.createElement('div');
    move.className = 'move';
    const units = document.createElement('input');
    units.type = 'number';
    units.min = '1';
    units.step = '1';
    units.placeholder = 'Units';
    units.setAttribute('aria-label', `Units of ${record.itemName}`);
    const receive = document.createElement('button');
    receive.type = 'button';
    receive.className = 'button-secondary';
    receive.textContent = 'Receive';
    receive.addEventListener('click', () => moveStock(record, units.value, 'receive'));
    const dispatch = document.createElement('button');
    dispatch.type = 'button';
    dispatch.className = 'button-secondary';
    dispatch.textContent = 'Dispatch';
    dispatch.addEventListener('click', () => moveStock(record, units.value, 'dispatch'));
    move.append(units, receive, dispatch);
    moveCell.append(move);

    row.append(itemCell, qtyCell, statusCell, moveCell);
    stockRows.append(row);
  });
}

// When the user picks another warehouse, show its stock
warehouseSelect.addEventListener('change', () => {
  setFeedback(checkResult, '');
  setFeedback(addFeedback, '');
  loadStock();
});

// Receive adds units, Dispatch removes them: PATCH /api/inventory/:id with { change }
async function moveStock(record, unitsText, action) {
  const units = Number(unitsText);
  if (!Number.isInteger(units) || units < 1) {
    showToast('Enter a whole number of units first.', 'bad');
    return;
  }
  const change = action === 'receive' ? units : -units;

  try {
    const updated = await apiRequest(`${INVENTORY_API}/api/inventory/${record.inventoryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ change })
    });
    await loadStock();
    const done = action === 'receive' ? 'Received' : 'Dispatched';
    if (updated.lowStockAlert) {
      showToast(`${done} ${units} units of ${record.itemName}. Only ${updated.quantity} left, ` +
        'so a low stock alert was sent to managers.', 'warn');
    } else {
      showToast(`${done} ${units} units of ${record.itemName}. Now ${updated.quantity} in stock.`, 'good');
    }
  } catch (error) {
    console.error(error);
    showToast(`Could not update stock: ${error.message}`, 'bad');
  }
}

// ---------- Items ----------

// GET /api/items -> keep the list and fill the item choices
async function loadItems() {
  try {
    allItems = await apiRequest(`${INVENTORY_API}/api/items`);
    fillSelect(checkItem, allItems.map((item) => ({ value: item.itemId, label: itemLabel(item) })));
    refreshAddChoices();
  } catch (error) {
    console.error(error);
    showToast(`Could not load items: ${error.message}`, 'bad');
  }
}

// The "Stock a new item here" list shows only items this warehouse does not hold yet
function refreshAddChoices() {
  const stockedIds = currentStock.map((record) => record.itemId);
  const notStocked = allItems.filter((item) => !stockedIds.includes(item.itemId));
  fillSelect(addItem, notStocked.map((item) => ({ value: item.itemId, label: itemLabel(item) })));

  const nothingToAdd = notStocked.length === 0;
  addItem.disabled = nothingToAdd;
  addQuantity.disabled = nothingToAdd;
  addButton.disabled = nothingToAdd;
  if (nothingToAdd) {
    setFeedback(addFeedback, 'Every item is already stocked in this warehouse.', '');
  }
}

// POST /api/inventory -> stock a new item in the chosen warehouse
addForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const item = allItems.find((one) => one.itemId === addItem.value);
  const payload = {
    warehouseId: warehouseSelect.value,
    itemId: addItem.value,
    quantity: Number(addQuantity.value)
  };

  try {
    await apiRequest(`${INVENTORY_API}/api/inventory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    addForm.reset();
    await loadStock();
    const text = `Added ${item.name} with ${payload.quantity} units.`;
    setFeedback(addFeedback, text, 'good');
    showToast(text, 'good');
  } catch (error) {
    console.error(error);
    setFeedback(addFeedback, `Not added: ${error.message}`, 'bad');
  }
});

// GET /api/inventory/availability -> can this warehouse send that many units?
checkForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const url = `${INVENTORY_API}/api/inventory/availability` +
    `?warehouseId=${encodeURIComponent(warehouseSelect.value)}` +
    `&itemId=${encodeURIComponent(checkItem.value)}` +
    `&quantity=${encodeURIComponent(checkQuantity.value)}`;

  try {
    const result = await apiRequest(url);
    if (result.isAvailable) {
      setFeedback(checkResult,
        `Yes. ${result.availableQuantity} in stock, ${result.requestedQuantity} needed.`, 'good');
    } else {
      setFeedback(checkResult,
        `No. Only ${result.availableQuantity} in stock, ${result.requestedQuantity} needed.`, 'bad');
    }
  } catch (error) {
    console.error(error);
    setFeedback(checkResult, `Could not check: ${error.message}`, 'bad');
  }
});

// GET /api/items?search= -> show matching items
searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await searchItems(searchText.value.trim());
});

async function searchItems(text) {
  try {
    const items = await apiRequest(
      `${INVENTORY_API}/api/items?search=${encodeURIComponent(text)}`);
    itemsList.replaceChildren();

    if (items.length === 0) {
      const none = document.createElement('li');
      none.className = 'result';
      none.textContent = `No items match "${text}". Try a shorter word or a SKU.`;
      itemsList.append(none);
      return;
    }

    items.forEach((item) => {
      const line = document.createElement('li');
      line.className = 'result';

      const head = document.createElement('div');
      head.className = 'result-head';
      const info = document.createElement('div');
      const name = document.createElement('span');
      name.className = 'item-name';
      name.textContent = item.name;
      const meta = document.createElement('span');
      meta.className = 'result-meta';
      meta.textContent = `${item.sku}, ${item.category}`;
      info.append(name, meta);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button-secondary';
      button.textContent = 'Where is it?';
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', () => toggleWhere(item, line, button));

      head.append(info, button);
      line.append(head);
      itemsList.append(line);
    });
  } catch (error) {
    console.error(error);
    showToast(`Could not search: ${error.message}`, 'bad');
  }
}

// GET /api/items/:id/stock -> shows every warehouse that holds this item
async function toggleWhere(item, line, button) {
  const open = line.querySelector('.where');
  if (open) {
    open.remove();
    button.textContent = 'Where is it?';
    button.setAttribute('aria-expanded', 'false');
    return;
  }

  try {
    const data = await apiRequest(`${INVENTORY_API}/api/items/${item.itemId}/stock`);
    const list = document.createElement('ul');
    list.className = 'where';

    if (data.stock.length === 0) {
      const none = document.createElement('li');
      none.textContent = 'Not stocked in any warehouse yet.';
      list.append(none);
    }
    data.stock.forEach((record) => {
      const row = document.createElement('li');
      const place = document.createElement('span');
      place.textContent = `${record.warehouseName} (${record.location})`;
      const qty = document.createElement('span');
      qty.textContent = `${record.quantity} units`;
      row.append(place, qty);
      list.append(row);
    });
    if (data.stock.length > 1) {
      const total = document.createElement('li');
      total.className = 'where-total';
      const label = document.createElement('span');
      label.textContent = 'All warehouses';
      const qty = document.createElement('span');
      qty.textContent = `${data.totalQuantity} units`;
      total.append(label, qty);
      list.append(total);
    }

    line.append(list);
    button.textContent = 'Hide';
    button.setAttribute('aria-expanded', 'true');
  } catch (error) {
    console.error(error);
    showToast(`Could not load where the item is: ${error.message}`, 'bad');
  }
}

// ---------- Connection status ----------

// Shows in the top bar if the API is reachable
async function checkApi() {
  try {
    const health = await apiRequest(`${INVENTORY_API}/api/health`);
    apiStatus.textContent = `Connected (${health.environment})`;
    apiStatus.className = 'api-status online';
  } catch (error) {
    console.error(error);
    apiStatus.textContent = 'Not connected: start the backend';
    apiStatus.className = 'api-status offline';
  }
}

// ---------- Login and logout ----------

// Forgets the token in this browser
function clearLogin() {
  authToken = null;
  localStorage.removeItem('authToken');
}

// Shows the login form and hides the app
function showLogin(text) {
  appSection.hidden = true;
  userBar.hidden = true;
  loginPanel.hidden = false;
  setFeedback(loginFeedback, text || '', text ? 'bad' : '');
}

// Shows the app for a logged-in user; only managers see "Stock a new item here"
async function showApp(user) {
  loginPanel.hidden = true;
  appSection.hidden = false;
  userBar.hidden = false;
  userInfo.textContent = `${user.username}, ${user.role}`;
  addSection.hidden = user.role !== 'manager';

  await loadItems();
  await loadWarehouses();
  await searchItems('');
}

// POST /api/auth/login -> save the token, then show the app
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

// POST /api/auth/logout -> the token stops working on the server too
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

// When the page opens: if a token is saved, ask the server who we are
async function startPage() {
  await checkApi();

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