/* Live dispatch monitor: campaign counts, recipient feed, SSE terminal. */
import { BASE_URL, get } from './api.js';
import { requireAuth, clearToken, showToast, escapeHtml } from './utils.js';

const token = requireAuth();
if (!token) {
  throw new Error('unreachable');
}

const campaignId = new URLSearchParams(window.location.search).get('id');
if (!campaignId) {
  window.location.href = 'dashboard.html';
}

let contacts = [];
let eventCount = 0;

const PILL = {
  QUEUED: {
    cls: 'bg-surface-container-highest text-on-surface-variant',
    icon: 'schedule',
    detail: 'Waiting in BullMQ queue',
    detailCls: 'text-on-surface-variant',
  },
  SENT: {
    cls: 'bg-primary-container/20 text-primary',
    icon: 'outgoing_mail',
    detail: 'Accepted by AT Gateway',
    detailCls: 'text-primary',
  },
  DELIVERED: {
    cls: 'bg-secondary-container/20 text-secondary',
    icon: 'done_all',
    detail: 'Handset ACK: Delivered to terminal',
    detailCls: 'text-secondary',
  },
  FAILED: {
    cls: 'bg-error-container/30 text-error',
    icon: 'error',
    detail: 'Provider rejected this recipient',
    detailCls: 'text-error',
  },
};

function pill(status) {
  const p = PILL[status] || PILL.QUEUED;
  return `<span class="inline-flex items-center gap-1.5 px-space-sm py-0.5 rounded font-code-sm text-code-sm font-semibold uppercase ${p.cls}"><span class="material-symbols-outlined text-[13px]">${p.icon}</span>${status}</span>`;
}

