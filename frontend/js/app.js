// INVENTORY_API and LOW_STOCK_LIMIT come from js/config.js, and pageUrl, chosenRole,
// roleLabel, resetLoginSteps and hidePasswords from js/common.js (both loaded first).

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
const mainNav = document.querySelector('#main-nav');
const warehouseList = document.querySelector('#warehouse-list');
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
const alertsSection = document.querySelector('#alerts-section');
const alertsList = document.querySelector('#alerts-list');
const alertsClear = document.querySelector('#alerts-clear');
const editWarehouseButton = document.querySelector('#edit-warehouse-button');
const warehouseEditForm = document.querySelector('#warehouse-edit-form');
const editWarehouseName = document.querySelector('#edit-warehouse-name');
const editWarehouseLocation = document.querySelector('#edit-warehouse-location');
const editWarehouseCancel = document.querySelector('#edit-warehouse-cancel');
const warehouseEditFeedback = document.querySelector('#warehouse-edit-feedback');

// ---------- Data kept by the page ----------
// Lab 8: the login token is kept in localStorage, so a page refresh stays logged in
let authToken = localStorage.getItem('authToken');
let allItems = [];      // every item, for the item lists
let currentStock = [];  // stock records of the chosen warehouse
let warehouses = [];    // every warehouse, for the bar on the left
let selectedWarehouseId = null;
let currentUser = null;   // who is logged in: { username, role }
let shownAlerts = [];        // low-stock alerts received since the page opened, newest first
let currentWarehouse = null;  // the chosen warehouse: { warehouseId, name, location }
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

// Managers may change and delete things; staff may not
function isManager() {
  return currentUser !== null && currentUser.role === 'manager';
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

// GET /api/warehouses -> fill the warehouse bar, then show the chosen warehouse's stock
async function loadWarehouses() {
  try {
    warehouses = await apiRequest(`${INVENTORY_API}/api/warehouses`);

    // Coming from the Transfers page with ?warehouse=WH-101 opens that warehouse;
    // otherwise keep the current one, or start with the first
    const wanted = new URLSearchParams(window.location.search).get('warehouse');
    const exists = (id) => warehouses.some((warehouse) => warehouse.warehouseId === id);
    if (wanted && exists(wanted)) {
      selectedWarehouseId = wanted;
    } else if (!exists(selectedWarehouseId) && warehouses.length > 0) {
      selectedWarehouseId = warehouses[0].warehouseId;
    }

    renderWarehouseBar();
    await loadStock();
  } catch (error) {
    console.error(error);
    showToast(`Could not load warehouses: ${error.message}`, 'bad');
  }
}

// One button per warehouse in the bar on the left; the chosen one is highlighted
function renderWarehouseBar() {
  warehouseList.replaceChildren();
  warehouses.forEach((warehouse) => {
    const line = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'warehouse-button';
    if (warehouse.warehouseId === selectedWarehouseId) {
      button.setAttribute('aria-current', 'true');
    }
    const name = document.createElement('span');
    name.className = 'warehouse-button-name';
    name.textContent = warehouse.name;
    const place = document.createElement('span');
    place.className = 'warehouse-button-place';
    place.textContent = warehouse.location;
    button.append(name, place);
    button.addEventListener('click', () => selectWarehouse(warehouse.warehouseId));
    line.append(button);
    warehouseList.append(line);
  });
}

// When the user picks another warehouse, show its stock
function selectWarehouse(warehouseId) {
  selectedWarehouseId = warehouseId;
  setFeedback(checkResult, '');
  setFeedback(addFeedback, '');
  renderWarehouseBar();
  loadStock();
}

// GET /api/warehouses/:id/inventory -> show the stock of the chosen warehouse
async function loadStock() {
  try {
    const data = await apiRequest(
      `${INVENTORY_API}/api/warehouses/${selectedWarehouseId}/inventory`);
    currentStock = data.stock;
    currentWarehouse = data.warehouse;
    warehouseName.textContent = data.warehouse.name;
    editWarehouseButton.hidden = !isManager();
    warehouseEditForm.hidden = true;
    renderSummary(data.warehouse, data.stock);
    renderStock(data.stock);
    refreshAddChoices();
  } catch (error) {
    console.error(error);
    showToast(`Could not load stock: ${error.message}`, 'bad');
  }
}

// Under the warehouse name: its city, then three counts (items, units, running low)
function renderSummary(warehouse, stock) {
  let units = 0;
  let low = 0;
  stock.forEach((record) => {
    units = units + record.quantity;
    if (stockStatus(record.quantity) !== 'ok') {
      low = low + 1;
    }
  });

  const place = document.createElement('p');
  place.className = 'rack-place';
  place.textContent = warehouse.location;

  const stats = document.createElement('dl');
  stats.className = 'rack-stats';
  stats.append(
    makeStat(stock.length === 1 ? 'item' : 'items', stock.length),
    makeStat('units in stock', units),
    makeStat('running low', low, low > 0 ? 'stat-low' : '')
  );
  warehouseSummary.replaceChildren(place, stats);
}

function makeStat(label, value, extraClass) {
  const stat = document.createElement('div');
  stat.className = `rack-stat ${extraClass || ''}`.trim();
  const number = document.createElement('dd');
  number.textContent = value;
  const name = document.createElement('dt');
  name.textContent = label;
  stat.append(name, number);
  return stat;
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
    // Link to the Transfers page, with this warehouse and item already chosen
    const transferLink = document.createElement('a');
    transferLink.className = 'row-link';
    transferLink.href = pageUrl('transfers', { from: selectedWarehouseId, item: record.itemId });
    transferLink.textContent = 'Request a transfer';
    itemCell.append(name, sku, transferLink);

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

    // Units box with Add and Remove buttons. This corrects the stock of ONE warehouse
    // (a delivery from a supplier, damaged goods). Moving stock between warehouses
    // is done with a transfer: Transfers -> Approvals -> Tracking.
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
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'button-secondary';
    add.textContent = 'Add';
    add.addEventListener('click', () => moveStock(record, units.value, 'add'));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button-secondary';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => moveStock(record, units.value, 'remove'));
    move.append(units, add, remove);
    moveCell.append(move);

    // An empty record can be taken out of this warehouse (managers only)
    if (record.quantity === 0 && isManager()) {
      const drop = document.createElement('button');
      drop.type = 'button';
      drop.className = 'link-button';
      drop.textContent = 'Remove this item from the warehouse';
      drop.addEventListener('click', () => removeRecord(record));
      moveCell.append(drop);
    }

    row.append(itemCell, qtyCell, statusCell, moveCell);
    stockRows.append(row);
  });
}

