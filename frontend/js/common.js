// Shared by the Inventory and Transfers pages:
// links between the pages, and the Show / Hide button on password fields.

// Returns the address of a page, with optional ?key=value parameters.
// On Floci the pages are in two S3 buckets; with http-server they are in one folder.
function pageUrl(page, params) {
  const onS3 = window.location.pathname.includes('-frontend/');
  let url;
  if (page === 'inventory') {
    url = onS3 ? '/inventory-frontend/inventory.html' : 'inventory.html';
  } else {
    url = onS3 ? '/transfers-frontend/transfers.html' : 'transfers.html';
  }
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

// Every .password-field has an input and a button that shows or hides the password
function setupPasswordToggles() {
  document.querySelectorAll('.password-field').forEach((field) => {
    const input = field.querySelector('input');
    const button = field.querySelector('button');
    button.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.textContent = show ? 'Hide' : 'Show';
      button.setAttribute('aria-pressed', String(show));
      button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });
}

// Returns the role chosen on the login form ('manager' or 'staff'), or null
function chosenRole() {
  const checked = document.querySelector('input[name="login-role"]:checked');
  return checked ? checked.value : null;
}

// Puts the password back to hidden (used after logging in or out)
function hidePasswords() {
  document.querySelectorAll('.password-field').forEach((field) => {
    const input = field.querySelector('input');
    const button = field.querySelector('button');
    input.type = 'password';
    button.textContent = 'Show';
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', 'Show password');
  });
}

setupNavigation();
setupPasswordToggles();
