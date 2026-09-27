/* Register + login. The alert box shows backend errors; the footer dot
   shows API reachability. */
import { BASE_URL, post } from './api.js';
import { getToken, setToken, redirect } from './utils.js';

if (getToken()) {
  redirect('dashboard.html');
}

const TAB_ACTIVE =
  'py-space-xs px-space-sm rounded-md font-label-md text-label-md transition-all text-center flex items-center justify-center gap-1.5 bg-surface-container-high text-on-surface shadow-sm';
const TAB_IDLE =
  'py-space-xs px-space-sm rounded-md font-label-md text-label-md transition-all text-center flex items-center justify-center gap-1.5 text-outline hover:text-on-surface';

const tabSignin = document.getElementById('tab-signin');
const tabRegister = document.getElementById('tab-register');
const formSignin = document.getElementById('form-signin');
const formRegister = document.getElementById('form-register');
const alertBox = document.getElementById('auth-alert');
const alertIcon = document.getElementById('alert-icon');
const alertTitle = document.getElementById('alert-title');
const alertBody = document.getElementById('alert-body');

function switchTab(tab) {
  const signin = tab === 'signin';
  tabSignin.className = signin ? TAB_ACTIVE : TAB_IDLE;
  tabRegister.className = signin ? TAB_IDLE : TAB_ACTIVE;
  formSignin.classList.toggle('hidden', !signin);
  formSignin.classList.toggle('flex', signin);
  formRegister.classList.toggle('hidden', signin);
  formRegister.classList.toggle('flex', !signin);
  dismissAlert();
}

tabSignin.addEventListener('click', () => switchTab('signin'));
tabRegister.addEventListener('click', () => switchTab('register'));

function showAlert(title, message) {
  alertIcon.textContent = 'error';
  alertTitle.textContent = title;
  alertBody.textContent = message;
  alertBox.classList.remove('hidden');
  alertBox.classList.add('flex');
}

function dismissAlert() {
  alertBox.classList.add('hidden');
  alertBox.classList.remove('flex');
}

document.getElementById('alert-dismiss').addEventListener('click', dismissAlert);

document.querySelectorAll('[data-toggle]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.toggle);
    const icon = btn.querySelector('.material-symbols-outlined');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    icon.textContent = show ? 'visibility_off' : 'visibility';
  });
});

const bars = [
  document.getElementById('bar-1'),
  document.getElementById('bar-2'),
  document.getElementById('bar-3'),
  document.getElementById('bar-4'),
];
const strengthLabel = document.getElementById('strength-label');
const BAR_IDLE = 'h-full w-1/4 bg-surface-container-high transition-colors';

function paintBars(count, color) {
  bars.forEach((bar, i) => {
    bar.className =
      i < count ? `h-full w-1/4 ${color} transition-colors` : BAR_IDLE;
  });
}

function checkStrength(value) {
  bars.forEach((bar) => {
    bar.className = BAR_IDLE;
  });
  if (!value) {
    strengthLabel.textContent = 'Strength: Enter minimum 8 chars';
    strengthLabel.className = 'text-outline';
    return;
  }
  if (value.length < 8) {
    paintBars(1, 'bg-error');
    strengthLabel.textContent = 'Strength: Too short (<8 chars)';
    strengthLabel.className = 'text-error';
    return;
  }
  let score = 1;
  if (value.length >= 10) score += 1;
  if (/[A-Z]/.test(value) && /[0-9]/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  const levels = [
    { bars: 1, color: 'bg-error', text: 'Strength: Weak', cls: 'text-error' },
    { bars: 2, color: 'bg-tertiary', text: 'Strength: Fair', cls: 'text-tertiary' },
    { bars: 3, color: 'bg-secondary', text: 'Strength: Strong', cls: 'text-secondary' },
    { bars: 4, color: 'bg-secondary-fixed', text: 'Strength: Maximum Entropy', cls: 'text-secondary-fixed' },
  ];
  const level = levels[score - 1];
  paintBars(level.bars, level.color);
  strengthLabel.textContent = level.text;
  strengthLabel.className = level.cls;
}

document
  .getElementById('reg-password')
  .addEventListener('input', (e) => checkStrength(e.target.value));

function setBusy(button, busy) {
  button.disabled = busy;
  button.style.opacity = busy ? '0.6' : '';
}

formSignin.addEventListener('submit', async (e) => {
  e.preventDefault();
  dismissAlert();
  const button = document.getElementById('signin-submit');
  setBusy(button, true);
  try {
    const data = await post('/auth/login', {
      email: document.getElementById('signin-email').value.trim(),
      password: document.getElementById('signin-password').value,
    });
    setToken(data.accessToken);
    redirect('dashboard.html');
  } catch (err) {
    showAlert(`ERR_${err.status || 'NETWORK'}`, err.message);
  } finally {
    setBusy(button, false);
  }
});

formRegister.addEventListener('submit', async (e) => {
  e.preventDefault();
  dismissAlert();
  const password = document.getElementById('reg-password').value;
  if (password !== document.getElementById('reg-confirm-password').value) {
    showAlert('ERR_VALIDATION', 'Confirmation password does not match.');
    return;
  }
  const button = document.getElementById('register-submit');
  setBusy(button, true);
  try {
    const data = await post('/auth/register', {
      email: document.getElementById('reg-email').value.trim(),
      password,
      workspaceName: document.getElementById('reg-workspace').value.trim(),
    });
    setToken(data.accessToken);
    redirect('dashboard.html');
  } catch (err) {
    showAlert(`ERR_${err.status || 'NETWORK'}`, err.message);
  } finally {
    setBusy(button, false);
  }
});

// Footer: real reachability probe against the public hello route.
try {
  const res = await fetch(`${BASE_URL}/`);
  const dot = document.getElementById('api-dot');
  const label = document.getElementById('api-status');
  if (res.ok) {
    label.textContent = 'API online';
  } else {
    dot.className = 'w-1.5 h-1.5 rounded-full bg-tertiary';
    label.textContent = 'API degraded';
  }
} catch {
  document.getElementById('api-dot').className =
    'w-1.5 h-1.5 rounded-full bg-error';
  document.getElementById('api-status').textContent = 'API unreachable';
}
