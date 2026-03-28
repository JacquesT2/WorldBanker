'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isAuthenticated, getStoredToken } from '../../lib/auth';
import { connectSocket } from '../../lib/socket';
import { useSocket } from '../../hooks/useSocket';
import { useWorldStore } from '../../store/world-store';
import { usePlayerStore } from '../../store/player-store';
import { api } from '../../lib/api';

const NAV_ITEMS = [
  { href: '/dashboard',    label: 'Balance Sheet',  icon: '⚖' },
  { href: '/world-map',    label: 'World Map',      icon: '🗺' },
  { href: '/loans',        label: 'Loan Queue',     icon: '📜' },
  { href: '/licenses',     label: 'License Market', icon: '🏛' },
  { href: '/companies',    label: 'Companies',      icon: '🏢' },
  { href: '/events',       label: 'Event Feed',     icon: '📰' },
  { href: '/leaderboard',  label: 'Leaderboard',    icon: '🏆' },
];

const SPEEDS = [0.25, 0.5, 1, 2, 5, 10] as const;

function DevPanel() {
  const [status, setStatus] = useState<{ paused: boolean; speedMultiplier: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.dev.status().then(setStatus).catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  const handleReset = () => {
    if (!window.confirm('Reset the entire game? All towns, players, loans and licenses will be wiped.')) return;
    run(() => api.dev.reset());
  };

  return (
    <div className="border-t border-amber-900 border-opacity-40 p-3 bg-amber-950 bg-opacity-20">
      <p className="text-xs font-semibold text-amber-600 mb-2 uppercase tracking-wide">Dev Controls</p>

      {/* Pause / Resume */}
      <div className="flex gap-1 mb-2">
        <button
          onClick={() => run(() => status?.paused ? api.dev.resume() : api.dev.pause())}
          disabled={busy}
          className="flex-1 text-xs px-2 py-1 rounded bg-parch-300 hover:bg-parch-400 text-ink-800 disabled:opacity-40"
        >
          {status?.paused ? '▶ Resume' : '⏸ Pause'}
        </button>
      </div>

      {/* Speed buttons */}
      <div className="flex flex-wrap gap-1 mb-2">
        {SPEEDS.map(s => (
          <button
            key={s}
            onClick={() => run(() => api.dev.setSpeed(s))}
            disabled={busy}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              status?.speedMultiplier === s
                ? 'bg-amber-600 border-amber-500 text-parch-50'
                : 'border-parch-400 text-ink-700 hover:bg-parch-300'
            }`}
          >
            {s}×
          </button>
        ))}
      </div>

      {/* Reset */}
      <button
        onClick={handleReset}
        disabled={busy}
        className="w-full text-xs px-2 py-1 rounded border border-danger-400 text-danger-400 hover:bg-danger-500 hover:text-parch-50 transition-colors disabled:opacity-40"
      >
        {busy ? 'Resetting…' : 'Reset game'}
      </button>

      {error && <p className="text-xs text-danger-400 mt-1 truncate" title={error}>{error}</p>}
    </div>
  );
}

function GameShell({ children }: { children: React.ReactNode }) {
  useSocket();
  const pathname = usePathname();
  const clock = useWorldStore(s => s.clock);
  const player = usePlayerStore(s => s.player);
  const bs = usePlayerStore(s => s.balanceSheet);
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-parch-200 border-r border-parch-300 flex flex-col shrink-0">
        <div className="p-4 border-b border-parch-300">
          <h1 className="text-xl font-bold text-gold-400">Argentum</h1>
          {player && (
            <p className="text-xs text-ink-700 mt-1 truncate">{player.bank_name}</p>
          )}
          {clock && (
            <p className="text-xs text-ink-700 mt-1 capitalize">
              {clock.current_season} — Year {clock.current_year}
            </p>
          )}
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                pathname === item.href
                  ? 'bg-gold-600 text-parch-50 font-medium'
                  : 'text-ink-700 hover:bg-parch-300 hover:text-ink-800'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Reserve ratio indicator */}
        {bs && (
          <div className="p-4 border-t border-parch-300">
            <p className="text-xs text-ink-700 mb-1">Reserve Ratio</p>
            <div className="h-2 bg-parch-300 rounded overflow-hidden">
              <div
                className={`h-full transition-all ${
                  bs.reserve_ratio >= 0.10
                    ? 'bg-safe-400'
                    : 'bg-danger-400'
                }`}
                style={{ width: `${Math.min(bs.reserve_ratio * 100 * 5, 100)}%` }}
              />
            </div>
            <p className={`text-xs mt-1 ${bs.reserve_ratio < 0.10 ? 'text-danger-400' : 'text-ink-700'}`}>
              {(bs.reserve_ratio * 100).toFixed(1)}%
              {bs.reserve_ratio < 0.10 && ' ⚠ CRITICAL'}
            </p>
          </div>
        )}

        <DevPanel />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-parch-100">
        {children}
      </main>

    </div>
  );
}

export default function GameLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    const token = getStoredToken();
    if (token) connectSocket(token);
  }, [router]);

  return <GameShell>{children}</GameShell>;
}
