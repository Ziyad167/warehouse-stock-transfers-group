// Shared by the Inventory, Transfers and Tracking pages:
// links between the pages, the two-step login (choose a role, then log in),
// and the eye button on password fields.

// Returns the address of a page, with optional ?key=value parameters.
// On Floci each page is in its own S3 bucket; with http-server they are all in one folder.
function pageUrl(page, params) {
  const onS3 = window.location.pathname.includes('-frontend/');
  let url = onS3 ? `/${page}-frontend/${page}.html` : `${page}.html`;
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
