import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiBase, get, post } from '../api/client';
import type { Campaign, Workspace } from '../api/types';
import { AppHeader } from '../components/AppHeader';
import { useToast } from '../components/toast';
import { countSegments, detectEncoding } from '../utils/sms';

const E164 = /^\+[1-9]\d{7,14}$/;

const TAB_ON = ['bg-surface-container-high', 'text-on-surface', 'shadow-sm'];
const TAB_OFF = ['text-on-surface-variant'];

export function CampaignNewPage() {
  const navigate = useNavigate();
  const { notify, host: toastHost } = useToast();

  const [balance, setBalance] = useState(0);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [tab, setTab] = useState<'manual' | 'bulk'>('manual');
  const [manual, setManual] = useState('');
  const [bulk, setBulk] = useState('');
  const [bulkErrors, setBulkErrors] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [apiProbe, setApiProbe] = useState<boolean | null>(null);
  const [clock, setClock] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });

  useEffect(() => {
    get<Workspace>('/workspaces/me')
      .then((w) => setBalance(w.credits))
      .catch((err: unknown) =>
        notify(err instanceof Error ? err.message : 'Request failed.', 'error'),
      );
    fetch(`${apiBase()}/`)
      .then((res) => setApiProbe(res.ok))
      .catch(() => setApiProbe(false));
  }, [notify]);

  const unique = [...new Set(recipients)];
  const segments = countSegments(message);
  const unicode = detectEncoding(message) === 'unicode';
  const cost = unique.length * segments;
  const valid =
    name.trim().length > 0 &&
    message.length > 0 &&
    recipients.length > 0 &&
    cost <= balance;
  // Client-side insufficiency, or a submit that failed after the balance
  // moved (the backend message carries the exact need/have).
  const blocked = cost > balance && recipients.length > 0;
  const showError = blocked || submitError !== null;

  function tick() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  useEffect(() => {
    const timer = setInterval(() => setClock(tick()), 20000);
    return () => clearInterval(timer);
  }, []);

  function addMany(parts: string[]) {
    const bad: string[] = [];
    setRecipients((prev) => {
      const next = [...prev];
      for (const raw of parts) {
        const phone = raw.trim();
        if (!phone) continue;
        if (!E164.test(phone)) {
          bad.push(phone);
          continue;
        }
        if (!next.includes(phone)) next.push(phone);
      }
      return next;
    });
    setBulkErrors(
      bad.length
        ? `Rejected (not E.164): ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? ` +${bad.length - 5} more` : ''}`
        : null,
    );
  }

  async function dispatch() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const key =
        globalThis.crypto?.randomUUID?.() ?? String(Date.now());
      const campaign = await post<Campaign>(
        '/campaigns',
        { name: name.trim(), message, contacts: recipients },
        { 'Idempotency-Key': key },
      );
      navigate(`/campaign-status?id=${campaign.id}`);
    } catch (err) {
      // A 422 here means the balance moved since the page computed cost —
      // the message carries the exact need/have.
      setSubmitError(err instanceof Error ? err.message : 'Request failed.');
      setConfirmOpen(false);
      setSubmitting(false);
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
                style={{ display: apiProbe ? '' : 'none' }}
              ></span>
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${apiProbe ? 'bg-secondary' : 'bg-outline'}`}
              ></span>
            </div>
            <span className="font-code-sm text-code-sm text-on-surface-variant uppercase font-medium">
              {apiProbe === null ? 'Offline' : apiProbe ? 'API Online' : 'API Offline'}
            </span>
          </div>
        }
        actions={
          <div className="hidden lg:flex items-center gap-space-xs bg-surface-container-low border border-outline-variant rounded-lg px-space-sm py-1">
            <span className="font-code-sm text-code-sm text-tertiary">
              {balance} Credits
            </span>
          </div>
        }
      />
      <main className="w-full pt-16 bg-surface min-h-[calc(100vh-4rem)]">
        <div className="max-w-[1100px] mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop py-space-md flex flex-col gap-space-md">
          <button
            className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors inline-flex items-center gap-1 self-start"
            onClick={() => navigate('/dashboard')}
            type="button"
          >
            <span className="material-symbols-outlined text-[16px]">
              arrow_back
            </span>{' '}
            Back to dashboard
          </button>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-sm">
            <div>
              <div className="flex items-center gap-space-xs font-code-sm text-code-sm text-tertiary uppercase tracking-wider mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                <span>Pipeline Builder</span>
              </div>
              <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
                Campaign Creation Console
              </h1>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Configure message, recipients, and cost before live queue
                commitment.
              </p>
            </div>
            <div className="flex items-center gap-space-sm">
              <span className="font-code-sm text-code-sm px-space-sm py-1 bg-surface-container-high text-secondary rounded flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-ping"></span>{' '}
                API
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-desktop items-start">
            <div className="lg:col-span-7 flex flex-col gap-space-md">
              <div className="bg-surface-container p-space-md md:p-space-lg rounded-xl shadow-md">
                <div className="flex flex-col items-start sm:flex-row sm:items-center sm:justify-between gap-space-xs pb-space-sm mb-space-md">
                  <div className="flex items-center gap-space-xs">
                    <span className="font-code-sm text-code-sm px-space-xs py-0.5 rounded bg-surface-container-highest text-primary">
                      01
                    </span>
                    <h2 className="font-headline-md text-headline-md text-on-surface">
                      Campaign Parameters
                    </h2>
                  </div>
                  <span className="font-code-sm text-code-sm text-on-surface-variant">
                    {message.length === 0
                      ? 'GSM-7 Standard'
                      : unicode
                        ? 'Unicode (UCS-2)'
                        : 'GSM-7 Standard'}
                  </span>
                </div>
                <div className="flex flex-col gap-space-md">
                  <div>
                    <label
                      className="block font-label-lg text-label-lg text-on-surface mb-1"
                      htmlFor="campaign-name"
                    >
                      Campaign Identifier
                    </label>
                    <input
                      className="w-full bg-surface-container-low text-on-surface px-space-md py-space-sm rounded-lg font-body-md text-body-md focus:outline-none focus:bg-surface-container-high transition-colors"
                      id="campaign-name"
                      maxLength={100}
                      placeholder="e.g. Flash Sale Alert — Cohort A"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label
                        className="font-label-lg text-label-lg text-on-surface"
                        htmlFor="sms-content"
                      >
                        SMS Message Content
                      </label>
                      <span className="font-code-sm text-code-sm text-secondary bg-surface-container-highest px-space-xs py-0.5 rounded">
                        {unicode ? 'UCS-2' : 'GSM-7'}
                      </span>
                    </div>
                    <textarea
                      className="w-full bg-surface-container-low text-on-surface px-space-md py-space-sm rounded-lg font-code-md text-code-md focus:outline-none focus:bg-surface-container-high transition-colors resize-y"
                      id="sms-content"
                      maxLength={160}
                      rows={4}
                      placeholder="Hello! Our sale starts Friday…"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                    <div className="mt-space-xs flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs pt-1">
                      <div className="flex items-center gap-space-xs font-code-sm text-code-sm">
                        <span className="font-semibold text-on-surface">
                          {message.length}
                        </span>
                        <span className="text-on-surface-variant">/ 160 chars</span>
                        <span className="text-on-surface-variant">•</span>
                        <span className="text-secondary font-medium">
                          {segments} SMS Segment{segments === 1 ? '' : 's'}
                        </span>
                      </div>
                      <span className="font-code-sm text-code-sm text-on-surface-variant">
                        {unicode
                          ? 'Unicode: 70 units per segment · 67 when multi-part'
                          : 'GSM-7: 160 chars per segment · 153 when multi-part'}
                      </span>
                    </div>
                    {!segments || segments < 2 ? null : (
                      <div className="mt-2 p-space-sm bg-surface-container-highest rounded flex items-start gap-space-xs">
                        <span className="material-symbols-outlined text-tertiary text-[18px] shrink-0 mt-0.5">
                          warning
                        </span>
                        <p className="font-code-sm text-code-sm text-tertiary">
                          Multi-part message: each recipient costs one credit per
                          segment.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-surface-container p-space-md md:p-space-lg rounded-xl shadow-md">
                <div className="flex flex-col items-start sm:flex-row sm:items-center sm:justify-between gap-space-xs pb-space-sm mb-space-md">
                  <div className="flex items-center gap-space-xs">
                    <span className="font-code-sm text-code-sm px-space-xs py-0.5 rounded bg-surface-container-highest text-primary">
                      02
                    </span>
                    <h2 className="font-headline-md text-headline-md text-on-surface">
                      Recipient Dispatch Matrix
                    </h2>
                  </div>
                  <div className="flex items-center gap-1 font-code-sm text-code-sm text-on-surface-variant">
                    <span>DEDUPLICATION</span>
                    <span className="text-secondary font-semibold">
                      AUTO-ENABLED
                    </span>
                  </div>
                </div>
                <div className="flex gap-space-xs p-1 bg-surface-container-low rounded-lg mb-space-md max-w-fit">
                  <button
                    className={`px-space-md py-1 rounded font-label-md text-label-md transition-colors ${tab === 'manual' ? TAB_ON.join(' ') : TAB_OFF.join(' ')}`}
                    onClick={() => setTab('manual')}
                    type="button"
                  >
                    Manual Input
                  </button>
                  <button
                    className={`px-space-md py-1 rounded font-label-md text-label-md transition-colors ${tab === 'bulk' ? TAB_ON.join(' ') : TAB_OFF.join(' ')}`}
                    onClick={() => setTab('bulk')}
                    type="button"
                  >
                    Bulk Paste
                  </button>
                </div>
                {tab === 'manual' ? (
                  <div className="flex flex-col sm:flex-row gap-space-xs mb-space-md">
                    <div className="relative flex-1">
                      <input
                        className="w-full bg-surface-container-low text-on-surface px-space-md py-space-sm rounded-lg font-code-md text-code-md focus:outline-none focus:bg-surface-container-high transition-colors"
                        placeholder="+2348012345678"
                        type="text"
                        value={manual}
                        onChange={(e) => setManual(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addMany([manual]);
                            setManual('');
                          }
                        }}
                      />
                      <span className="absolute right-3 top-2.5 font-code-sm text-code-sm text-on-surface-variant">
                        E.164
                      </span>
                    </div>
                    <button
                      className="px-space-md py-space-sm bg-surface-container-highest hover:bg-surface-bright text-on-surface font-label-lg text-label-lg rounded-lg transition-colors flex items-center justify-center gap-space-xs shadow-sm"
                      onClick={() => {
                        addMany([manual]);
                        setManual('');
                      }}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        add
                      </span>{' '}
                      Add Contact
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-space-xs mb-space-md">
                    <label
                      className="font-label-md text-label-md text-on-surface-variant"
                      htmlFor="bulk-textarea"
                    >
                      Paste numbers (comma, semicolon, or newline separated)
                    </label>
                    <textarea
                      className="w-full bg-surface-container-low text-on-surface px-space-md py-space-sm rounded-lg font-code-md text-code-md focus:outline-none focus:bg-surface-container-high transition-colors"
                      id="bulk-textarea"
                      placeholder="+2348012345678, +2348023456789…"
                      rows={3}
                      value={bulk}
                      onChange={(e) => setBulk(e.target.value)}
                    />
                    <div className="flex items-center justify-between">
                      <span className="font-code-sm text-code-sm text-on-surface-variant">
                        Strict E.164 only — rejects are listed, never silently
                        fixed.
                      </span>
                      <button
                        className="px-space-md py-1 bg-surface-container-highest hover:bg-surface-bright text-on-surface font-label-md text-label-md rounded transition-colors"
                        onClick={() => {
                          addMany(bulk.split(/[,\n;]+/));
                          setBulk('');
                          setTab('manual');
                        }}
                        type="button"
                      >
                        Validate &amp; Add
                      </button>
                    </div>
                  </div>
                )}
                {bulkErrors && (
                  <p className="font-code-sm text-code-sm text-error mb-space-sm">
                    {bulkErrors}
                  </p>
                )}
                <div className="flex items-center justify-between py-space-xs mb-space-sm">
                  <div className="flex items-center gap-space-xs">
                    <span className="font-label-lg text-label-lg text-on-surface font-semibold">
                      Active Destination Payload
                    </span>
                    <span className="px-space-xs py-0.5 rounded bg-primary-container text-on-primary-container font-code-sm text-code-sm">
                      {unique.length} Unique Recipients
                    </span>
                  </div>
                  <button
                    className="font-code-sm text-code-sm text-error hover:underline transition-all"
                    onClick={() => setRecipients([])}
                    type="button"
                  >
                    Clear all
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto flex flex-wrap gap-space-xs p-space-sm bg-surface-container-low rounded-lg">
                  {recipients.map((phone) => (
                    <div
                      key={phone}
                      className="recipient-chip flex items-center gap-space-xs bg-surface-container-high px-space-sm py-1 rounded text-on-surface"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                      <span className="font-code-sm text-code-sm">{phone}</span>
                      <span className="font-code-sm text-code-sm text-secondary bg-surface-container-highest px-1 rounded">
                        E.164
                      </span>
                      <button
                        className="text-on-surface-variant hover:text-error transition-colors flex items-center justify-center p-0.5"
                        onClick={() =>
                          setRecipients((prev) =>
                            prev.filter((p) => p !== phone),
                          )
                        }
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          close
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 flex flex-col gap-space-md">
              <div className="bg-surface-container p-space-md md:p-space-lg rounded-xl shadow-md">
                <div className="flex items-center justify-between pb-space-sm mb-space-md">
                  <div className="flex items-center gap-space-xs">
                    <span className="font-code-sm text-code-sm px-space-xs py-0.5 rounded bg-surface-container-highest text-primary">
                      03
                    </span>
                    <h2 className="font-headline-md text-headline-md text-on-surface">
                      Message Preview
                    </h2>
                  </div>
                </div>
                <div className="flex justify-center py-2">
                  <div className="w-64 bg-surface-container-lowest rounded-3xl p-3 shadow-xl">
                    <div className="flex justify-center mb-2">
                      <div className="w-20 h-4 bg-surface-container-high rounded-full flex items-center justify-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-surface-bright"></span>
                        <span className="w-2.5 h-1 rounded-full bg-surface-bright"></span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center px-1 mb-3 text-on-surface-variant font-code-sm text-code-sm">
                      <span>{clock}</span>
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">
                          signal_cellular_4_bar
                        </span>
                        <span className="material-symbols-outlined text-[14px]">
                          wifi
                        </span>
                        <span className="material-symbols-outlined text-[14px]">
                          battery_full
                        </span>
                      </div>
                    </div>
                    <div className="bg-surface-container-low rounded-xl p-space-sm mb-3 flex items-center gap-space-xs">
                      <div className="w-7 h-7 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-xs shrink-0">
                        CE
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-label-md text-label-md text-on-surface font-semibold truncate">
                          Campaign Engine
                        </span>
                        <span className="font-code-sm text-code-sm text-on-surface-variant">
                          Preview — not sent
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 mb-2">
                      <div className="bg-primary-container text-on-primary-container p-space-sm rounded-xl rounded-tl-sm shadow-sm">
                        <p className="font-body-sm text-body-sm leading-relaxed whitespace-pre-wrap break-words">
                          {message || '(No SMS body configured)'}
                        </p>
                      </div>
                      <div className="flex justify-end pr-1">
                        <span className="font-code-sm text-code-sm text-on-surface-variant">
                          Preview • unsent
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-surface-container p-space-md md:p-space-lg rounded-xl shadow-md">
                <div className="flex items-center justify-between pb-space-sm mb-space-sm">
                  <h2 className="font-headline-md text-headline-md text-on-surface">
                    Credit Reconciliation
                  </h2>
                  <span className="font-code-sm text-code-sm text-on-surface-variant">
                    REAL-TIME
                  </span>
                </div>
                <div className="bg-surface-container-low p-space-md rounded-lg mb-space-md flex flex-col gap-space-xs">
                  <span className="font-code-sm text-code-sm text-on-surface-variant uppercase">
                    Formula Valuation
                  </span>
                  <div className="flex items-center gap-space-xs font-code-md text-code-md text-on-surface font-semibold">
                    <span>{unique.length}</span>{' '}
                    <span className="text-on-surface-variant">recipients</span>
                    <span>×</span>
                    <span>{segments}</span>{' '}
                    <span className="text-on-surface-variant">segment</span>
                    <span>=</span>
                    <span className="text-primary font-bold">{cost} Credits</span>
                  </div>
                </div>
                <div className="flex flex-col gap-space-sm mb-space-md">
                  <div className="flex items-center justify-between">
                    <span className="font-body-md text-body-md text-on-surface-variant">
                      Current Balance
                    </span>
                    <span className="font-code-md text-code-md font-bold text-on-surface">
                      {balance} Credits
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-body-md text-body-md text-on-surface-variant">
                      Deduction Cost
                    </span>
                    <span className="font-code-md text-code-md font-bold text-primary">
                      {cost} Credits
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-body-md text-body-md text-on-surface-variant">
                      Net Balance Post-Dispatch
                    </span>
                    <span
                      className={`font-code-md text-code-md font-bold ${balance - cost < 0 ? 'text-error' : 'text-secondary'}`}
                    >
                      {balance - cost} Credits
                    </span>
                  </div>
                  {!showError ? (
                    <div className="mt-space-xs p-space-sm bg-surface-container-high rounded flex items-center justify-between">
                      <div className="flex items-center gap-space-xs">
                        <span className="material-symbols-outlined text-secondary text-[20px]">
                          check_circle
                        </span>
                        <span className="font-label-md text-label-md text-secondary">
                          Sufficient Balance Available
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-space-xs p-space-sm bg-error-container text-on-error-container rounded flex flex-col gap-1">
                      <div className="flex items-center gap-space-xs">
                        <span className="material-symbols-outlined text-error text-[20px]">
                          error
                        </span>
                        <span className="font-label-md text-label-md font-bold text-error">
                          Insufficient credits
                        </span>
                      </div>
                      <p className="font-code-sm text-code-sm text-error">
                        {submitError ??
                          'Required balance exceeds workspace allocation.'}
                      </p>
                      <button
                        className="mt-space-xs px-space-md py-space-sm bg-primary-container text-on-primary font-label-md text-label-md font-bold rounded-lg hover:bg-primary transition-colors flex items-center justify-center gap-space-xs self-start"
                        onClick={() =>
                          navigate('/dashboard', {
                            state: { openFund: true },
                          })
                        }
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          account_balance_wallet
                        </span>{' '}
                        Fund credits
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-end gap-space-sm">
                  <button
                    className="px-space-lg py-space-sm bg-primary-container hover:bg-primary text-on-primary font-label-lg text-label-lg font-bold rounded-lg shadow-md transition-all flex items-center gap-space-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!valid || submitting}
                    onClick={() => setConfirmOpen(true)}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      send
                    </span>{' '}
                    Dispatch Campaign
                  </button>
                </div>
              </div>
            </div>
          </div>

          {confirmOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-space-md bg-surface-dim/80 backdrop-blur-sm"
              onClick={(e) => {
                if (e.target === e.currentTarget) setConfirmOpen(false);
              }}
              role="dialog"
              aria-modal="true"
            >
              <div className="bg-surface-container-high max-w-md w-full p-space-lg rounded-xl shadow-xl flex flex-col gap-space-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-space-xs">
                    <span className="material-symbols-outlined text-primary text-[24px]">
                      rocket_launch
                    </span>
                    <h3 className="font-headline-md text-headline-md text-on-surface">
                      Commit Live Dispatch?
                    </h3>
                  </div>
                  <button
                    className="text-on-surface-variant hover:text-on-surface"
                    onClick={() => setConfirmOpen(false)}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      close
                    </span>
                  </button>
                </div>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Credits deduct immediately and the queue starts dispatching.
                  Contacts already queued cannot be recalled.
                </p>
                <div className="bg-surface-container-low p-space-sm rounded-lg flex flex-col gap-1 font-code-sm text-code-sm">
                  <div className="flex justify-between text-on-surface">
                    <span>Target Count:</span>
                    <span className="font-bold">{unique.length} Recipients</span>
                  </div>
                  <div className="flex justify-between text-on-surface">
                    <span>SMS Segments:</span>
                    <span className="font-bold">{segments}</span>
                  </div>
                  <div className="flex justify-between text-on-surface">
                    <span>Total Deduction:</span>
                    <span className="font-bold text-primary">{cost} Credits</span>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-space-sm pt-2">
                  <button
                    className="px-space-md py-space-sm bg-surface-container text-on-surface font-label-lg text-label-lg rounded-lg hover:bg-surface-bright transition-colors"
                    onClick={() => setConfirmOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="px-space-lg py-space-sm bg-primary-container text-on-primary font-label-lg text-label-lg font-bold rounded-lg hover:bg-primary shadow-md transition-colors flex items-center gap-space-xs disabled:opacity-60"
                    disabled={submitting}
                    onClick={() => void dispatch()}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      bolt
                    </span>{' '}
                    Execute Pipeline
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      {toastHost}
    </div>
  );
}
