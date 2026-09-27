/* Workspace overview on the Stitch dashboard: live credits, dispatch
   metrics from real campaign data, filterable table, Paystack tiers. */
import { BASE_URL, get, post } from './api.js';
import { countSegments } from './sms.js';
import {
  requireAuth,
  clearToken,
  showToast,
  formatDate,
  escapeHtml,
} from './utils.js';

const token = requireAuth();
if (!token) {
  throw new Error('unreachable');
}

const PLANS = [
  { id: 'plan_starter', tier: 'Tier 1', name: 'Starter Plan', price: '₦1,000', credits: 50, blurb: '₦20.00 per SMS unit. Lightweight tests and sandboxing.', accent: 'primary', badge: null },
  { id: 'plan_growth', tier: 'Tier 2', name: 'Growth Plan', price: '₦2,500', credits: 150, blurb: '₦16.66 per SMS unit. Weekly blasts and segment campaigns.', accent: 'secondary', badge: 'Popular' },
  { id: 'plan_pro', tier: 'Tier 3', name: 'Pro Plan', price: '₦5,000', credits: 350, blurb: '₦14.28 per SMS unit. Maximum throughput for large blasts.', accent: 'tertiary', badge: 'Best Value' },
];

let campaigns = [];
let selectedPlan = PLANS[1].id;

function statusPill(status) {
  const base =
    'inline-flex items-center gap-1.5 px-space-sm py-0.5 rounded-full font-code-sm text-code-sm font-medium';
  switch (status) {
    case 'PROCESSING':
      return `<span class="${base} bg-tertiary-container/30 text-tertiary"><span class="w-1.5 h-1.5 rounded-full bg-tertiary animate-ping"></span>PROCESSING</span>`;
    case 'SENT':
      return `<span class="${base} bg-surface-container-high text-primary">SENT</span>`;
    case 'PARTIALLY_SENT':
      return `<span class="${base} bg-tertiary/20 text-tertiary">PARTIALLY_SENT</span>`;
    case 'FAILED':
      return `<span class="${base} bg-error-container/30 text-error">FAILED</span>`;
    default:
      return `<span class="${base} bg-surface-container-high text-on-surface-variant">PENDING</span>`;
  }
}

function shortId(id) {
  return id ? id.slice(0, 8) : '';
}

function costOf(campaign) {
  const segments = countSegments(campaign.message || '');
  return { segments, cost: campaign.totalContacts * segments };
}

function renderWorkspace(workspace) {
  document.getElementById('workspace-name').textContent = workspace.name;
  document.getElementById('workspace-short').textContent =
    `ws_${workspace.id.slice(0, 8)}`;
  document.getElementById('workspace-id-chip').textContent =
    `ID: ${workspace.id}`;
  document.getElementById('credits-big').textContent = workspace.credits;
  document.getElementById('hdr-credits').textContent =
    `${workspace.credits} Credits`;
}

function renderMetrics() {
  document.getElementById('campaign-total').textContent = campaigns.length;
  document.getElementById('campaign-count').textContent =
    `${campaigns.length} showing`;
  document.getElementById('campaign-count-label').textContent =
    `${campaigns.length} RUNS`;
  document.getElementById('last-run').textContent =
    campaigns.length > 0 ? formatDate(campaigns[0].createdAt) : '—';

  const byStatus = {};
  let sent = 0;
  let total = 0;
  for (const c of campaigns) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    sent += c.sentCount || 0;
    total += c.totalContacts || 0;
  }
  const breakdown = document.getElementById('campaign-breakdown');
  const parts = Object.entries(byStatus).map(([status, n]) => {
    const color =
      status === 'FAILED'
        ? 'text-error'
        : status === 'PROCESSING'
          ? 'text-tertiary'
          : status === 'PENDING'
            ? 'text-on-surface-variant'
            : 'text-secondary';
    return `<span class="${color} font-medium">${n} ${status.replace('_', ' ')}</span>`;
  });
  breakdown.innerHTML = parts.length
    ? parts.join('<span class="text-on-surface-variant">•</span>')
    : '<span class="text-on-surface-variant">No runs yet</span>';

  const rate = total > 0 ? Math.round((sent / total) * 1000) / 10 : null;
  document.getElementById('dispatch-rate').textContent =
    rate === null ? '—' : `${rate}%`;
  document.getElementById('dispatch-detail').textContent =
    rate === null
      ? 'No traffic yet'
      : `${sent.toLocaleString()} of ${total.toLocaleString()} contacts dispatched`;
  document.getElementById('dispatch-bar').style.width =
    rate === null ? '0%' : `${rate}%`;
}

