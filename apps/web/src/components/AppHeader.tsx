import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

interface AppHeaderProps {
  status?: ReactNode;
  actions?: ReactNode;
}

function NavLink({ to, label }: { to: string; label: string }) {
  const active = useLocation().pathname === to;
  return (
    <Link
      aria-current={active ? 'page' : undefined}
      to={to}
      className={
        active
          ? 'px-space-md py-space-sm font-label-lg transition-colors bg-surface-container-high text-on-surface rounded-lg'
          : 'px-space-md py-space-sm font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors rounded-lg'
      }
    >
      {label}
    </Link>
  );
}

export function AppHeader({ status, actions }: AppHeaderProps) {
  const { logout } = useAuth();
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-surface/90 backdrop-blur-md border-b border-outline-variant">
      <div className="h-16 w-full max-w-[1100px] mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop flex items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-md">
          <Link className="flex items-center gap-space-sm" to="/dashboard">
            <div className="w-7 h-7 rounded bg-primary-container flex items-center justify-center text-on-primary">
              <span className="material-symbols-outlined text-[18px]">
                terminal
              </span>
            </div>
            <span className="font-headline-md text-headline-md tracking-tight text-on-surface hidden sm:inline-block">
              Campaign Engine
            </span>
          </Link>
          <span className="font-code-sm text-code-sm px-space-xs py-0.5 rounded bg-surface-container text-on-surface-variant border border-outline-variant">
            v1.1
          </span>
        </div>
        <nav className="hidden md:flex items-center gap-space-xs">
          <NavLink to="/dashboard" label="Dashboard" />
          <NavLink to="/campaign-new" label="New Campaign" />
        </nav>
        <div className="flex items-center gap-space-sm">
          {status}
          {actions}
          <div className="flex items-center gap-space-xs px-space-sm py-1 rounded-lg bg-surface-container-low border border-outline-variant">
            <span className="font-label-md text-label-md text-on-surface font-semibold hidden sm:inline">
              Dispatch Ops
            </span>
            <span className="font-code-sm text-code-sm text-on-surface-variant sm:hidden">
              DO
            </span>
          </div>
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-on-primary text-[18px]">
              person
            </span>
          </div>
          <button
            aria-label="Sign out"
            className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors flex items-center justify-center"
            onClick={logout}
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">
              logout
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
