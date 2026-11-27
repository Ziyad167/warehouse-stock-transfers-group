// Shared by the Inventory, Transfers, Approvals and Tracking pages:
// links between the pages, the two-step login (choose a role, then log in),
// and the eye button on password fields.

// Returns the address of a page, with optional ?key=value parameters.
// On Floci each service's pages are in its own S3 bucket; with http-server they are all in one folder.
// The Approvals page belongs to the Transfers service, so it is in the transfers bucket.
const PAGE_BUCKETS = {
  inventory: 'inventory-frontend',
  transfers: 'transfers-frontend',
  approvals: 'transfers-frontend',
  tracking: 'tracking-frontend'
};

function pageUrl(page, params) {
  const onS3 = window.location.pathname.includes('-frontend/');
  let url = onS3 ? `/${PAGE_BUCKETS[page]}/${page}.html` : `${page}.html`;
  if (params) {
    url = `${url}?${new URLSearchParams(params)}`;
  }
  return url;
}

// Points every navigation link (<a data-page="...">) to the right address
function setupNavigation() {
  document.querySelectorAll('a[data-page]').forEach((link) => {
    link.href = pageUrl(link.dataset.page);
  });
}

// Shows the menu for the logged-in user: the Approvals tab is for managers only
async function setupNavForUser(user) {
  const approvalsLink = document.querySelector('a[data-page="approvals"]');
  if (!approvalsLink) {
    return;
  }
  approvalsLink.hidden = user.role !== 'manager';
  await refreshApprovalCount();
}

// Puts the number of requests waiting for a decision on the Approvals tab
// (GET /api/transfers?status=PENDING on the Transfers service)
async function refreshApprovalCount() {
  const link = document.querySelector('a[data-page="approvals"]');
  const token = localStorage.getItem('authToken');
  if (!link || link.hidden || !token || typeof TRANSFERS_API === 'undefined') {
    return;
  }
  try {
    const response = await fetch(`${TRANSFERS_API}/api/transfers?status=PENDING`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      return;
    }
    const waiting = await response.json();
    let count = link.querySelector('.nav-count');
    if (!count) {
      count = document.createElement('span');
      count.className = 'nav-count';
      link.append(count);
    }
    count.textContent = waiting.length;
    count.hidden = waiting.length === 0;
  } catch (error) {
    // The Transfers backend is not running: show the tab without a number
    console.error(error);
  }
}

// "manager" -> "Manager", "staff" -> "Staff"
function roleLabel(role) {
  return role === 'manager' ? 'Manager' : 'Staff';
}

// ---------- Two-step login: 1) choose a role  2) username and password ----------

let selectedRole = null;

// The role chosen in step 1 ('manager' or 'staff'), or null
function chosenRole() {
  return selectedRole;
}

function setupRoleSteps() {
  const cards = document.querySelectorAll('.role-card[data-role]');
  const continueButton = document.querySelector('#role-continue');

  // Step 1: clicking a card selects it (the yellow check appears) and enables Continue
  cards.forEach((card) => {
    card.addEventListener('click', () => {
      selectedRole = card.dataset.role;
      cards.forEach((other) => other.setAttribute('aria-checked', String(other === card)));
      continueButton.disabled = false;
    });
  });

  // Continue opens step 2 for the chosen role
  continueButton.addEventListener('click', () => {
    if (!selectedRole) {
      return;
    }
    document.querySelector('#login-title').textContent = `Log in as ${roleLabel(selectedRole)}`;
    document.querySelector('#role-step').hidden = true;
    document.querySelector('#credentials-step').hidden = false;
    document.querySelector('#login-username').focus();
  });

  // "Change role" goes back to step 1
  document.querySelector('#change-role').addEventListener('click', resetLoginSteps);
}

// Shows step 1 again with nothing selected (used by "Change role" and after logging out)
function resetLoginSteps() {
  selectedRole = null;
  document.querySelectorAll('.role-card[data-role]').forEach((card) => {
    card.setAttribute('aria-checked', 'false');
  });
  document.querySelector('#role-continue').disabled = true;
  document.querySelector('#role-step').hidden = false;
  document.querySelector('#credentials-step').hidden = true;
  document.querySelector('#login-feedback').textContent = '';
}

// ---------- Password fields: the eye button shows or hides the password ----------

function setupPasswordToggles() {
  document.querySelectorAll('.password-field').forEach((field) => {
    const input = field.querySelector('input');
    const button = field.querySelector('button');
    button.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      // aria-pressed switches the icon in the CSS (open eye / crossed eye)
      button.setAttribute('aria-pressed', String(show));
      button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });
}

// Puts the password back to hidden (used after logging in)
function hidePasswords() {
  document.querySelectorAll('.password-field').forEach((field) => {
    field.querySelector('input').type = 'password';
    const button = field.querySelector('button');
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', 'Show password');
  });
}

setupNavigation();
setupRoleSteps();
setupPasswordToggles();