function rowHtml(c) {
  const { segments, cost } = costOf(c);
  const preview = escapeHtml((c.message || '').slice(0, 48));
  const live =
    c.status === 'PROCESSING'
      ? `<a class="inline-flex items-center gap-1 font-label-md text-label-md text-primary hover:text-primary-fixed font-semibold px-space-sm py-1 rounded bg-surface-container transition-colors" href="campaign-status.html?id=${c.id}"><span>View Live</span><span class="material-symbols-outlined text-[16px]">arrow_forward</span></a>`
      : `<a class="font-label-md text-label-md text-on-surface hover:text-primary px-space-sm py-1 rounded bg-surface-container transition-colors" href="campaign-status.html?id=${c.id}">Details</a>`;
  return `<tr class="hover:bg-surface-container transition-colors">
    <td class="py-space-md px-space-md">
      <div class="font-label-lg text-label-lg text-on-surface font-medium tracking-tight">${escapeHtml(c.name)}</div>
      <div class="font-code-sm text-code-sm text-on-surface-variant">CAMP_${shortId(c.id)} • ${preview}</div>
    </td>
    <td class="py-space-md px-space-md">${statusPill(c.status)}</td>
    <td class="py-space-md px-space-md font-code-md text-code-md text-on-surface">${c.totalContacts} <span class="text-on-surface-variant text-code-sm">contacts</span></td>
    <td class="py-space-md px-space-md"><div class="font-code-sm text-code-sm text-on-surface">${segments} seg / ${cost} cr</div></td>
    <td class="py-space-md px-space-md text-on-surface-variant font-code-sm text-code-sm">${formatDate(c.createdAt)}</td>
    <td class="py-space-md px-space-md text-right">${live}</td>
  </tr>`;
}

function mobileCardHtml(c) {
  const { cost } = costOf(c);
  return `<div class="bg-surface-container-low p-space-md rounded-xl flex flex-col gap-space-sm">
    <div class="flex items-center justify-between">
      ${statusPill(c.status)}
      <span class="font-code-sm text-code-sm text-on-surface-variant">${formatDate(c.createdAt)}</span>
    </div>
    <div>
      <h4 class="font-label-lg text-label-lg text-on-surface font-semibold">${escapeHtml(c.name)}</h4>
      <span class="font-code-sm text-code-sm text-on-surface-variant">CAMP_${shortId(c.id)}</span>
    </div>
    <div class="flex items-center justify-between text-body-sm font-body-sm bg-surface-container p-space-sm rounded-lg">
      <span class="text-on-surface-variant">Recipients: <strong class="text-on-surface font-code-sm">${c.totalContacts}</strong></span>
      <span class="text-on-surface-variant">Cost: <strong class="text-on-surface font-code-sm">${cost} cr</strong></span>
    </div>
    <a class="text-center font-label-md text-label-md text-on-primary bg-primary py-space-sm rounded-lg font-semibold" href="campaign-status.html?id=${c.id}">View Dispatch →</a>
  </div>`;
}