// Add puts units in, Remove takes them out: PATCH /api/inventory/:id with { change }
async function moveStock(record, unitsText, action) {
  const units = Number(unitsText);
  if (!Number.isInteger(units) || units < 1) {
    showToast('Enter a whole number of units first.', 'bad');
    return;
  }
  const change = action === 'add' ? units : -units;

  try {
    const updated = await apiRequest(`${INVENTORY_API}/api/inventory/${record.inventoryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ change })
    });
    await loadStock();
    await loadAlerts();
    const done = action === 'add' ? 'Added' : 'Removed';
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

// DELETE /api/inventory/:id -> the item leaves this warehouse (only when 0 are left)
async function removeRecord(record) {
  try {
    await apiRequest(`${INVENTORY_API}/api/inventory/${record.inventoryId}`, { method: 'DELETE' });
    await loadStock();
    showToast(`${record.itemName} was removed from this warehouse.`, 'good');
  } catch (error) {
    console.error(error);
    showToast(`Not removed: ${error.message}`, 'bad');
  }
}

// ---------- Low-stock alerts (managers) ----------

// GET /api/alerts -> the new alerts that SNS put in the SQS queue since the last check
async function loadAlerts() {
  if (!isManager()) {
    alertsSection.hidden = true;
    return;
  }
  try {
    const alerts = await apiRequest(`${INVENTORY_API}/api/alerts`);
    shownAlerts = [...alerts.reverse(), ...shownAlerts].slice(0, 10);
    renderAlerts();
  } catch (error) {
    // The queue cannot be read: the page still works without alerts
    console.error(error);
  }
}

function renderAlerts() {
  alertsList.replaceChildren();
  alertsSection.hidden = shownAlerts.length === 0;
  shownAlerts.forEach((alert) => {
    const line = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = alert.text;
    const time = document.createElement('span');
    time.className = 'alerts-time';
    time.textContent = new Date(alert.sentAt).toLocaleTimeString();
    line.append(text, time);
    alertsList.append(line);
  });
}

alertsClear.addEventListener('click', () => {
  shownAlerts = [];
  renderAlerts();
});

// Check for new alerts every 20 seconds while a manager has the page open
setInterval(() => {
  if (isManager() && !appSection.hidden) {
    loadAlerts();
  }
}, 20000);

// ---------- Change a warehouse (managers) ----------

editWarehouseButton.addEventListener('click', () => {
  editWarehouseName.value = currentWarehouse.name;
  editWarehouseLocation.value = currentWarehouse.location;
  setFeedback(warehouseEditFeedback, '');
  warehouseEditForm.hidden = false;
  editWarehouseButton.hidden = true;
  editWarehouseName.focus();
});

editWarehouseCancel.addEventListener('click', () => {
  warehouseEditForm.hidden = true;
  editWarehouseButton.hidden = false;
});

// PATCH /api/warehouses/:id -> save the new name and city
warehouseEditForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await apiRequest(`${INVENTORY_API}/api/warehouses/${currentWarehouse.warehouseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editWarehouseName.value.trim(),
        location: editWarehouseLocation.value.trim()
      })
    });
    await loadWarehouses();
    showToast('Warehouse saved.', 'good');
  } catch (error) {
    console.error(error);
    setFeedback(warehouseEditFeedback, `Not saved: ${error.message}`, 'bad');
  }
});

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
    warehouseId: selectedWarehouseId,
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
    `?warehouseId=${encodeURIComponent(selectedWarehouseId)}` +
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

      // Managers can change or delete an item
      if (isManager()) {
        line.append(buildItemActions(item, line));
      }
      itemsList.append(line);
    });
  } catch (error) {
    console.error(error);
    showToast(`Could not search: ${error.message}`, 'bad');
  }
}

