import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { get } from '../api/client';
import type { Campaign, Contact } from '../api/types';
import { useWorkspaceEvents } from '../api/useWorkspaceEvents';
import { useAuth } from '../auth/useAuth';
import { AppHeader } from '../components/AppHeader';
import { useToast } from '../components/toast';
import { timeAgo } from '../utils/format';

const PILL_BASE =
  'inline-flex items-center gap-1.5 px-space-sm py-0.5 rounded font-code-sm text-code-sm font-semibold uppercase';

function contactPill(status: Contact['status']) {
  switch (status) {
    case 'DELIVERED':
      return (
        <span className={`${PILL_BASE} bg-secondary-container/20 text-secondary`}>
          <span className="material-symbols-outlined text-[13px]">done_all</span>
          DELIVERED
        </span>
      );
    case 'SENT':
      return (
        <span className={`${PILL_BASE} bg-primary-container/20 text-primary`}>
          <span className="material-symbols-outlined text-[13px]">
            outgoing_mail
          </span>
          SENT
        </span>
      );
    case 'FAILED':
      return (
        <span className={`${PILL_BASE} bg-error-container/30 text-error`}>
          <span className="material-symbols-outlined text-[13px]">error</span>
          FAILED
        </span>
      );
    default:
      return (
        <span className={`${PILL_BASE} bg-surface-container-highest text-on-surface-variant`}>
          <span className="material-symbols-outlined text-[13px]">schedule</span>
          QUEUED
        </span>
      );
  }
}

