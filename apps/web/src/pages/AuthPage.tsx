import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ApiError, apiBase } from '../api/client';
import { useAuth } from '../auth/useAuth';

type Tab = 'signin' | 'register';

const TAB_ACTIVE =
  'py-space-xs px-space-sm rounded-md font-label-md text-label-md transition-all text-center flex items-center justify-center gap-1.5 bg-surface-container-high text-on-surface shadow-sm';
const TAB_IDLE =
  'py-space-xs px-space-sm rounded-md font-label-md text-label-md transition-all text-center flex items-center justify-center gap-1.5 text-outline hover:text-on-surface';

const BAR_IDLE = 'h-full w-1/4 bg-surface-container-high transition-colors';

function strengthOf(value: string): {
  bars: number;
  color: string;
  text: string;
  cls: string;
} {
  if (!value) {
    return { bars: 0, color: '', text: 'Strength: Enter minimum 8 chars', cls: 'text-outline' };
  }
  if (value.length < 8) {
    return { bars: 1, color: 'bg-error', text: 'Strength: Too short (<8 chars)', cls: 'text-error' };
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
  return levels[score - 1];
}

function PasswordInput({
  id,
  placeholder,
  value,
  onChange,
  minLength,
  maxLength,
  icon,
}: {
  id: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  minLength?: number;
  maxLength?: number;
  icon: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative flex items-center">
      <span className="material-symbols-outlined text-[18px] text-outline absolute left-3 pointer-events-none">
        {icon}
      </span>
      <input
        className="w-full pl-9 pr-9 py-2 bg-surface-container rounded-lg font-code-sm text-code-sm text-on-surface placeholder:text-outline/60 focus:bg-surface-container-high focus:outline-none transition-all shadow-inner"
        id={id}
        placeholder={placeholder}
        type={visible ? 'text' : 'password'}
        value={value}
        minLength={minLength}
        maxLength={maxLength}
        required
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        className="absolute right-3 text-outline hover:text-on-surface flex items-center"
        onClick={() => setVisible((v) => !v)}
        type="button"
      >
        <span className="material-symbols-outlined text-[16px]">
          {visible ? 'visibility_off' : 'visibility'}
        </span>
      </button>
    </div>
  );
}

export function AuthPage() {
  const { token, login, register } = useAuth();
  const [tab, setTab] = useState<Tab>('signin');
  const [alert, setAlert] = useState<{ title: string; body: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  useEffect(() => {
    // One-shot reachability probe.
    fetch(`${apiBase()}/`)
      .then((res) => setApiOnline(res.ok))
      .catch(() => setApiOnline(false));
  }, []);

  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  const strength = strengthOf(regPassword);

  async function submit(e: React.FormEvent, mode: Tab) {
    e.preventDefault();
    setAlert(null);
    if (mode === 'register' && regPassword !== confirm) {
      setAlert({
        title: 'ERR_VALIDATION',
        body: 'Confirmation password does not match.',
      });
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        await login(email.trim(), password);
      } else {
        await register(regEmail.trim(), regPassword, workspace.trim());
      }
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 'NETWORK';
      setAlert({
        title: `ERR_${status}`,
        body: err instanceof Error ? err.message : 'Request failed.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="w-full min-h-screen flex items-center justify-center">
      <div className="flex flex-col w-full items-center justify-center p-gutter md:p-margin-desktop">
        <div className="w-full max-w-[420px] flex flex-col gap-space-lg">
          <div className="flex flex-col items-center text-center gap-space-xs">
            <div className="flex items-center gap-space-xs mb-space-xs">
              <div className="w-7 h-7 rounded bg-primary-container flex items-center justify-center text-on-primary">
                <span className="material-symbols-outlined text-[18px]">
                  terminal
                </span>
              </div>
              <span className="font-code-lg text-code-lg tracking-wider text-on-surface uppercase">
                CampaignEngine
              </span>
              <div className="relative flex items-center justify-center w-2 h-2 ml-1">
                <span className="absolute w-2 h-2 rounded-full bg-secondary opacity-75 animate-ping"></span>
                <span className="relative w-1.5 h-1.5 rounded-full bg-secondary"></span>
              </div>
            </div>
            <h1 className="font-headline-md text-headline-md text-on-surface font-semibold tracking-tight">
              Mission Control Console
            </h1>
            <p className="font-body-sm text-body-sm text-outline">
              Fund credits. Send SMS. Watch delivery live.
            </p>
          </div>

          <div className="w-full bg-surface-container-low rounded-xl shadow-xl p-space-lg flex flex-col gap-space-md">
            <div className="grid grid-cols-2 p-1 bg-surface-container-lowest rounded-lg gap-1">
              <button
                className={tab === 'signin' ? TAB_ACTIVE : TAB_IDLE}
                onClick={() => {
                  setTab('signin');
                  setAlert(null);
                }}
                type="button"
              >
                <span className="material-symbols-outlined text-[16px] text-primary">
                  login
                </span>
                Sign In
              </button>
              <button
                className={tab === 'register' ? TAB_ACTIVE : TAB_IDLE}
                onClick={() => {
                  setTab('register');
                  setAlert(null);
                }}
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">
                  domain_add
                </span>
                Create Account
              </button>
            </div>

            {alert && (
              <div className="flex flex-col gap-1 p-space-sm rounded-lg bg-surface-container-highest transition-all">
                <div className="flex items-start gap-space-xs">
                  <span className="material-symbols-outlined text-error text-[18px] shrink-0 mt-0.5">
                    error
                  </span>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-label-md text-label-md font-semibold text-error tracking-wide font-code-sm">
                      {alert.title}
                    </span>
                    <p className="font-body-sm text-body-sm text-on-surface-variant break-words">
                      {alert.body}
                    </p>
                  </div>
                  <button
                    className="text-outline hover:text-on-surface p-0.5"
                    onClick={() => setAlert(null)}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      close
                    </span>
                  </button>
                </div>
              </div>
            )}

            {tab === 'signin' ? (
              <form
                className="flex flex-col gap-space-md"
                onSubmit={(e) => void submit(e, 'signin')}
              >
                <div className="flex flex-col gap-space-xs">
                  <label
                    className="font-label-md text-label-md text-on-surface font-medium"
                    htmlFor="signin-email"
                  >
                    Work Email
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined text-[18px] text-outline absolute left-3 pointer-events-none">
                      alternate_email
                    </span>
                    <input
                      className="w-full pl-9 pr-3 py-2 bg-surface-container rounded-lg font-code-sm text-code-sm text-on-surface placeholder:text-outline/60 focus:bg-surface-container-high focus:outline-none transition-all shadow-inner"
                      id="signin-email"
                      placeholder="engineer@example.com"
                      required
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-space-xs">
                  <label
                    className="font-label-md text-label-md text-on-surface font-medium"
                    htmlFor="signin-password"
                  >
                    Password
                  </label>
                  <PasswordInput
                    icon="lock"
                    id="signin-password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={setPassword}
                  />
                </div>
                <button
                  className="w-full mt-1 py-2.5 px-4 bg-primary-container hover:bg-primary-container/90 active:scale-[0.99] text-on-primary font-label-lg text-label-lg font-semibold rounded-lg shadow-md transition-all flex items-center justify-center gap-2 group disabled:opacity-60"
                  disabled={busy}
                  type="submit"
                >
                  <span>Sign In to Workspace</span>
                  <span className="material-symbols-outlined text-[18px] transition-transform group-hover:translate-x-0.5">
                    arrow_forward
                  </span>
                </button>
              </form>
            ) : (
              <form
                className="flex flex-col gap-space-md"
                onSubmit={(e) => void submit(e, 'register')}
              >
                <div className="flex flex-col gap-space-xs">
                  <label
                    className="font-label-md text-label-md text-on-surface font-medium"
                    htmlFor="reg-workspace"
                  >
                    Workspace Identifier
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined text-[18px] text-outline absolute left-3 pointer-events-none">
                      hub
                    </span>
                    <input
                      className="w-full pl-9 pr-3 py-2 bg-surface-container rounded-lg font-body-md text-body-md text-on-surface placeholder:text-outline/60 focus:bg-surface-container-high focus:outline-none transition-all shadow-inner"
                      id="reg-workspace"
                      placeholder="e.g. Acme Marketing Production"
                      required
                      type="text"
                      value={workspace}
                      onChange={(e) => setWorkspace(e.target.value)}
                    />
                  </div>
                  <span className="font-body-sm text-body-sm text-outline flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-secondary">
                      info
                    </span>
                    Creates isolated workspace and starts with 0 credits.
                  </span>
                </div>
                <div className="flex flex-col gap-space-xs">
                  <label
                    className="font-label-md text-label-md text-on-surface font-medium"
                    htmlFor="reg-email"
                  >
                    Work Email
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined text-[18px] text-outline absolute left-3 pointer-events-none">
                      alternate_email
                    </span>
                    <input
                      className="w-full pl-9 pr-3 py-2 bg-surface-container rounded-lg font-code-sm text-code-sm text-on-surface placeholder:text-outline/60 focus:bg-surface-container-high focus:outline-none transition-all shadow-inner"
                      id="reg-email"
                      placeholder="engineer@example.com"
                      required
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-space-xs">
                  <label
                    className="font-label-md text-label-md text-on-surface font-medium"
                    htmlFor="reg-password"
                  >
                    Master Password
                  </label>
                  <PasswordInput
                    icon="lock_reset"
                    id="reg-password"
                    placeholder="8–72 characters required"
                    value={regPassword}
                    minLength={8}
                    maxLength={72}
                    onChange={setRegPassword}
                  />
                  <div className="flex flex-col gap-1 mt-1">
                    <div className="w-full bg-surface-container-lowest h-1.5 rounded-full overflow-hidden flex gap-0.5">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={
                            i < strength.bars
                              ? `h-full w-1/4 ${strength.color} transition-colors`
                              : BAR_IDLE
                          }
                        ></div>
                      ))}
                    </div>
                    <div className="flex justify-between items-center text-code-sm font-code-sm">
                      <span className={strength.cls}>{strength.text}</span>
                      <span className="text-outline">Entropy: 256-bit</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-space-xs">
                  <label
                    className="font-label-md text-label-md text-on-surface font-medium"
                    htmlFor="reg-confirm-password"
                  >
                    Confirm Password
                  </label>
                  <PasswordInput
                    icon="check_circle"
                    id="reg-confirm-password"
                    placeholder="Confirm master password"
                    value={confirm}
                    onChange={setConfirm}
                  />
                </div>
                <button
                  className="w-full mt-1 py-2.5 px-4 bg-primary-container hover:bg-primary-container/90 active:scale-[0.99] text-on-primary font-label-lg text-label-lg font-semibold rounded-lg shadow-md transition-all flex items-center justify-center gap-2 group disabled:opacity-60"
                  disabled={busy}
                  type="submit"
                >
                  <span>Create Workspace &amp; Account</span>
                  <span className="material-symbols-outlined text-[18px] transition-transform group-hover:translate-x-0.5">
                    add_moderator
                  </span>
                </button>
              </form>
            )}
          </div>

          <div className="p-space-md rounded-xl bg-surface-container-lowest/80 flex items-start gap-space-sm">
            <span className="material-symbols-outlined text-tertiary text-[18px] shrink-0 mt-0.5">
              science
            </span>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="font-label-md text-label-md text-on-surface font-medium">
                  Demo Sandbox Architecture
                </span>
                <span className="font-code-sm text-code-sm px-1.5 py-0.2 rounded bg-tertiary-container/30 text-tertiary">
                  STAGING
                </span>
              </div>
              <p className="font-body-sm text-body-sm text-outline leading-relaxed">
                Signed JWT access tokens persist in local storage for a 24-hour
                cycle. New workspaces launch with 0 credits — fund via Paystack
                test mode.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between text-outline px-1">
            <span className="font-code-sm text-code-sm flex items-center gap-1">
              <span
                className={`w-1.5 h-1.5 rounded-full ${apiOnline === true ? 'bg-secondary' : apiOnline === false ? 'bg-error' : 'bg-outline'}`}
              ></span>
              <span>
                {apiOnline === true
                  ? 'API online'
                  : apiOnline === false
                    ? 'API unreachable'
                    : 'API checking…'}
              </span>
            </span>
            <span className="font-code-sm text-code-sm text-outline">
              Campaign Engine · local
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
