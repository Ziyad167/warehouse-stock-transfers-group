// Page elements
const apiStatus = document.querySelector('#api-status');
const toast = document.querySelector('#toast');
const loginPanel = document.querySelector('#login-panel');
const loginForm = document.querySelector('#login-form');
const loginUsername = document.querySelector('#login-username');
const loginPassword = document.querySelector('#login-password');
const loginFeedback = document.querySelector('#login-feedback');
const managerOnly = document.querySelector('#manager-only');
const appSection = document.querySelector('#app');
const userBar = document.querySelector('#user-bar');
const userInfo = document.querySelector('#user-info');
const logoutButton = document.querySelector('#logout-button');
const mainNav = document.querySelector('#main-nav');
const approvalsSummary = document.querySelector('#approvals-summary');
const filterSource = document.querySelector('#filter-source');
const approvalList = document.querySelector('#approval-list');
const approvalEmpty = document.querySelector('#approval-empty');
const decisionList = document.querySelector('#decision-list');
const decisionEmpty = document.querySelector('#decision-empty');

// Data kept by the page
let authToken = localStorage.getItem('authToken');
let warehouses = [];
let items = [];
let pending = [];
let stockBySource = {};
let toastTimer = null;

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

// GET /api/warehouses and GET /api/items on the Inventory service -> names and the filter
async function loadChoices() {
  warehouses = await apiRequest(`${INVENTORY_API}/api/warehouses`);
  items = await apiRequest(`${INVENTORY_API}/api/items`);
  fillSelect(filterSource, [
    { value: '', label: 'All warehouses' },
    ...warehouses.map((warehouse) => ({
      value: warehouse.warehouseId,
      label: `${warehouse.name} (${warehouse.location})`
    }))
  ]);
}

// GET /api/transfers on the Transfers service -> waiting requests and recent decisions.
async function loadRequests() {
  try {
    const transfers = await apiRequest(`${TRANSFERS_API}/api/transfers`);
    pending = transfers.filter((transfer) => transfer.status === 'PENDING');

    stockBySource = {};
    const sources = [...new Set(pending.map((transfer) => transfer.fromWarehouseId))];
    for (const warehouseId of sources) {
      const data = await apiRequest(`${INVENTORY_API}/api/warehouses/${warehouseId}/inventory`);
      stockBySource[warehouseId] = {};
      data.stock.forEach((record) => {
        stockBySource[warehouseId][record.itemId] = record.quantity;
      });
    }

    renderPending();
    renderDecisions(transfers.filter((transfer) => transfer.decidedAt));
    await refreshApprovalCount();
  } catch (error) {
    console.error(error);
    showToast(`Could not load the requests: ${error.message}`, 'bad');
  }
}

filterSource.addEventListener('change', renderPending);

// Waiting requests

function renderPending() {
  const shown = pending.filter((transfer) =>
    !filterSource.value || transfer.fromWarehouseId === filterSource.value);

  const word = pending.length === 1 ? 'request is' : 'requests are';
  approvalsSummary.textContent = `${pending.length} ${word} waiting for your decision.`;

  approvalList.replaceChildren();
  approvalEmpty.hidden = shown.length > 0;
  approvalEmpty.textContent = pending.length === 0
    ? 'Nothing to decide. New requests appear here when someone asks for a transfer.'
    : 'No waiting requests from this warehouse.';

  shown.forEach((transfer) => {
    approvalList.append(buildApproval(transfer));
  });
}

// One request: what, from where to where, who asked, the stock at the source,
// and the Approve / Reject controls
function buildApproval(transfer) {
  const row = document.createElement('li');
  row.className = 'approval';

  const stock = stockBySource[transfer.fromWarehouseId] || {};
  const inStock = stock[transfer.itemId] || 0;
  const enough = inStock >= transfer.quantity;

  const main = document.createElement('div');
  main.append(
    makeText('approval-route', `${warehouseName(transfer.fromWarehouseId)} to ${warehouseName(transfer.toWarehouseId)}`),
    makeText('approval-what', itemName(transfer.itemId)),
    makeText('approval-meta', `Requested by ${transfer.requestedBy} on ${formatDate(transfer.requestedAt)}`)
  );
  if (transfer.note) {
    main.append(makeText('approval-meta', `Note: ${transfer.note}`));
  }
  main.append(makeText(enough ? 'approval-stock' : 'approval-stock bad', enough
    ? `${warehouseName(transfer.fromWarehouseId)} has ${inStock}, enough to approve.`
    : `${warehouseName(transfer.fromWarehouseId)} has only ${inStock}, not enough to approve.`));

  const qty = makeText('approval-qty', transfer.quantity);

  const actions = document.createElement('div');
  actions.className = 'approval-actions';

  const approve = document.createElement('button');
  approve.type = 'button';
  approve.className = 'button-primary';
  approve.textContent = 'Approve';
  approve.disabled = !enough;

  const reason = document.createElement('input');
  reason.type = 'text';
  reason.maxLength = 200;
  reason.placeholder = 'Reason for rejecting';
  reason.setAttribute('aria-label', 'Reason for rejecting');

  const reject = document.createElement('button');
  reject.type = 'button';
  reject.className = 'button-secondary';
  reject.textContent = 'Reject';

  approve.addEventListener('click', () => decide(transfer, 'approve', '', [approve, reject]));
  reject.addEventListener('click', () => decide(transfer, 'reject', reason.value, [approve, reject]));
  actions.append(approve, reason, reject);

  row.append(main, qty, actions);
  return row;
}

