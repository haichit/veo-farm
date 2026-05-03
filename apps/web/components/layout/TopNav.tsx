'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Key,
  Layers3,
  ListChecks,
  LayoutDashboard,
  LogOut,
  Settings,
  Shield,
  Workflow,
} from 'lucide-react';
import { SettingsModal } from './SettingsModal';

interface TopNavProps {
  email: string;
}

export function TopNav({ email }: TopNavProps) {
  const path = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setIsAdmin(d?.role === 'admin'))
      .catch(() => {});
  }, []);

  const tabs = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
    { href: '/workflows', label: 'Workflows', icon: Layers3 },
    { href: '/canvas', label: 'Canvas', icon: Workflow },
    { href: '/accounts', label: 'Accounts', icon: Key },
    { href: '/runs', label: 'Runs', icon: ListChecks },
    ...(isAdmin
      ? [{ href: '/admin/users', label: 'Admin', icon: Shield } as const]
      : []),
  ];

  return (
    <nav
      className="h-12 px-4 flex items-center justify-between
                 bg-[rgba(17,17,32,0.85)] backdrop-blur-xl
                 border-b border-border z-50 relative"
    >
      <div className="flex items-center gap-1.5">
        <span className="text-xl">🎬</span>
        <span className="text-sm font-bold tracking-tight bg-gradient-to-br from-text-primary to-[#a78bfa] bg-clip-text text-transparent">
          Veo Farm
        </span>
        <div className="w-px h-5 bg-border mx-2" />

        {tabs.map((tab) => {
          const active = tab.exact ? path === tab.href : path?.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all
                ${
                  active
                    ? 'bg-accent-glow border border-glass-border text-text-primary'
                    : 'text-text-muted hover:text-text-secondary hover:bg-white/[0.04]'
                }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <ConnectionBadge />
        <span
          className="hidden sm:inline-block text-[11px] text-text-muted max-w-[180px] truncate"
          title={email}
        >
          {email}
        </span>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-text-muted hover:text-text-secondary hover:bg-white/[0.06] transition-all border border-transparent hover:border-border"
          aria-label="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          email={email}
        />
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-text-muted hover:text-error hover:bg-error-bg transition-all border border-transparent hover:border-error/30"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </form>
      </div>
    </nav>
  );
}

function ConnectionBadge() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const r = await fetch('/api/worker-status', { cache: 'no-store' });
        const data = await r.json();
        if (!active) return;
        setOnline(!!data.online);
        setCount(
          (data.workers ?? []).filter((w: any) => (w.age_sec ?? 999) < 30).length,
        );
      } catch {
        if (active) setOnline(false);
      }
    }
    poll();
    const t = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  const connected = online === true;
  const label =
    online === null
      ? 'Đang kiểm tra...'
      : connected
        ? count > 1
          ? `${count} workers online`
          : 'Worker online'
        : 'Worker offline';

  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border
        ${
          connected
            ? 'bg-success-bg border-success/30 text-success'
            : online === false
              ? 'bg-error-bg border-error/30 text-error'
              : 'bg-white/[0.03] border-border text-text-muted'
        }`}
      title={online === false ? 'pnpm --filter @veo-farm/worker dev' : undefined}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          connected
            ? 'bg-success shadow-[0_0_6px_currentColor]'
            : online === false
              ? 'bg-error'
              : 'bg-text-muted'
        }`}
      />
      {label}
    </div>
  );
}