// "Edit" and "Delete" under an item in the search results (managers)
function buildItemActions(item, line) {
  const actions = document.createElement('div');
  actions.className = 'result-actions';

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'link-button';
  edit.textContent = 'Edit';
  edit.addEventListener('click', () => {
    actions.replaceWith(buildItemEditForm(item, line));
  });

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'link-button danger';
  remove.textContent = 'Delete';
  remove.addEventListener('click', () => {
    actions.replaceWith(buildDeleteQuestion(item, line));
  });

  actions.append(edit, remove);
  return actions;
}

// Small form to change the name, SKU, category and description of an item
function buildItemEditForm(item, line) {
  const form = document.createElement('form');
  form.className = 'inline-edit';

  const fields = [
    { key: 'name', label: 'Name', value: item.name },
    { key: 'sku', label: 'SKU', value: item.sku },
    { key: 'category', label: 'Category', value: item.category },
    { key: 'description', label: 'Description', value: item.description || '' }
  ];
  const inputs = {};
  fields.forEach((field) => {
    const id = `edit-${field.key}-${item.itemId}`;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = field.label;
    const input = document.createElement('input');
    input.id = id;
    input.type = 'text';
    input.value = field.value;
    inputs[field.key] = input;
    form.append(label, input);
  });

  const buttons = document.createElement('div');
  buttons.className = 'inline-actions';
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'button-primary';
  save.textContent = 'Save';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'button-secondary';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => form.replaceWith(buildItemActions(item, line)));
  buttons.append(save, cancel);

  const feedback = document.createElement('p');
  feedback.className = 'feedback';
  form.append(buttons, feedback);

  // PATCH /api/items/:id -> save the changes
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await apiRequest(`${INVENTORY_API}/api/items/${item.itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: inputs.name.value,
          sku: inputs.sku.value,
          category: inputs.category.value,
          description: inputs.description.value
        })
      });
      showToast('Item saved.', 'good');
      await loadItems();
      await loadStock();
      await searchItems(searchText.value.trim());
    } catch (error) {
      console.error(error);
      setFeedback(feedback, `Not saved: ${error.message}`, 'bad');
    }
  });
  return form;
}

// "Delete Work Gloves?" with Yes and Keep buttons
function buildDeleteQuestion(item, line) {
  const box = document.createElement('div');
  box.className = 'result-actions delete-question';

  const question = document.createElement('span');
  question.textContent = `Delete ${item.name}?`;

  const yes = document.createElement('button');
  yes.type = 'button';
  yes.className = 'button-secondary danger';
  yes.textContent = 'Yes, delete';

  const keep = document.createElement('button');
  keep.type = 'button';
  keep.className = 'button-secondary';
  keep.textContent = 'Keep it';
  keep.addEventListener('click', () => box.replaceWith(buildItemActions(item, line)));

  // DELETE /api/items/:id -> the item is deleted (only if no warehouse holds it)
  yes.addEventListener('click', async () => {
    try {
      await apiRequest(`${INVENTORY_API}/api/items/${item.itemId}`, { method: 'DELETE' });
      showToast(`${item.name} was deleted.`, 'good');
      await loadItems();
      await searchItems(searchText.value.trim());
    } catch (error) {
      console.error(error);
      showToast(`Not deleted: ${error.message}`, 'bad');
      box.replaceWith(buildItemActions(item, line));
    }
  });

  box.append(question, yes, keep);
  return box;
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

    // Link to the Tracking page, which shows where this item has moved
    const history = document.createElement('a');
    history.className = 'row-link';
    history.href = pageUrl('tracking', { item: item.itemId });
    history.textContent = 'See its movement history';
    const historyLine = document.createElement('li');
    historyLine.append(history);
    list.append(historyLine);

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
  currentUser = null;
  shownAlerts = [];
  alertsSection.hidden = true;
  localStorage.removeItem('authToken');
}

// Shows the login form and hides the app
function showLogin(text) {
  appSection.hidden = true;
  userBar.hidden = true;
  mainNav.hidden = true;
  loginPanel.hidden = false;
  resetLoginSteps();
  setFeedback(loginFeedback, text || '', text ? 'bad' : '');
}

// Shows the app for a logged-in user; only managers see "Stock a new item here"
// and the Approvals tab in the menu
async function showApp(user) {
  currentUser = user;
  loginPanel.hidden = true;
  appSection.hidden = false;
  userBar.hidden = false;
  mainNav.hidden = false;
  userInfo.textContent = roleLabel(user.role);
  addSection.hidden = user.role !== 'manager';

  await setupNavForUser(user);
  await loadItems();
  await loadWarehouses();
  await loadAlerts();
  await searchItems('');
}

// POST /api/auth/login -> save the token, then show the app
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