function renderCampaigns() {
  const query = document
    .getElementById('campaign-filter')
    .value.trim()
    .toLowerCase();
  const filtered = campaigns.filter((c) =>
    c.name.toLowerCase().includes(query),
  );
  const body = document.getElementById('campaigns-body');
  body.innerHTML = filtered.map(rowHtml).join('');
  document.getElementById('campaigns-empty').hidden = filtered.length > 0;
  document.getElementById('campaigns-mobile').innerHTML =
    filtered.map(mobileCardHtml).join('');
}

async function reloadCampaigns() {
  try {
    campaigns = await get('/campaigns');
    renderMetrics();
    renderCampaigns();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function setSseStatus(live) {  document.getElementById('sse-dot').className = live
    ? 'relative inline-flex rounded-full h-2 w-2 bg-secondary'
    : 'relative inline-flex rounded-full h-2 w-2 bg-outline';
  document.getElementById('sse-ping').style.display = live ? '' : 'none';
  const label = document.getElementById('sse-label');
  label.textContent = live ? 'Live Stream Connected' : 'Stream Disconnected';
  label.className = live
    ? 'font-code-sm text-code-sm text-secondary uppercase tracking-wider'
    : 'font-code-sm text-code-sm text-outline uppercase tracking-wider';
  document.getElementById('hdr-ping').style.display = live ? '' : 'none';
  document.getElementById('hdr-dot').className = live
    ? 'relative inline-flex rounded-full h-2 w-2 bg-secondary'
    : 'relative inline-flex rounded-full h-2 w-2 bg-outline';
  const hdrLabel = document.getElementById('hdr-label');
  hdrLabel.textContent = live ? 'Live' : 'Offline';
  hdrLabel.className = live
    ? 'font-code-sm text-code-sm text-secondary uppercase font-medium'
    : 'font-code-sm text-code-sm text-on-surface-variant uppercase font-medium';
}

// Honest latency: round-trip of the public hello route, refreshed
// periodically. Dashes when the API is unreachable.
async function probeLatency() {
  const el = document.getElementById('latency-label');
  const start = performance.now();
  try {
    const res = await fetch(`${BASE_URL}/`);
    if (!res.ok) throw new Error('degraded');
    const ms = Math.round(performance.now() - start);
    el.innerHTML = `LATENCY: <span class="text-secondary font-medium">${ms}ms</span>`;
  } catch {
    el.innerHTML = 'LATENCY: <span class="text-on-surface font-medium">—</span>';
  }
}

function connectSse() {
  const source = new EventSource(
    `${BASE_URL}/campaigns/events?token=${encodeURIComponent(token)}`,
  );
  source.onopen = () => setSseStatus(true);
  source.onerror = () => setSseStatus(false);
  source.addEventListener('credit_updated', (e) => {
    try {
      const { credits } = JSON.parse(e.data);
      if (typeof credits === 'number') {
        document.getElementById('credits-big').textContent = credits;
        document.getElementById('hdr-credits').textContent =
          `${credits} Credits`;
        showToast(`Credits updated: ${credits}`, 'success');
      }
    } catch {
      /* ignore malformed frames */
    }
  });
  const refresh = () => reloadCampaigns();
  source.addEventListener('campaign_updated', refresh);
  source.addEventListener('contact_updated', refresh);
}

function renderTiers() {
  const list = document.getElementById('tier-list');
  list.innerHTML = PLANS.map(
    (p) => `<div class="bg-surface-container p-space-md rounded-xl flex flex-col justify-between relative hover:bg-surface-container-high transition-colors">
      ${p.badge ? `<div class="absolute -top-3 right-4 px-space-sm py-0.5 rounded-full ${p.accent === 'tertiary' ? 'bg-tertiary text-on-tertiary' : 'bg-primary text-on-primary'} font-code-sm text-code-sm font-bold uppercase tracking-wider shadow-sm">${p.badge}</div>` : ''}
      <div class="flex flex-col gap-space-xs">
        <span class="font-code-sm text-code-sm text-on-surface-variant uppercase tracking-wider">${p.tier}</span>
        <h4 class="font-label-lg text-label-lg text-on-surface font-bold">${p.name}</h4>
        <div class="flex items-baseline gap-space-xs my-space-xs">
          <span class="font-headline-lg text-headline-lg text-on-surface font-code-lg">${p.price}</span>
          <span class="font-code-sm text-code-sm text-on-surface-variant">one-time</span>
        </div>
        <div class="flex items-center gap-space-xs font-code-sm text-code-sm text-primary font-medium">
          <span class="material-symbols-outlined text-[16px]">sms</span>
          <span>→ ${p.credits} SMS Credits</span>
        </div>
        <p class="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">${p.blurb}</p>
      </div>
      <button class="tierSelectBtn mt-space-md w-full bg-surface-container-highest hover:bg-primary hover:text-on-primary text-on-surface font-label-md text-label-md py-space-sm rounded-lg transition-colors font-semibold" data-plan="${p.id}" type="button">Select ${p.name.split(' ')[0]}</button>
    </div>`,
  ).join('');
  list.querySelectorAll('.tierSelectBtn').forEach((btn) => {
    btn.addEventListener('click', () => openModal(btn.dataset.plan));
  });
}

function renderModalTiers() {
  const wrap = document.getElementById('modal-tiers');
  wrap.innerHTML = PLANS.map(
    (p, i) => `<label class="flex items-center justify-between p-space-sm rounded-lg bg-surface-container hover:bg-surface-container-high cursor-pointer transition-colors">
      <div class="flex items-center gap-space-sm">
        <input class="accent-primary" name="modalTier" type="radio" value="${p.id}"${i === 1 ? ' checked' : ''} />
        <div>
          <div class="font-label-md text-label-md text-on-surface font-semibold">${p.name} • ${p.credits} Credits</div>
        </div>
      </div>
      <span class="font-code-lg text-code-lg text-on-surface font-bold">${p.price}</span>
    </label>`,
  ).join('');
  wrap.querySelectorAll('input[name="modalTier"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      selectedPlan = radio.value;
      updatePayLabel();
    });
  });
}

