/* Campaign builder on the Stitch screen: params, recipients, live cost,
   confirm modal, real dispatch. */
import { BASE_URL, get, post } from './api.js';
import { countSegments, detectEncoding } from './sms.js';
import {
  requireAuth,
  redirect,
  clearToken,
  showToast,
} from './utils.js';

const token = requireAuth();
if (!token) {
  throw new Error('unreachable');
}

const E164 = /^\+[1-9]\d{7,14}$/;
const TAB_ON = ['bg-surface-container-high', 'text-on-surface', 'shadow-sm'];
const TAB_OFF = ['text-on-surface-variant'];

const recipients = [];
let balance = 0;

const nameEl = document.getElementById('campaign-name');
const smsEl = document.getElementById('sms-content');

async function init() {
  try {
    const workspace = await get('/workspaces/me');
    balance = workspace.credits;
    document.getElementById('hdr-credits').textContent = `${balance} Credits`;
  } catch (err) {
    showToast(err.message, 'error');
  }
  try {
    const res = await fetch(`${BASE_URL}/`);
    setHdrProbe(res.ok);
  } catch {
    setHdrProbe(false);
  }
  tickClock();
  setInterval(tickClock, 20000);
  refresh();
}

function tickClock() {
  const now = new Date();
  document.getElementById('preview-clock').textContent =
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function setHdrProbe(ok) {
  document.getElementById('hdr-ping').style.display = ok ? '' : 'none';
  document.getElementById('hdr-dot').className = ok
    ? 'relative inline-flex rounded-full h-2 w-2 bg-secondary'
    : 'relative inline-flex rounded-full h-2 w-2 bg-outline';
  const label = document.getElementById('hdr-label');
  label.textContent = ok ? 'API Online' : 'API Offline';
  label.className = ok
    ? 'font-code-sm text-code-sm text-secondary uppercase font-medium'
    : 'font-code-sm text-code-sm text-on-surface-variant uppercase font-medium';
}

document.getElementById('logout-btn').addEventListener('click', () => {
  clearToken();
});

function uniqueCount() {
  return new Set(recipients).size;
}

function segments() {
  return countSegments(smsEl.value);
}

function cost() {
  return uniqueCount() * segments();
}

function refresh() {
  const message = smsEl.value;
  document.getElementById('char-count').textContent = message.length;
  const segs = segments();
  document.getElementById('segment-count').textContent =
    `${segs} SMS Segment${segs === 1 ? '' : 's'}`;
  const unicode = detectEncoding(message) === 'unicode';
  const badge = document.getElementById('encoding-badge');
  badge.textContent = message.length === 0 ? 'GSM-7 Standard' : unicode ? 'Unicode (UCS-2)' : 'GSM-7 Standard';
  document.getElementById('encoding-badge-2').textContent = unicode ? 'UCS-2' : 'GSM-7';
  document.getElementById('split-note').textContent = unicode
    ? 'Unicode: 70 units per segment · 67 when multi-part'
    : 'GSM-7: 160 chars per segment · 153 when multi-part';
  document.getElementById('segment-warning').classList.toggle('hidden', segs < 2);
  document.getElementById('phone-preview-text').textContent =
    message || '(No SMS body configured)';

  renderRecipients();

  const total = cost();
  document.getElementById('math-recipients').textContent = uniqueCount();
  document.getElementById('math-segments').textContent = segs;
  document.getElementById('math-total').textContent = `${total} Credits`;
  document.getElementById('workspace-balance-display').textContent = `${balance} Credits`;
  document.getElementById('calc-cost-display').textContent = `${total} Credits`;
  const net = balance - total;
  const netEl = document.getElementById('net-balance-display');
  netEl.textContent = `${net} Credits`;
  netEl.classList.toggle('text-error', net < 0);
  netEl.classList.toggle('text-secondary', net >= 0);

  const ok =
    nameEl.value.trim().length > 0 &&
    message.length > 0 &&
    recipients.length > 0 &&
    total <= balance;
  document.getElementById('balance-badge').classList.toggle('hidden', !ok);
  document.getElementById('error-card-422').classList.toggle('hidden', ok);
  const trigger = document.getElementById('btn-trigger-dispatch');
  trigger.disabled = !ok;
  trigger.classList.toggle('opacity-50', !ok);
  trigger.classList.toggle('cursor-not-allowed', !ok);
}

function renderRecipients() {
  const list = document.getElementById('recipient-list');
  list.innerHTML = '';
  for (const phone of recipients) {
    const chip = document.createElement('div');
    chip.className =
      'recipient-chip flex items-center gap-space-xs bg-surface-container-high px-space-sm py-1 rounded text-on-surface';
    chip.dataset.phone = phone;
    const dot = document.createElement('span');
    dot.className = 'w-1.5 h-1.5 rounded-full bg-secondary';
    const num = document.createElement('span');
    num.className = 'font-code-sm text-code-sm';
    num.textContent = phone;
    const tag = document.createElement('span');
    tag.className =
      'font-code-sm text-code-sm text-secondary bg-surface-container-highest px-1 rounded';
    tag.textContent = 'E.164';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className =
      'btn-remove-recipient text-on-surface-variant hover:text-error transition-colors flex items-center justify-center p-0.5';
    remove.innerHTML =
      '<span class="material-symbols-outlined text-[14px]">close</span>';
    remove.addEventListener('click', () => {
      const i = recipients.indexOf(phone);
      if (i >= 0) recipients.splice(i, 1);
      refresh();
    });
    chip.append(dot, num, tag, remove);
    list.appendChild(chip);
  }
  document.getElementById('recipient-count-badge').textContent =
    `${uniqueCount()} Unique Recipients`;
}

function setTab(which) {
  const manual = which === 'manual';
  const tabManual = document.getElementById('tab-manual');
  const tabBulk = document.getElementById('tab-bulk');
  tabManual.classList.remove(...TAB_ON, ...TAB_OFF);
  tabBulk.classList.remove(...TAB_ON, ...TAB_OFF);
  tabManual.classList.add(...(manual ? TAB_ON : TAB_OFF));
  tabBulk.classList.add(...(manual ? TAB_OFF : TAB_ON));
  document.getElementById('panel-manual').classList.toggle('hidden', !manual);
  const bulk = document.getElementById('panel-bulk');
  bulk.classList.toggle('hidden', manual);
  bulk.classList.toggle('flex', !manual);
}

function addMany(rawParts) {
  const bad = [];
  for (const raw of rawParts) {
    const phone = raw.trim();
    if (!phone) continue;
    if (!E164.test(phone)) {
      bad.push(phone);
      continue;
    }
    if (!recipients.includes(phone)) recipients.push(phone);
  }
  const errEl = document.getElementById('bulk-errors');
  if (bad.length) {
    errEl.textContent = `Rejected (not E.164): ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? ` +${bad.length - 5} more` : ''}`;
    errEl.classList.remove('hidden');
  } else {
    errEl.classList.add('hidden');
  }
  refresh();
}

document.getElementById('tab-manual').addEventListener('click', () => setTab('manual'));
document.getElementById('tab-bulk').addEventListener('click', () => setTab('bulk'));

document.getElementById('btn-add-contact').addEventListener('click', () => {
  const input = document.getElementById('manual-phone-input');
  addMany([input.value]);
  input.value = '';
});
document.getElementById('manual-phone-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('btn-add-contact').click();
  }
});
document.getElementById('btn-process-bulk').addEventListener('click', () => {
  const area = document.getElementById('bulk-textarea');
  addMany(area.value.split(/[,\n;]+/));
  area.value = '';
  setTab('manual');
});
document.getElementById('btn-clear-all').addEventListener('click', () => {
  recipients.length = 0;
  refresh();
});

