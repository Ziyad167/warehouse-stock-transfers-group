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

function setupNavigation() {
  document.querySelectorAll('a[data-page]').forEach((link) => {
    link.href = pageUrl(link.dataset.page);
  });
}

async function setupNavForUser(user) {
  const approvalsLink = document.querySelector('a[data-page="approvals"]');
  if (!approvalsLink) {
    return;
  }
  approvalsLink.hidden = user.role !== 'manager';
  await refreshApprovalCount();
}

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
    console.error(error);
  }
}

function roleLabel(role) {
  return role === 'manager' ? 'Manager' : 'Staff';
}

let selectedRole = null;

function chosenRole() {
  return selectedRole;
}

function setupRoleSteps() {
  const cards = document.querySelectorAll('.role-card[data-role]');
  const continueButton = document.querySelector('#role-continue');

  cards.forEach((card) => {
    card.addEventListener('click', () => {
      selectedRole = card.dataset.role;
      cards.forEach((other) => other.setAttribute('aria-checked', String(other === card)));
      continueButton.disabled = false;
    });
  });

  continueButton.addEventListener('click', () => {
    if (!selectedRole) {
      return;
    }
    document.querySelector('#login-title').textContent = `Log in as ${roleLabel(selectedRole)}`;
    document.querySelector('#role-step').hidden = true;
    document.querySelector('#credentials-step').hidden = false;
    document.querySelector('#login-username').focus();
  });

  document.querySelector('#change-role').addEventListener('click', resetLoginSteps);
}

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

function setupPasswordToggles() {
  document.querySelectorAll('.password-field').forEach((field) => {
    const input = field.querySelector('input');
    const button = field.querySelector('button');
    button.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(show));
      button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });
}

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