export function CampaignStatusPage() {
  const { token } = useAuth();
  const [params] = useSearchParams();
  const campaignId = params.get('id');
  const { notify, host: toastHost } = useToast();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [eventCount, setEventCount] = useState(0);
  const [terminal, setTerminal] = useState<
    { time: string; tag: string; tagCls: string; body: string }[]
  >([]);

  const load = useCallback(async () => {
    if (!campaignId) return;
    const full = await get<Campaign>(`/campaigns/${campaignId}`);
    setCampaign(full);
    setContacts(full.contacts || []);
  }, [campaignId]);

  useEffect(() => {
    load().catch((err: unknown) =>
      notify(err instanceof Error ? err.message : 'Request failed.', 'error'),
    );
  }, [load, notify]);

  function logTerminal(tag: string, tagCls: string, payload: unknown) {
    const time = new Date().toISOString().substring(11, 23);
    setTerminal((prev) =>
      [...prev, { time, tag, tagCls, body: JSON.stringify(payload) }].slice(
        -100,
      ),
    );
    setEventCount((n) => n + 1);
  }

  const live = useWorkspaceEvents(token, {
    onCampaign: (data) => {
      if (data.campaignId !== campaignId) return;
      logTerminal('campaign_updated', 'text-tertiary font-medium', data);
      load().catch((err: unknown) =>
        notify(
          err instanceof Error ? err.message : 'Request failed.',
          'error',
        ),
      );
    },
    onContact: (data) => {
      if (data.campaignId !== campaignId) return;
      logTerminal('contact_updated', 'text-secondary font-medium', data);
      setContacts((prev) =>
        prev.map((c) =>
          c.id === data.contactId
            ? { ...c, status: data.status as Contact['status'], updatedAt: new Date().toISOString() }
            : c,
        ),
      );
    },
  });

  if (!campaignId) {
    return (
      <main className="bg-surface text-on-surface min-h-screen flex items-center justify-center">
        <Link className="text-primary" to="/dashboard">
          Back to dashboard
        </Link>
      </main>
    );
  }

  const tally = { QUEUED: 0, SENT: 0, DELIVERED: 0, FAILED: 0 };
  for (const c of contacts) {
    tally[c.status] += 1;
  }
  const total = contacts.length;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  const done = total > 0 ? Math.round(pct(tally.SENT + tally.DELIVERED + tally.FAILED) * 10) / 10 : 0;
  const processing = campaign?.status === 'PROCESSING';

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
            <span className="font-code-sm text-code-sm text-on-surface-variant uppercase font-medium">
              {live ? 'Live' : 'Offline'}
            </span>
          </div>
        }
      />
      <main className="w-full pt-16 bg-surface min-h-[calc(100vh-4rem)]">
        <div className="max-w-[1100px] mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop py-space-md flex flex-col gap-space-md">
          <Link
            className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors inline-flex items-center gap-1 self-start"
            to="/dashboard"
          >
            <span className="material-symbols-outlined text-[16px]">
              arrow_back
            </span>{' '}
            Back to dashboard
          </Link>

          <div className="relative w-full rounded-xl bg-surface-container-low p-space-md md:p-space-lg overflow-hidden shadow-md">
            <div className="absolute -right-24 -top-24 w-96 h-96 bg-primary-container/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-secondary/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-space-md">
              <div className="flex flex-col gap-space-xs">
                <div className="flex flex-wrap items-center gap-space-sm">
                  <span className="font-code-sm text-code-sm text-primary uppercase tracking-wider font-semibold">
                    Mission Telemetry
                  </span>
                  <span className="text-on-surface-variant text-body-sm">•</span>
                  <span className="font-code-sm text-code-sm text-on-surface-variant font-medium">
                    Pipeline: Africa's Talking SMS Gateway
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-space-sm pt-space-xs">
                  <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
                    {campaign ? campaign.name : 'Loading…'}
                  </h1>
                  <div className="flex items-center gap-1.5 px-space-sm py-0.5 rounded bg-surface-container-highest">
                    <span className="font-code-sm text-code-sm text-on-surface-variant">
                      ID
                    </span>
                    <span className="font-code-sm text-code-sm text-on-surface font-semibold">
                      {campaignId}
                    </span>
                    <button
                      className="text-on-surface-variant hover:text-primary transition-colors flex items-center"
                      onClick={() => {
                        navigator.clipboard
                          .writeText(campaignId)
                          .then(() => notify('Campaign ID copied.', 'success'))
                          .catch(() =>
                            notify('Copy failed in this browser.', 'error'),
                          );
                      }}
                      title="Copy UUID"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        content_copy
                      </span>
                    </button>
                  </div>
                </div>
                {campaign && (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {campaign.message} • {campaign.totalContacts} recipients
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-space-sm">
                <div className="flex items-center gap-space-sm px-space-md py-space-sm rounded-lg bg-surface-container">
                  <div className="relative flex h-2.5 w-2.5 items-center justify-center">
                    <span
                      className="absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75 animate-ping"
                      style={{ display: live ? '' : 'none' }}
                    ></span>
                    <span
                      className={`relative inline-flex rounded-full h-2 w-2 ${live ? 'bg-secondary' : 'bg-outline'}`}
                    ></span>
                  </div>
                  <div className="flex flex-col">
                    <span
                      className={`font-label-md text-label-md font-semibold uppercase tracking-wider ${live ? 'text-secondary' : 'text-outline'}`}
                    >
                      {live ? 'Live Stream' : 'Offline'}
                    </span>
                    <span className="font-code-sm text-code-sm text-on-surface-variant">
                      SSE /campaigns/events
                    </span>
                  </div>
                </div>
                {processing && (
                  <div className="relative flex items-center gap-space-sm px-space-md py-space-sm rounded-lg bg-surface-container overflow-hidden">
                    <div className="absolute inset-0 bg-tertiary-container/10 animate-pulse"></div>
                    <span className="material-symbols-outlined text-tertiary text-[20px] animate-spin">
                      autorenew
                    </span>
                    <div className="flex flex-col relative z-10">
                      <span className="font-label-md text-label-md text-tertiary font-bold tracking-widest uppercase">
                        Processing
                      </span>
                      <span className="font-code-sm text-code-sm text-on-surface-variant">
                        {done}% In-Flight
                      </span>
                    </div>
                  </div>
                )}
                <button
                  className="px-space-md py-space-sm rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface font-label-md text-label-md transition-colors flex items-center gap-1.5 shadow-sm"
                  onClick={() =>
                    load().then(
                      () => notify('Reloaded from API.', 'success'),
                      (err: unknown) =>
                        notify(
                          err instanceof Error ? err.message : 'Request failed.',
                          'error',
                        ),
                    )
                  }
                  type="button"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    sync
                  </span>
                  <span>Resync</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col w-full rounded-xl bg-surface-container p-space-md md:p-space-lg gap-space-md shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs">
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-primary-container text-[20px]">
                  swap_calls
                </span>
                <span className="font-headline-md text-headline-md text-on-surface">
                  Dispatch Progress
                </span>
                <span className="font-code-md text-code-md text-on-surface-variant">
                  sent_count: {tally.SENT + tally.DELIVERED} / total_contacts:{' '}
                  {total}
                </span>
              </div>
              <div className="flex items-center gap-space-sm font-code-sm text-code-sm">
                <span className="text-secondary font-semibold">
                  {done}% Dispatched
                </span>
              </div>
            </div>
            <div className="w-full h-3 rounded-full bg-surface-container-lowest overflow-hidden flex p-0.5">
              <div
                className="h-full bg-secondary rounded-l-full transition-all duration-700 ease-out"
                style={{ width: `${pct(tally.DELIVERED)}%` }}
                title={`${tally.DELIVERED} Delivered`}
              ></div>
              <div
                className="h-full bg-primary-container transition-all duration-700 ease-out"
                style={{ width: `${pct(tally.SENT)}%` }}
                title={`${tally.SENT} Sent to Gateway`}
              ></div>
              <div
                className="h-full bg-surface-bright rounded-r-full transition-all duration-700 ease-out"
                style={{ width: `${pct(tally.QUEUED + tally.FAILED)}%` }}
                title={`${tally.QUEUED} Queued`}
              ></div>
            </div>
            <div className="flex flex-wrap items-center gap-x-space-lg gap-y-space-xs font-code-sm text-code-sm pt-space-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-secondary"></span>
                <span className="text-on-surface font-medium">
                  Delivered to Handset ({tally.DELIVERED})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-primary-container"></span>
                <span className="text-on-surface font-medium">
                  Sent (Provider ACK) ({tally.SENT})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-surface-bright"></span>
                <span className="text-on-surface font-medium">
                  Queued in BullMQ ({tally.QUEUED})
                </span>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-error font-medium">
                  Failed: {tally.FAILED}
                  {total > 0
                    ? ` (${Math.round((tally.FAILED / total) * 10000) / 100}%)`
                    : ''}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-space-sm md:gap-space-md">
            {(
              [
                { label: 'Total Target', sub: 'recipients', value: total, cls: 'text-on-surface', icon: 'group' },
                { label: 'Queued', sub: 'waiting', value: tally.QUEUED, cls: 'text-tertiary', icon: 'hourglass_empty' },
                { label: 'Provider ACK', sub: 'accepted', value: tally.SENT, cls: 'text-primary', icon: 'send' },
                { label: 'Delivered', sub: 'receipts', value: tally.DELIVERED, cls: 'text-secondary', icon: 'check_circle' },
                { label: 'Failed', sub: 'errors', value: tally.FAILED, cls: 'text-error', icon: 'error' },
              ] as const
            ).map((m) => (
              <div
                key={m.label}
                className="flex flex-col p-space-md rounded-xl bg-surface-container-low shadow-sm col-span-1"
              >
                <div className="flex items-center justify-between text-on-surface-variant">
                  <span className="font-label-md text-label-md uppercase tracking-wider">
                    {m.label}
                  </span>
                  <span className={`material-symbols-outlined text-[18px] ${m.cls === 'text-on-surface' ? '' : m.cls}`}>
                    {m.icon}
                  </span>
                </div>
                <div className="flex items-baseline gap-space-xs mt-space-sm">
                  <span
                    className={`font-headline-xl text-headline-xl font-bold ${m.cls}`}
                  >
                    {m.value}
                  </span>
                  <span className="font-code-sm text-code-sm text-on-surface-variant">
                    {m.sub}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col w-full rounded-xl bg-surface-container-low overflow-hidden shadow-md">
            <div className="p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm bg-surface-container">
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-primary text-[20px]">
                  dataset
                </span>
                <div>
                  <h2 className="font-headline-md text-headline-md text-on-surface">
                    Recipient Delivery Feed
                  </h2>
                  <p className="font-code-sm text-code-sm text-on-surface-variant">
                    Receipts matched via Africa's Talking webhook
                  </p>
                </div>
              </div>
              <div className="flex items-center px-space-sm py-1 rounded-lg bg-surface-container-lowest font-code-sm text-code-sm text-on-surface-variant">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary inline-block mr-1.5"></span>
                Auto-updates: SSE Push
              </div>
            </div>
            <div className="hidden md:block w-full overflow-x-auto">
              <table className="w-full text-left font-body-md text-body-md border-collapse">
                <thead>
                  <tr className="bg-surface-container-lowest/80 text-on-surface-variant font-code-sm text-code-sm uppercase tracking-wider">
                    <th className="py-space-sm px-space-md">Recipient Phone</th>
                    <th className="py-space-sm px-space-md">Status</th>
                    <th className="py-space-sm px-space-md">AT Message ID</th>
                    <th className="py-space-sm px-space-md">Detail</th>
                    <th className="py-space-sm px-space-md text-right">
                      Last Updated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c, i) => {
                    const detail =
                      c.status === 'DELIVERED'
                        ? {
                            text: 'Handset ACK: Delivered to terminal',
                            cls: 'text-secondary',
                          }
                        : c.status === 'SENT'
                          ? {
                              text: c.atMessageId
                                ? `Accepted by AT Gateway (${c.atMessageId})`
                                : 'Accepted by AT Gateway',
                              cls: 'text-primary',
                            }
                          : c.status === 'FAILED'
                            ? {
                                text: 'Provider rejected this recipient',
                                cls: 'text-error',
                              }
                            : {
                                text: 'Waiting in BullMQ queue',
                                cls: 'text-on-surface-variant',
                              };
                    return (
                      <tr
                        key={c.id}
                        className={`${i % 2 === 0 ? 'bg-surface-container-low' : 'bg-surface-container'} hover:bg-surface-container-high transition-colors`}
                      >
                        <td className="py-space-md px-space-md">
                          <div className="flex items-center gap-space-sm">
                            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                              phone_iphone
                            </span>
                            <span className="font-code-lg text-code-lg text-on-surface font-semibold tracking-wide">
                              {c.phone}
                            </span>
                          </div>
                        </td>
                        <td className="py-space-md px-space-md">
                          {contactPill(c.status)}
                        </td>
                        <td className="py-space-md px-space-md">
                          {c.atMessageId ? (
                            <span className="font-code-sm text-code-sm text-on-surface-variant bg-surface-container-highest px-space-xs py-0.5 rounded">
                              {c.atMessageId}
                            </span>
                          ) : (
                            <span className="font-code-sm text-code-sm text-on-surface-variant italic">
                              Allocating ID…
                            </span>
                          )}
                        </td>
                        <td className="py-space-md px-space-md">
                          <div
                            className={`flex items-center gap-1.5 font-code-sm text-code-sm ${detail.cls}`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                            <span>{detail.text}</span>
                          </div>
                        </td>
                        <td className="py-space-md px-space-md text-right">
                          <span className="font-code-sm text-code-sm text-on-surface-variant">
                            {timeAgo(c.updatedAt)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="md:hidden flex flex-col divide-y-0 p-space-sm gap-space-sm">
              {contacts.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col p-space-md rounded-lg bg-surface-container gap-space-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-code-lg text-code-lg text-on-surface font-bold tracking-wide">
                      {c.phone}
                    </span>
                    {contactPill(c.status)}
                  </div>
                  <div className="flex items-center justify-between pt-space-xs font-code-sm text-code-sm">
                    <span className="text-on-surface-variant">
                      {c.atMessageId || '—'}
                    </span>
                    <span className="text-on-surface-variant">
                      {timeAgo(c.updatedAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col w-full rounded-xl bg-surface-container-lowest p-space-md md:p-space-lg shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs pb-space-sm">
              <div className="flex items-center gap-space-sm">
                <div className="w-3 h-3 rounded-full bg-secondary animate-pulse"></div>
                <span className="font-headline-md text-headline-md text-on-surface">
                  Server-Sent Events Stream
                </span>
                <span className="font-code-sm text-code-sm text-secondary font-mono px-2 py-0.5 rounded bg-secondary-container/10">
                  {live ? 'LISTENING' : 'DISCONNECTED'}
                </span>
              </div>
              <div className="flex items-center gap-space-sm font-code-sm text-code-sm text-on-surface-variant">
                <span>
                  Events Received:{' '}
                  <strong className="text-on-surface">{eventCount}</strong>
                </span>
                <span>•</span>
                <button
                  className="hover:text-primary transition-colors flex items-center gap-1"
                  onClick={() => {
                    setTerminal([]);
                    setEventCount(0);
                  }}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    delete
                  </span>{' '}
                  Clear
                </button>
              </div>
            </div>
            <div className="w-full h-56 overflow-y-auto rounded-lg bg-surface p-space-md font-code-sm text-code-sm space-y-2">
              {terminal.length === 0 && (
                <div className="flex items-start gap-space-sm text-on-surface-variant/70">
                  <span className="text-on-surface-variant">[waiting for stream…]</span>
                </div>
              )}
              {terminal.map((line, i) => (
                <div key={i} className="flex items-start gap-space-sm">
                  <span className="text-on-surface-variant">[{line.time}]</span>
                  <span className={line.tagCls}>{line.tag}:</span>
                  <span className="text-on-surface-variant break-all">
                    {line.body}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-space-sm text-on-surface-variant font-code-sm text-code-sm">
              <div className="flex items-center gap-space-md">
                <span>Protocol: Server-Sent Events</span>
                <span>Endpoint: /campaigns/events</span>
              </div>
            </div>
          </div>
        </div>
      </main>
      {toastHost}
    </div>
  );
}
