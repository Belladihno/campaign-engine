import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { get, post, apiBase } from '../api/client';
import type { Campaign, Workspace } from '../api/types';
import { useWorkspaceEvents } from '../api/useWorkspaceEvents';
import { useAuth } from '../auth/useAuth';
import { AppHeader } from '../components/AppHeader';
import { useToast } from '../components/toast';
import { countSegments } from '../utils/sms';
import { formatDate } from '../utils/format';

interface Plan {
  id: string;
  tier: string;
  name: string;
  price: string;
  credits: number;
  blurb: string;
  accent: 'primary' | 'secondary' | 'tertiary';
  badge: string | null;
}

const PLANS: Plan[] = [
  { id: 'plan_starter', tier: 'Tier 1', name: 'Starter Plan', price: '₦1,000', credits: 50, blurb: '₦20.00 per SMS unit. Lightweight tests and sandboxing.', accent: 'primary', badge: null },
  { id: 'plan_growth', tier: 'Tier 2', name: 'Growth Plan', price: '₦2,500', credits: 150, blurb: '₦16.66 per SMS unit. Weekly blasts and segment campaigns.', accent: 'secondary', badge: 'Popular' },
  { id: 'plan_pro', tier: 'Tier 3', name: 'Pro Plan', price: '₦5,000', credits: 350, blurb: '₦14.28 per SMS unit. Maximum throughput for large blasts.', accent: 'tertiary', badge: 'Best Value' },
];

function statusPill(status: Campaign['status']) {
  const base =
    'inline-flex items-center gap-1.5 px-space-sm py-0.5 rounded-full font-code-sm text-code-sm font-medium';
  switch (status) {
    case 'PROCESSING':
      return (
        <span className={`${base} bg-tertiary-container/30 text-tertiary`}>
          <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-ping"></span>
          PROCESSING
        </span>
      );
    case 'SENT':
      return (
        <span className={`${base} bg-surface-container-high text-primary`}>
          SENT
        </span>
      );
    case 'PARTIALLY_SENT':
      return (
        <span className={`${base} bg-tertiary/20 text-tertiary`}>
          PARTIALLY_SENT
        </span>
      );
    case 'FAILED':
      return (
        <span className={`${base} bg-error-container/30 text-error`}>
          FAILED
        </span>
      );
    default:
      return (
        <span className={`${base} bg-surface-container-high text-on-surface-variant`}>
          PENDING
        </span>
      );
  }
}