// PATCH /api/transfers/:id/decision -> approve or reject
async function decide(transfer, decision, reason, buttons) {
  buttons.forEach((button) => {
    button.disabled = true;
  });
  try {
    const body = decision === 'reject' ? { decision, reason } : { decision };
    await apiRequest(`${TRANSFERS_API}/api/transfers/${transfer.transferId}/decision`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const what = `${transfer.quantity} units to ${warehouseName(transfer.toWarehouseId)}`;
    showToast(decision === 'approve'
      ? `Approved: ${what}. It is now ready to dispatch on the Tracking page.`
      : `Rejected: ${what}.`, 'good');
    await loadRequests();
  } catch (error) {
    console.error(error);
    showToast(`Not ${decision === 'approve' ? 'approved' : 'rejected'}: ${error.message}`, 'bad');
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
}

// Recent decisions

function renderDecisions(decided) {
  const recent = decided
    .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))
    .slice(0, 8);

  decisionList.replaceChildren();
  decisionEmpty.hidden = recent.length > 0;

  recent.forEach((transfer) => {
    const rejected = transfer.status === 'REJECTED';
    const line = document.createElement('li');
    line.className = `decision-item ${rejected ? 'decision-rejected' : 'decision-approved'}`;
    line.append(
      makeText('decision-verb', `${rejected ? 'Rejected' : 'Approved'} by ${transfer.decidedBy}`),
      makeText('decision-what', `${transfer.quantity} x ${itemName(transfer.itemId)}, ` +
        `${warehouseName(transfer.fromWarehouseId)} to ${warehouseName(transfer.toWarehouseId)}`),
      makeText('decision-when', formatDate(transfer.decidedAt))
    );
    if (rejected && transfer.decisionReason) {
      line.append(makeText('decision-when', `Reason: ${transfer.decisionReason}`));
    }
    decisionList.append(line);
  });
}

// Both services must answer: Inventory for login and stock, Transfers for the requests
async function checkApis() {
  try {
    await apiRequest(`${INVENTORY_API}/api/health`);
    const health = await apiRequest(`${TRANSFERS_API}/api/health`);
    apiStatus.textContent = `Connected (${health.environment})`;
    apiStatus.className = 'api-status online';
  } catch (error) {
    console.error(error);
    apiStatus.textContent = 'Not connected: start the Inventory and Transfers backends';
    apiStatus.className = 'api-status offline';
  }
}

// Login and logout (Inventory service)

function clearLogin() {
  authToken = null;
  localStorage.removeItem('authToken');
}

function showLogin(text) {
  appSection.hidden = true;
  managerOnly.hidden = true;
  userBar.hidden = true;
  mainNav.hidden = true;
  loginPanel.hidden = false;
  resetLoginSteps();
  setFeedback(loginFeedback, text || '', text ? 'bad' : '');
}

// Managers see the requests; staff see a short message instead
async function showApp(user) {
  loginPanel.hidden = true;
  userBar.hidden = false;
  mainNav.hidden = false;
  userInfo.textContent = roleLabel(user.role);
  await setupNavForUser(user);

  if (user.role !== 'manager') {
    appSection.hidden = true;
    managerOnly.hidden = false;
    return;
  }
  managerOnly.hidden = true;
  appSection.hidden = false;
  try {
    await loadChoices();
  } catch (error) {
    console.error(error);
    showToast(`Could not load warehouses and items: ${error.message}`, 'bad');
  }
  await loadRequests();
}

// POST /api/auth/login on the Inventory service -> save the token, then show the page
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