function timeAgo(iso) {
  if (!iso) return '—';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function stamp() {
  return new Date().toISOString().substring(11, 23);
}

function logTerminal(tag, tagCls, payload) {
  const body = document.getElementById('terminal-body');
  const hint = document.getElementById('term-hint');
  if (hint) hint.remove();
  const row = document.createElement('div');
  row.className = 'flex items-start gap-space-sm';
  const time = document.createElement('span');
  time.className = 'text-on-surface-variant';
  time.textContent = `[${stamp()}]`;
  const label = document.createElement('span');
  label.className = tagCls;
  label.textContent = `${tag}:`;
  const data = document.createElement('span');
  data.className = 'text-on-surface-variant break-all';
  data.textContent = JSON.stringify(payload);
  row.append(time, label, data);
  body.appendChild(row);
  while (body.children.length > 100) body.firstChild.remove();
  body.scrollTop = body.scrollHeight;
  eventCount += 1;
  document.getElementById('event-counter').textContent = eventCount;
}

function counts() {
  const tally = { QUEUED: 0, SENT: 0, DELIVERED: 0, FAILED: 0 };
  for (const c of contacts) {
    if (c.status in tally) tally[c.status] += 1;
  }
  return tally;
}

function setSseStatus(live) {
  document.getElementById('sse-ping').style.display = live ? '' : 'none';
  document.getElementById('sse-dot').className = live
    ? 'relative inline-flex rounded-full h-2 w-2 bg-secondary'
    : 'relative inline-flex rounded-full h-2 w-2 bg-outline';
  document.getElementById('sse-label').textContent = live ? 'Live' : 'Offline';
  document.getElementById('hdr-ping').style.display = live ? '' : 'none';
  document.getElementById('hdr-dot').className = live
    ? 'relative inline-flex rounded-full h-2 w-2 bg-secondary'
    : 'relative inline-flex rounded-full h-2 w-2 bg-outline';
  const hdrLabel = document.getElementById('hdr-label');
  hdrLabel.textContent = live ? 'Live' : 'Offline';
  hdrLabel.className = live
    ? 'font-code-sm text-code-sm text-secondary uppercase font-medium'
    : 'font-code-sm text-code-sm text-on-surface-variant uppercase font-medium';
  document.getElementById('term-state').textContent = live ? 'LISTENING' : 'DISCONNECTED';
}

document.getElementById('logout-btn').addEventListener('click', () => {
  clearToken();
});

function renderHeader(campaign) {
  document.getElementById('campaign-name').textContent = campaign.name;
  document.getElementById('campaign-id-text').textContent = campaign.id;
  const created = new Date(campaign.createdAt);
  document.getElementById('campaign-sub').textContent =
    `Created ${created.toLocaleString()} • ${campaign.totalContacts} recipients • ${campaign.message}`;
  const processing = campaign.status === 'PROCESSING';
  document.getElementById('proc-badge').hidden = !processing;
  if (processing && campaign.totalContacts > 0) {
    const pct = Math.round((campaign.sentCount / campaign.totalContacts) * 100);
    document.getElementById('proc-pct').textContent = `${pct}% In-Flight`;
  }
}

function renderProgress() {
  const tally = counts();
  const total = contacts.length;
  const pct = (n) => (total > 0 ? (n / total) * 100 : 0);
  document.getElementById('sent-total-label').textContent =
    `sent_count: ${tally.SENT + tally.DELIVERED} / total_contacts: ${total}`;
  const done = Math.round(pct(tally.SENT + tally.DELIVERED + tally.FAILED) * 10) / 10;
  document.getElementById('pct-label').textContent = `${done}% Dispatched`;
  document.getElementById('bar-delivered').style.width = `${pct(tally.DELIVERED)}%`;
  document.getElementById('bar-delivered').title = `${tally.DELIVERED} Delivered`;
  document.getElementById('bar-sent').style.width = `${pct(tally.SENT)}%`;
  document.getElementById('bar-sent').title = `${tally.SENT} Sent to Gateway`;
  document.getElementById('bar-queued').style.width = `${pct(tally.QUEUED + tally.FAILED)}%`;
  document.getElementById('legend-delivered').textContent = `Delivered to Handset (${tally.DELIVERED})`;
  document.getElementById('legend-sent').textContent = `Sent (Provider ACK) (${tally.SENT})`;
  document.getElementById('legend-queued').textContent = `Queued in BullMQ (${tally.QUEUED})`;
  document.getElementById('legend-failed').textContent =
    `Failed: ${tally.FAILED}${total > 0 ? ` (${Math.round((tally.FAILED / total) * 10000) / 100}%)` : ''}`;

  document.getElementById('m-total').textContent = total;
  document.getElementById('m-queued').textContent = tally.QUEUED;
  document.getElementById('m-sent').textContent = tally.SENT;
  document.getElementById('m-delivered').textContent = tally.DELIVERED;
  document.getElementById('m-failed').textContent = tally.FAILED;
}

function detailFor(contact) {
  const p = PILL[contact.status] || PILL.QUEUED;
  if (contact.status === 'QUEUED') return { text: p.detail, cls: p.detailCls };
  if (contact.status === 'SENT' && contact.atMessageId) {
    return { text: `Accepted by AT Gateway (${contact.atMessageId})`, cls: p.detailCls };
  }
  return { text: p.detail, cls: p.detailCls };
}

function rowHtml(c, i) {
  const detail = detailFor(c);
  const mid = c.atMessageId
    ? `<span class="font-code-sm text-code-sm text-on-surface-variant bg-surface-container-highest px-space-xs py-0.5 rounded">${escapeHtml(c.atMessageId)}</span>`
    : '<span class="font-code-sm text-code-sm text-on-surface-variant italic">Allocating ID…</span>';
  return `<tr class="${i % 2 === 0 ? 'bg-surface-container-low' : 'bg-surface-container'} hover:bg-surface-container-high transition-colors" id="contact-${c.id}">
    <td class="py-space-md px-space-md">
      <div class="flex items-center gap-space-sm">
        <span class="material-symbols-outlined text-[16px] text-on-surface-variant">phone_iphone</span>
        <span class="font-code-lg text-code-lg text-on-surface font-semibold tracking-wide">${escapeHtml(c.phone)}</span>
      </div>
    </td>
    <td class="py-space-md px-space-md" data-status>${pill(c.status)}</td>
    <td class="py-space-md px-space-md" data-mid>${mid}</td>
    <td class="py-space-md px-space-md"><div class="flex items-center gap-1.5 font-code-sm text-code-sm ${detail.cls}" data-detail><span class="w-1.5 h-1.5 rounded-full bg-current"></span><span>${escapeHtml(detail.text)}</span></div></td>
    <td class="py-space-md px-space-md text-right"><span class="font-code-sm text-code-sm text-on-surface-variant" data-updated>${timeAgo(c.updatedAt)}</span></td>
  </tr>`;
}

function mobileHtml(c) {
  const detail = detailFor(c);
  return `<div class="flex flex-col p-space-md rounded-lg bg-surface-container gap-space-xs" id="m-contact-${c.id}">
    <div class="flex items-center justify-between">
      <span class="font-code-lg text-code-lg text-on-surface font-bold tracking-wide">${escapeHtml(c.phone)}</span>
      <span data-status>${pill(c.status)}</span>
    </div>
    <div class="flex items-center justify-between pt-space-xs font-code-sm text-code-sm">
      <span class="text-on-surface-variant" data-mid>${c.atMessageId ? escapeHtml(c.atMessageId) : '—'}</span>
      <span class="text-on-surface-variant" data-updated>${timeAgo(c.updatedAt)}</span>
    </div>
    <div class="${detail.cls} font-code-sm text-code-sm flex items-center gap-1 pt-1" data-detail>${escapeHtml(detail.text)}</div>
  </div>`;
}

function renderContacts() {
  document.getElementById('contacts-body').innerHTML = contacts
    .map((c, i) => rowHtml(c, i))
    .join('');
  document.getElementById('contacts-mobile').innerHTML = contacts
    .map(mobileHtml)
    .join('');
}

function patchContact(contactId, status, atMessageId) {
  const contact = contacts.find((c) => c.id === contactId);
  if (!contact) return;
  contact.status = status;
  contact.updatedAt = new Date().toISOString();
  if (atMessageId !== undefined) contact.atMessageId = atMessageId;
  for (const row of document.querySelectorAll(`#contact-${contactId}, #m-contact-${contactId}`)) {
    const badge = row.querySelector('[data-status]');
    if (badge) badge.innerHTML = pill(status);
    const detail = detailFor(contact);
    const detailEl = row.querySelector('[data-detail]');
    if (detailEl) {
      detailEl.className = detailEl.className.replace(/text-\S+/g, '').trim();
      detailEl.classList.add(...detail.cls.split(' '));
      const label = detailEl.querySelector('span:last-child');
      if (label) label.textContent = detail.text;
    }
    const mid = row.querySelector('[data-mid]');
    if (mid && contact.atMessageId) mid.textContent = contact.atMessageId;
    const updated = row.querySelector('[data-updated]');
    if (updated) updated.textContent = timeAgo(contact.updatedAt);
  }
  renderProgress();
}

async function load() {
  const campaign = await get(`/campaigns/${campaignId}`);
  contacts = campaign.contacts || [];
  renderHeader(campaign);
  renderContacts();
  renderProgress();
}

async function resync() {
  try {
    await load();
    showToast('Reloaded from API.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function connectSse() {
  const source = new EventSource(
    `${BASE_URL}/campaigns/events?token=${encodeURIComponent(token)}`,
  );
  source.onopen = () => {
    setSseStatus(true);
    logTerminal('STREAM_INIT', 'text-tertiary font-medium', {
      channel: `workspace stream`,
      endpoint: '/campaigns/events',
    });
  };
  source.onerror = () => setSseStatus(false);

  source.addEventListener('campaign_updated', (e) => {
    let data;
    try {
      data = JSON.parse(e.data);
    } catch {
      return;
    }
    if (data.campaignId !== campaignId) return;
    logTerminal('campaign_updated', 'text-tertiary font-medium', data);
    load().catch((err) => showToast(err.message, 'error'));
  });

  source.addEventListener('contact_updated', (e) => {
    let data;
    try {
      data = JSON.parse(e.data);
    } catch {
      return;
    }
    if (data.campaignId !== campaignId) return;
    logTerminal('contact_updated', 'text-secondary font-medium', data);
    patchContact(data.contactId, data.status);
  });
}

document.getElementById('copy-id-btn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(campaignId);
    showToast('Campaign ID copied.', 'success');
  } catch {
    showToast('Copy failed in this browser.', 'error');
  }
});
document.getElementById('resync-btn').addEventListener('click', resync);
document.getElementById('clear-terminal').addEventListener('click', () => {
  document.getElementById('terminal-body').innerHTML =
    '<div class="text-on-surface-variant font-code-sm text-code-sm">[Console flushed. Stream remains listening…]</div>';
  eventCount = 0;
  document.getElementById('event-counter').textContent = '0';
});

try {
  await load();
} catch (err) {
  showToast(err.message, 'error');
}
connectSse();