export function DashboardPage() {
  const { token } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { notify, host: toastHost } = useToast();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [filter, setFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(PLANS[1].id);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  const reloadCampaigns = useCallback(async () => {
    try {
      setCampaigns(await get<Campaign[]>('/campaigns'));
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Request failed.', 'error');
    }
  }, [notify]);

  useEffect(() => {
    get<Workspace>('/workspaces/me')
      .then(setWorkspace)
      .catch((err: unknown) =>
        notify(err instanceof Error ? err.message : 'Request failed.', 'error'),
      );
    void reloadCampaigns();
  }, [reloadCampaigns, notify]);

  useEffect(() => {
    let cancelled = false;
    async function probe() {
      const start = performance.now();
      try {
        const res = await fetch(`${apiBase()}/`);
        if (!res.ok) throw new Error('degraded');
        if (!cancelled) setLatency(Math.round(performance.now() - start));
      } catch {
        if (!cancelled) setLatency(null);
      }
    }
    void probe();
    const timer = setInterval(() => void probe(), 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const live = useWorkspaceEvents(token, {
    onCredit: (data) => {
      if (typeof data.credits === 'number') {
        setWorkspace((w) => (w ? { ...w, credits: data.credits } : w));
        notify(`Credits updated: ${data.credits}`, 'success');
      }
    },
    onCampaign: () => void reloadCampaigns(),
    onContact: () => void reloadCampaigns(),
  });

  // Deep-link from the builder's insufficient-credits card: land with the
  // fund modal already open, then drop the flag so back-nav stays clean.
  useEffect(() => {
    const state = location.state as { openFund?: boolean } | null;
    if (state?.openFund) {
      setModalOpen(true);
      navigate('/dashboard', { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  const filtered = campaigns.filter((c) =>
    c.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  const byStatus: Record<string, number> = {};
  let sent = 0;
  let total = 0;
  for (const c of campaigns) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    sent += c.sentCount || 0;
    total += c.totalContacts || 0;
  }
  const rate = total > 0 ? Math.round((sent / total) * 1000) / 10 : null;

  async function pay() {
    setPayError(null);
    setPaying(true);
    try {
      const { checkoutUrl } = await post<{ checkoutUrl: string }>(
        '/payments/initiate',
        { plan: selectedPlan },
      );
      window.location.href = checkoutUrl;
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Request failed.');
      setPaying(false);
    }
  }

  return (
    <div className="bg-surface font-body-md text-body-md text-on-surface min-h-screen">
      <AppHeader
        status={
          <div className="hidden sm:flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-surface-container-low border border-outline-variant">
            <div className="relative flex h-2 w-2 items-center justify-center">
              <span
                className="absolute inline-flex h-3 w-3 rounded-full bg-secondary opacity-75"
                style={{ display: live ? '' : 'none' }}
              ></span>
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${live ? 'bg-secondary' : 'bg-outline'}`}
              ></span>
            </div>
            <span
              className={`font-code-sm text-code-sm uppercase font-medium ${live ? 'text-secondary' : 'text-on-surface-variant'}`}
            >
              {live ? 'Live' : 'Offline'}
            </span>
          </div>
        }
        actions={
          <div className="hidden lg:flex items-center gap-space-xs bg-surface-container-low border border-outline-variant rounded-lg px-space-sm py-1">
              <span className="font-code-sm text-code-sm text-tertiary">
                {workspace ? `${workspace.credits} Credits` : '0 Credits'}
              </span>
              <button
                className="font-label-md text-label-md bg-surface-container hover:bg-surface-container-high text-on-surface px-space-xs py-0.5 rounded border border-outline-variant transition-colors"
                onClick={() => setModalOpen(true)}
                type="button"
              >
                + Fund
              </button>
            </div>
          }
        />
      <main className="w-full pt-16 bg-surface min-h-[calc(100vh-4rem)]">
        <div className="max-w-[1100px] mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop py-space-md flex flex-col gap-space-md">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-sm bg-surface-container-low px-space-md py-space-sm rounded-xl">
            <div className="flex items-center gap-space-sm">
              <span className="relative flex h-2 w-2">
                <span
                  className="absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"
                  style={{ display: live ? '' : 'none', animation: live ? undefined : 'none' }}
                ></span>
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${live ? 'bg-secondary' : 'bg-outline'}`}
                ></span>
              </span>
              <span
                className={`font-code-sm text-code-sm uppercase tracking-wider ${live ? 'text-secondary' : 'text-outline'}`}
              >
                {live ? 'Live Stream Connected' : 'Stream Disconnected'}
              </span>
              <span className="font-code-sm text-code-sm text-on-surface-variant hidden md:inline">
                workspace:{' '}
                <span className="text-on-surface">
                  {workspace ? `ws_${workspace.id.slice(0, 8)}` : '—'}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-space-md font-code-sm text-code-sm text-on-surface-variant">
              <span>
                LATENCY:{' '}
                <span className="text-on-surface font-medium">
                  {latency === null ? '—' : `${latency}ms`}
                </span>
              </span>
              <span>{campaigns.length} RUNS</span>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
            <div className="flex flex-col gap-space-xs">
              <div className="flex items-center gap-space-sm">
                <span className="font-code-sm text-code-sm text-primary uppercase tracking-widest font-medium">
                  SMS Dispatch Console
                </span>
                <span className="font-code-sm text-code-sm px-space-xs py-0.5 rounded bg-surface-container-high text-on-surface-variant">
                  ID: {workspace ? workspace.id : '—'}
                </span>
              </div>
              <h2 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">
                {workspace ? workspace.name : 'Loading…'}
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Fund credits, dispatch campaigns, and watch delivery land live.
              </p>
            </div>
            <div className="flex items-center gap-space-sm shrink-0">
              <button
                className="flex items-center gap-space-xs bg-surface-container hover:bg-surface-container-high text-on-surface px-space-md py-space-sm rounded-lg transition-colors font-label-lg text-label-lg shadow-sm"
                onClick={() => setModalOpen(true)}
                type="button"
              >
                <span className="material-symbols-outlined text-primary text-[20px]">
                  account_balance_wallet
                </span>
                <span>Recharge Paystack</span>
              </button>
              <Link
                className="flex items-center gap-space-xs bg-primary-container hover:opacity-95 text-on-primary-container px-space-lg py-space-sm rounded-lg font-label-lg text-label-lg font-semibold transition-all shadow-md"
                to="/campaign-new"
              >
                <span className="material-symbols-outlined text-[20px]">send</span>
                <span>+ New Campaign</span>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
            <div className="flex flex-col justify-between p-space-lg rounded-xl bg-surface-container-low shadow-sm relative overflow-hidden">
              <div className="flex items-start justify-between">
                <div className="flex flex-col">
                  <span className="font-code-sm text-code-sm text-on-surface-variant uppercase tracking-wider">
                    Available Capacity
                  </span>
                  <span className="font-label-lg text-label-lg text-on-surface font-medium">
                    Credit Balance
                  </span>
                </div>
                <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[22px]">
                    flash_on
                  </span>
                </div>
              </div>
              <div className="my-space-md flex flex-col">
                <div className="flex items-baseline gap-space-xs">
                  <span className="font-headline-xl text-headline-xl text-on-surface font-code-lg tracking-tight">
                    {workspace ? workspace.credits : '—'}
                  </span>
                  <span className="font-code-md text-code-md text-on-surface-variant">
                    SMS CREDITS
                  </span>
                </div>
                <div className="flex items-center gap-space-xs mt-space-xs text-secondary font-code-sm text-code-sm">
                  <span className="material-symbols-outlined text-[14px]">sync</span>
                  <span>Real-time SSE sync active</span>
                </div>
              </div>
              <div className="pt-space-sm flex items-center justify-between">
                <button
                  className="flex items-center gap-space-xs bg-primary hover:bg-primary-fixed-dim text-on-primary font-label-md text-label-md px-space-md py-space-xs rounded-lg transition-colors font-semibold"
                  onClick={() => setModalOpen(true)}
                  type="button"
                >
                  <span>Fund Credits</span>
                  <span className="material-symbols-outlined text-[16px]">
                    arrow_forward
                  </span>
                </button>
                <span className="font-code-sm text-code-sm text-on-surface-variant">
                  via Paystack API
                </span>
              </div>
            </div>

            <div className="flex flex-col justify-between p-space-lg rounded-xl bg-surface-container-low shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex flex-col">
                  <span className="font-code-sm text-code-sm text-on-surface-variant uppercase tracking-wider">
                    Total Throughput
                  </span>
                  <span className="font-label-lg text-label-lg text-on-surface font-medium">
                    Campaigns Dispatched
                  </span>
                </div>
                <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-secondary">
                  <span className="material-symbols-outlined text-[22px]">
                    campaign
                  </span>
                </div>
              </div>
              <div className="my-space-md flex flex-col">
                <div className="flex items-baseline gap-space-xs">
                  <span className="font-headline-xl text-headline-xl text-on-surface font-code-lg tracking-tight">
                    {campaigns.length}
                  </span>
                  <span className="font-code-md text-code-md text-on-surface-variant">
                    DISPATCH RUNS
                  </span>
                </div>
                <div className="flex items-center gap-space-sm mt-space-xs font-code-sm text-code-sm">
                  {Object.keys(byStatus).length === 0 ? (
                    <span className="text-on-surface-variant">No runs yet</span>
                  ) : (
                    Object.entries(byStatus).map(([status, n], i, arr) => (
                      <span key={status} className="flex items-center gap-space-sm">
                        <span
                          className={`font-medium ${
                            status === 'FAILED'
                              ? 'text-error'
                              : status === 'PROCESSING'
                                ? 'text-tertiary'
                                : status === 'PENDING'
                                  ? 'text-on-surface-variant'
                                  : 'text-secondary'
                          }`}
                        >
                          {n} {status.replace('_', ' ')}
                        </span>
                        {i < arr.length - 1 && (
                          <span className="text-on-surface-variant">•</span>
                        )}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="pt-space-sm flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant">
                <span>Queue: BullMQ delivery</span>
                <span className="font-code-sm text-code-sm text-on-surface">
                  async dispatch
                </span>
              </div>
            </div>

            <div className="flex flex-col justify-between p-space-lg rounded-xl bg-surface-container-low shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex flex-col">
                  <span className="font-code-sm text-code-sm text-on-surface-variant uppercase tracking-wider">
                    Dispatch Telemetry
                  </span>
                  <span className="font-label-lg text-label-lg text-on-surface font-medium">
                    Dispatch Rate
                  </span>
                </div>
                <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-secondary">
                  <span className="material-symbols-outlined text-[22px]">
                    verified
                  </span>
                </div>
              </div>
              <div className="my-space-md flex flex-col">
                <div className="flex items-baseline gap-space-xs">
                  <span className="font-headline-xl text-headline-xl text-secondary font-code-lg tracking-tight">
                    {rate === null ? '—' : `${rate}%`}
                  </span>
                  <span className="font-code-sm text-code-sm text-secondary font-medium">
                    SENT / QUEUED
                  </span>
                </div>
                <div className="mt-space-xs font-code-sm text-code-sm text-on-surface-variant">
                  {rate === null
                    ? 'No traffic yet'
                    : `${sent.toLocaleString()} of ${total.toLocaleString()} contacts dispatched`}
                </div>
              </div>
              <div className="pt-space-sm">
                <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-secondary h-full rounded-full transition-all"
                    style={{ width: rate === null ? '0%' : `${rate}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-low p-space-md rounded-xl flex flex-col md:flex-row items-center justify-between gap-space-md">
            <div className="flex items-center gap-space-md">
              <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
                <span className="material-symbols-outlined text-[18px]">dns</span>
              </div>
              <div className="flex flex-col">
                <span className="font-label-md text-label-md text-on-surface font-medium">
                  Africa's Talking SMS Gateway
                </span>
                <span className="font-code-sm text-code-sm text-on-surface-variant">
                  Sandbox trunk · ≤10 msg/sec enforced · receipts via webhook
                </span>
              </div>
            </div>
            <div className="flex items-end gap-1 h-7" aria-hidden="true">
              {[3, 4, 6, 5, 2, 5, 7, 6, 4, 5, 6, 3].map((h, i) => (
                <span
                  key={i}
                  className={`w-1.5 rounded-t ${i === 6 ? 'bg-primary' : 'bg-secondary/60'}`}
                  style={{ height: `${h * 4}px` }}
                ></span>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-sm pt-space-xs">
            <div className="flex items-center gap-space-sm">
              <h3 className="font-headline-md text-headline-md text-on-surface">
                Recent Campaigns
              </h3>
              <span className="font-code-sm text-code-sm px-space-xs py-0.5 rounded bg-surface-container text-on-surface-variant">
                {campaigns.length} showing
              </span>
            </div>
            <div className="flex items-center gap-space-xs w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
                  search
                </span>
                <input
                  className="w-full bg-surface-container-low pl-8 pr-space-sm py-1.5 rounded-lg text-body-sm font-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Filter by campaign name..."
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="hidden md:block overflow-hidden rounded-xl bg-surface-container-low shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container text-on-surface-variant font-code-sm text-code-sm uppercase tracking-wider">
                  <th className="py-space-sm px-space-md">Campaign Name</th>
                  <th className="py-space-sm px-space-md">Status</th>
                  <th className="py-space-sm px-space-md">Recipients</th>
                  <th className="py-space-sm px-space-md">Segments / Cost</th>
                  <th className="py-space-sm px-space-md">Created Date</th>
                  <th className="py-space-sm px-space-md text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container font-body-sm text-body-sm">
                {filtered.map((c) => {
                  const segments = countSegments(c.message || '');
                  const cost = c.totalContacts * segments;
                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-surface-container transition-colors"
                    >
                      <td className="py-space-md px-space-md">
                        <div className="font-label-lg text-label-lg text-on-surface font-medium tracking-tight">
                          {c.name}
                        </div>
                        <div className="font-code-sm text-code-sm text-on-surface-variant">
                          CAMP_{c.id.slice(0, 8)} • {c.message.slice(0, 48)}
                        </div>
                      </td>
                      <td className="py-space-md px-space-md">
                        {statusPill(c.status)}
                      </td>
                      <td className="py-space-md px-space-md font-code-md text-code-md text-on-surface">
                        {c.totalContacts}{' '}
                        <span className="text-on-surface-variant text-code-sm">
                          contacts
                        </span>
                      </td>
                      <td className="py-space-md px-space-md">
                        <div className="font-code-sm text-code-sm text-on-surface">
                          {segments} seg / {cost} cr
                        </div>
                      </td>
                      <td className="py-space-md px-space-md text-on-surface-variant font-code-sm text-code-sm">
                        {formatDate(c.createdAt)}
                      </td>
                      <td className="py-space-md px-space-md text-right">
                        <Link
                          className="inline-flex items-center gap-1 font-label-md text-label-md text-primary hover:text-primary-fixed font-semibold px-space-sm py-1 rounded bg-surface-container transition-colors"
                          to={`/campaign-status?id=${c.id}`}
                        >
                          <span>
                            {c.status === 'PROCESSING' ? 'View Live' : 'Details'}
                          </span>
                          {c.status === 'PROCESSING' && (
                            <span className="material-symbols-outlined text-[16px]">
                              arrow_forward
                            </span>
                          )}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="p-space-md font-body-sm text-body-sm text-on-surface-variant">
                No campaigns yet — create your first one.
              </p>
            )}
          </div>

          <div className="md:hidden flex flex-col gap-space-sm">
            {filtered.map((c) => {
              const cost = c.totalContacts * countSegments(c.message || '');
              return (
                <div
                  key={c.id}
                  className="bg-surface-container-low p-space-md rounded-xl flex flex-col gap-space-sm"
                >
                  <div className="flex items-center justify-between">
                    {statusPill(c.status)}
                    <span className="font-code-sm text-code-sm text-on-surface-variant">
                      {formatDate(c.createdAt)}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-label-lg text-label-lg text-on-surface font-semibold">
                      {c.name}
                    </h4>
                    <span className="font-code-sm text-code-sm text-on-surface-variant">
                      CAMP_{c.id.slice(0, 8)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-body-sm font-body-sm bg-surface-container p-space-sm rounded-lg">
                    <span className="text-on-surface-variant">
                      Recipients:{' '}
                      <strong className="text-on-surface font-code-sm">
                        {c.totalContacts}
                      </strong>
                    </span>
                    <span className="text-on-surface-variant">
                      Cost:{' '}
                      <strong className="text-on-surface font-code-sm">
                        {cost} cr
                      </strong>
                    </span>
                  </div>
                  <Link
                    className="text-center font-label-md text-label-md text-on-primary bg-primary py-space-sm rounded-lg font-semibold"
                    to={`/campaign-status?id=${c.id}`}
                  >
                    View Dispatch →
                  </Link>
                </div>
              );
            })}
          </div>

          <div className="bg-surface-container-low p-space-lg rounded-xl flex flex-col gap-space-md shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
              <div className="flex items-center gap-space-sm">
                <div className="p-2 rounded-lg bg-surface-container text-primary">
                  <span className="material-symbols-outlined text-[24px]">
                    payments
                  </span>
                </div>
                <div>
                  <h3 className="font-headline-md text-headline-md text-on-surface">
                    Paystack Instant Fueling
                  </h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Direct Naira checkout. Webhook-verified instant reload.
                  </p>
                </div>
              </div>
              <span className="font-code-sm text-code-sm px-space-sm py-1 rounded bg-surface-container text-secondary flex items-center gap-1 self-start sm:self-auto">
                <span className="material-symbols-outlined text-[14px]">lock</span>
                HMAC-SHA256 Webhook
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md pt-space-xs">
              {PLANS.map((p) => (
                <div
                  key={p.id}
                  className="bg-surface-container p-space-md rounded-xl flex flex-col justify-between relative hover:bg-surface-container-high transition-colors"
                >
                  {p.badge && (
                    <div
                      className={`absolute -top-3 right-4 px-space-sm py-0.5 rounded-full font-code-sm text-code-sm font-bold uppercase tracking-wider shadow-sm ${
                        p.accent === 'tertiary'
                          ? 'bg-tertiary text-on-tertiary'
                          : 'bg-primary text-on-primary'
                      }`}
                    >
                      {p.badge}
                    </div>
                  )}
                  <div className="flex flex-col gap-space-xs">
                    <span className="font-code-sm text-code-sm text-on-surface-variant uppercase tracking-wider">
                      {p.tier}
                    </span>
                    <h4 className="font-label-lg text-label-lg text-on-surface font-bold">
                      {p.name}
                    </h4>
                    <div className="flex items-baseline gap-space-xs my-space-xs">
                      <span className="font-headline-lg text-headline-lg text-on-surface font-code-lg">
                        {p.price}
                      </span>
                      <span className="font-code-sm text-code-sm text-on-surface-variant">
                        one-time
                      </span>
                    </div>
                    <div className="flex items-center gap-space-xs font-code-sm text-code-sm text-primary font-medium">
                      <span className="material-symbols-outlined text-[16px]">
                        sms
                      </span>
                      <span>→ {p.credits} SMS Credits</span>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">
                      {p.blurb}
                    </p>
                  </div>
                  <button
                    className="mt-space-md w-full bg-surface-container-highest hover:bg-primary hover:text-on-primary text-on-surface font-label-md text-label-md py-space-sm rounded-lg transition-colors font-semibold"
                    onClick={() => {
                      setSelectedPlan(p.id);
                      setPayError(null);
                      setModalOpen(true);
                    }}
                    type="button"
                  >
                    Select {p.name.split(' ')[0]}
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-space-sm bg-surface-container-lowest px-space-md py-space-sm rounded-lg font-code-sm text-code-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-secondary text-[18px]">
                verified_user
              </span>
              <span>
                Credits land automatically via Paystack webhook after checkout.
              </span>
            </div>
          </div>

          {toastHost}
        </div>
      </main>

      {modalOpen && (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-space-md bg-surface-container-lowest/80 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
          role="dialog"
        >
          <div className="w-full max-w-lg bg-surface-container-low rounded-xl p-space-lg shadow-xl flex flex-col gap-space-md relative">
            <button
              className="absolute top-4 right-4 p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
              onClick={() => setModalOpen(false)}
              type="button"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
            <div className="flex items-center gap-space-sm">
              <div className="w-10 h-10 rounded-lg bg-primary-container flex items-center justify-center text-on-primary-container">
                <span className="material-symbols-outlined text-[22px]">bolt</span>
              </div>
              <div>
                <h3 className="font-headline-md text-headline-md text-on-surface">
                  Top-Up SMS Credits
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Select recharge package via secure Paystack gateway.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-space-sm">
              {PLANS.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center justify-between p-space-sm rounded-lg bg-surface-container hover:bg-surface-container-high cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-space-sm">
                    <input
                      checked={selectedPlan === p.id}
                      className="accent-primary"
                      name="modalTier"
                      type="radio"
                      value={p.id}
                      onChange={() => setSelectedPlan(p.id)}
                    />
                    <div>
                      <div className="font-label-md text-label-md text-on-surface font-semibold">
                        {p.name} • {p.credits} Credits
                      </div>
                    </div>
                  </div>
                  <span className="font-code-lg text-code-lg text-on-surface font-bold">
                    {p.price}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex flex-col gap-space-xs pt-space-xs">
              <button
                className="w-full bg-primary hover:bg-primary-fixed-dim text-on-primary py-space-sm rounded-lg font-label-lg text-label-lg font-semibold flex items-center justify-center gap-space-xs transition-colors shadow-md disabled:opacity-60"
                disabled={paying}
                onClick={() => void pay()}
                type="button"
              >
                <span className="material-symbols-outlined text-[20px]">lock</span>
                <span>
                  Proceed with Paystack •{' '}
                  {(PLANS.find((p) => p.id === selectedPlan) || PLANS[0]).price}
                </span>
              </button>
              <span className="font-code-sm text-code-sm text-center text-on-surface-variant">
                You leave for Paystack checkout; credits arrive on webhook.
              </span>
              {payError && (
                <span className="font-code-sm text-code-sm text-center text-error">
                  {payError}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
