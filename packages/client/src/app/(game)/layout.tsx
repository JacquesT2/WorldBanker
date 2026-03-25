'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isAuthenticated, getStoredToken } from '../../lib/auth';
import { connectSocket } from '../../lib/socket';
import { useSocket } from '../../hooks/useSocket';
import { useWorldStore } from '../../store/world-store';
import { usePlayerStore } from '../../store/player-store';
import { useUiStore } from '../../store/ui-store';

const NAV_ITEMS = [
  { href: '/dashboard',    label: 'Balance Sheet',  icon: '⚖' },
  { href: '/world-map',    label: 'World Map',      icon: '🗺' },
  { href: '/loans',        label: 'Loan Queue',     icon: '📜' },
  { href: '/licenses',     label: 'License Market', icon: '🏛' },
  { href: '/investments',  label: 'Investments',    icon: '🔨' },
  { href: '/events',       label: 'Event Feed',     icon: '📰' },
  { href: '/leaderboard',  label: 'Leaderboard',    icon: '🏆' },
];

function GameShell({ children }: { children: React.ReactNode }) {
  useSocket();
  const pathname = usePathname();
  const clock = useWorldStore(s => s.clock);
  const player = usePlayerStore(s => s.player);
  const bs = usePlayerStore(s => s.balanceSheet);
  const notifications = useUiStore(s => s.notifications);
  const dismissNotification = useUiStore(s => s.dismissNotification);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-ink-700 border-r border-gold-600 flex flex-col shrink-0">
        <div className="p-4 border-b border-gold-600">
          <h1 className="text-xl font-bold text-gold-400">Argentum</h1>
          {player && (
            <p className="text-xs text-parch-200 mt-1 truncate">{player.bank_name}</p>
          )}
          {clock && (
            <p className="text-xs text-parch-200 mt-1 capitalize">
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
                  ? 'bg-gold-600 text-ink-800 font-medium'
                  : 'text-parch-200 hover:bg-ink-800 hover:text-parch-100'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Reserve ratio indicator */}
        {bs && (
          <div className="p-4 border-t border-gold-600">
            <p className="text-xs text-parch-200 mb-1">Reserve Ratio</p>
            <div className="h-2 bg-ink-800 rounded overflow-hidden">
              <div
                className={`h-full transition-all ${
                  bs.reserve_ratio >= 0.10
                    ? 'bg-safe-400'
                    : 'bg-danger-400'
                }`}
                style={{ width: `${Math.min(bs.reserve_ratio * 100 * 5, 100)}%` }}
              />
            </div>
            <p className={`text-xs mt-1 ${bs.reserve_ratio < 0.10 ? 'text-danger-400' : 'text-parch-200'}`}>
              {(bs.reserve_ratio * 100).toFixed(1)}%
              {bs.reserve_ratio < 0.10 && ' ⚠ CRITICAL'}
            </p>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-ink-800">
        {children}
      </main>

      {/* Notification toasts */}
      <div className="fixed bottom-4 right-4 space-y-2 z-50 max-w-sm">
        {notifications.slice(0, 5).map(n => (
          <div
            key={n.id}
            className={`flex items-start gap-2 px-4 py-3 rounded border text-sm ${
              n.type === 'danger'  ? 'bg-danger-500 border-danger-400 text-white' :
              n.type === 'warning' ? 'bg-gold-500 border-gold-400 text-ink-800' :
                                     'bg-ink-700 border-gold-600 text-parch-100'
            }`}
          >
            <span className="flex-1">{n.message}</span>
            <button onClick={() => dismissNotification(n.id)} className="ml-2 opacity-70 hover:opacity-100">✕</button>
          </div>
        ))}
      </div>
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