function updatePayLabel() {
  const plan = PLANS.find((p) => p.id === selectedPlan) || PLANS[0];
  document.getElementById('payBtnLabel').textContent =
    `Proceed with Paystack • ${plan.price}`;
}

function openModal(planId) {
  if (planId) {
    selectedPlan = planId;
    document
      .querySelectorAll('input[name="modalTier"]')
      .forEach((r) => {
        r.checked = r.value === planId;
      });
    updatePayLabel();
  }
  document.getElementById('pay-error').classList.add('hidden');
  document.getElementById('paystackModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('paystackModal').classList.add('hidden');
}

async function pay() {
  const errorEl = document.getElementById('pay-error');
  errorEl.classList.add('hidden');
  const button = document.getElementById('payBtn');
  button.disabled = true;
  try {
    const { checkoutUrl } = await post('/payments/initiate', {
      plan: selectedPlan,
    });
    window.location.href = checkoutUrl;
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
    button.disabled = false;
  }
}

document.getElementById('logout-btn').addEventListener('click', () => {
  clearToken();
});
document.getElementById('openModalBtn').addEventListener('click', () => openModal());
document.getElementById('fundBtnTrigger').addEventListener('click', () => openModal());
document.getElementById('hdr-fund').addEventListener('click', () => openModal());
document.getElementById('closeModalBtn').addEventListener('click', closeModal);
document.getElementById('paystackModal').addEventListener('click', (e) => {
  if (e.target.id === 'paystackModal') closeModal();
});
document.getElementById('payBtn').addEventListener('click', pay);
document.getElementById('campaign-filter').addEventListener('input', renderCampaigns);

renderTiers();
renderModalTiers();
updatePayLabel();
probeLatency();
setInterval(probeLatency, 15000);
try {
  const workspace = await get('/workspaces/me');
  renderWorkspace(workspace);
  await reloadCampaigns();
} catch (err) {
  showToast(err.message, 'error');
}
connectSse();