nameEl.addEventListener('input', refresh);
smsEl.addEventListener('input', refresh);

const modal = document.getElementById('confirmation-modal');
function openModal() {
  document.getElementById('modal-target-count').textContent =
    `${uniqueCount()} Recipients`;
  document.getElementById('modal-segment-count').textContent = segments();
  document.getElementById('modal-total-credits').textContent = `${cost()} Credits`;
  document.getElementById('submit-error').classList.add('hidden');
  modal.classList.remove('hidden');
}
function closeModal() {
  modal.classList.add('hidden');
}

document.getElementById('btn-trigger-dispatch').addEventListener('click', openModal);
document.getElementById('btn-close-modal').addEventListener('click', closeModal);
document.getElementById('btn-cancel-dispatch').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

document.getElementById('btn-confirm-dispatch').addEventListener('click', async () => {
  const errorEl = document.getElementById('submit-error');
  errorEl.classList.add('hidden');
  const button = document.getElementById('btn-confirm-dispatch');
  button.disabled = true;
  try {
    const key = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
    const campaign = await post(
      '/campaigns',
      {
        name: nameEl.value.trim(),
        message: smsEl.value,
        contacts: [...recipients],
      },
      { 'Idempotency-Key': key },
    );
    redirect(`campaign-status.html?id=${campaign.id}`);
  } catch (err) {
    // A 422 here means the balance moved since the page computed cost
    // (funds spent elsewhere) — surface the backend's exact need/have.
    if (err.status === 422) {
      document.getElementById('error-card-detail').textContent = err.message;
      document.getElementById('error-card-422').classList.remove('hidden');
    } else {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    }
    button.disabled = false;
  }
});

setTab('manual');
await init();
