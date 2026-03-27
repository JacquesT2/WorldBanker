'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { usePlayerStore } from '../../../store/player-store';
import { useWorldStore } from '../../../store/world-store';
import type { SectorType } from '@argentum/shared';

const SECTOR_COLORS: Record<string, string> = {
  military:       '#ef4444',
  heavy_industry: '#f97316',
  construction:   '#eab308',
  commerce:       '#22c55e',
  maritime:       '#3b82f6',
  agriculture:    '#84cc16',
};

const SECTOR_ICONS: Record<string, string> = {
  military:       '⚔',
  heavy_industry: '⚒',
  construction:   '🏗',
  commerce:       '💰',
  maritime:       '⚓',
  agriculture:    '🌾',
};

const SECTOR_LABELS: Record<string, string> = {
  military:       'Military',
  heavy_industry: 'Heavy Industry',
  construction:   'Construction',
  commerce:       'Commerce',
  maritime:       'Maritime',
  agriculture:    'Agriculture',
};

interface InvestmentEntry {
  id: string;
  player_id: string;
  town_id: string;
  sector_type: string;
  amount_invested: number;
  completion_tick: number;
  completed: boolean;
  annual_return_rate: number;
}

export default function InvestmentsPage() {
  const router = useRouter();
  const [investments, setInvestments] = useState<InvestmentEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const getTown = useWorldStore(s => s.getTown);
  const clock   = useWorldStore(s => s.clock);
  const bs      = usePlayerStore(s => s.balanceSheet);

  useEffect(() => {
    api.investments.mine()
      .then(data => setInvestments(data as InvestmentEntry[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // group by town
  const byTown = new Map<string, InvestmentEntry[]>();
  for (const inv of investments) {
    const list = byTown.get(inv.town_id) ?? [];
    list.push(inv);
    byTown.set(inv.town_id, list);
  }

  // totals
  const totalInvested = investments.reduce((a, i) => a + i.amount_invested, 0);
  const annualReturn  = investments
    .filter(i => i.completed)
    .reduce((a, i) => a + i.amount_invested * i.annual_return_rate, 0);
  const pending = investments.filter(i => !i.completed).length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gold-400">Sector Investments — Portfolio</h2>
        <button
          onClick={() => router.push('/world-map')}
          className="bg-gold-500 hover:bg-gold-400 text-parch-50 font-bold text-sm px-4 py-2 rounded"
        >
          + Fund via Map
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-parch-50 border border-parch-300 rounded-lg p-4">
          <p className="text-ink-700 text-xs uppercase tracking-wide mb-1">Total Invested</p>
          <p className="text-2xl font-mono font-bold text-gold-400">{Math.round(totalInvested).toLocaleString()}</p>
          <p className="text-ink-700 text-xs">gold committed</p>
        </div>
        <div className="bg-parch-50 border border-parch-300 rounded-lg p-4">
          <p className="text-ink-700 text-xs uppercase tracking-wide mb-1">Annual Return</p>
          <p className="text-2xl font-mono font-bold text-safe-400">{Math.round(annualReturn).toLocaleString()}</p>
          <p className="text-ink-700 text-xs">from active investments</p>
        </div>
        <div className="bg-parch-50 border border-parch-300 rounded-lg p-4">
          <p className="text-ink-700 text-xs uppercase tracking-wide mb-1">Under Construction</p>
          <p className="text-2xl font-mono font-bold text-ink-800">{pending}</p>
          <p className="text-ink-700 text-xs">projects in progress</p>
        </div>
      </div>

      {/* per-sector summary */}
      {investments.length > 0 && (
        <div className="mb-6">
          <h3 className="text-gold-400 font-semibold mb-3 text-sm uppercase tracking-wide">By Sector</h3>
          <div className="grid grid-cols-3 gap-2">
            {Object.keys(SECTOR_LABELS).map(sector => {
              const sectorInvs = investments.filter(i => i.sector_type === sector);
              if (sectorInvs.length === 0) return null;
              const total = sectorInvs.reduce((a, i) => a + i.amount_invested, 0);
              const active = sectorInvs.filter(i => i.completed).length;
              return (
                <div key={sector} className="bg-parch-50 border border-parch-300 rounded-lg p-3 flex items-center gap-3">
                  <span className="text-2xl">{SECTOR_ICONS[sector]}</span>
                  <div>
                    <p className="text-xs font-semibold text-ink-800">{SECTOR_LABELS[sector]}</p>
                    <p className="text-xs text-ink-700">{active}/{sectorInvs.length} active</p>
                    <p className="text-xs font-mono" style={{ color: SECTOR_COLORS[sector] }}>
                      {Math.round(total).toLocaleString()} gold
                    </p>
                  </div>
                </div>
              );
            }).filter(Boolean)}
          </div>
        </div>
      )}

      {/* investment list grouped by town */}
      {loading ? (
        <p className="text-ink-700">Loading…</p>
      ) : investments.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-ink-700 mb-3">No sector investments yet.</p>
          <p className="text-ink-700 text-sm mb-4">Click on a licensed town in the world map to fund sector development.</p>
          <button
            onClick={() => router.push('/world-map')}
            className="bg-gold-500 hover:bg-gold-400 text-parch-50 font-bold text-sm px-4 py-2 rounded"
          >
            Open World Map
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="text-gold-400 font-semibold mb-1 text-sm uppercase tracking-wide">By Town</h3>
          {Array.from(byTown.entries()).map(([townId, invs]) => {
            const town = getTown(townId);
            return (
              <div key={townId} className="bg-parch-50 border border-parch-300 rounded-lg overflow-hidden">
                <div
                  className="px-4 py-2 border-b border-parch-300 flex items-center justify-between cursor-pointer hover:bg-parch-100"
                  onClick={() => router.push(`/town/${townId}`)}
                >
                  <span className="font-semibold text-gold-400">{town?.name ?? townId}</span>
                  <span className="text-xs text-ink-700">{invs.length} investment{invs.length !== 1 ? 's' : ''} → view town</span>
                </div>
                <div className="divide-y divide-parch-200">
                  {invs.map(inv => {
                    const ticksLeft = clock ? Math.max(0, inv.completion_tick - clock.current_tick) : null;
                    const color = SECTOR_COLORS[inv.sector_type] ?? '#888';
                    const progress = ticksLeft != null && !inv.completed
                      ? Math.max(0, Math.min(100, 100 - (ticksLeft / (inv.completion_tick)) * 100))
                      : 100;
                    return (
                      <div key={inv.id} className="px-4 py-3">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{SECTOR_ICONS[inv.sector_type] ?? ''}</span>
                            <div>
                              <span className="font-medium text-sm" style={{ color }}>
                                {SECTOR_LABELS[inv.sector_type] ?? inv.sector_type}
                              </span>
                              <span className="text-ink-700 text-xs ml-2">
                                {(inv.annual_return_rate * 100).toFixed(0)}%/yr return
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-sm text-gold-400">{Math.round(inv.amount_invested).toLocaleString()}</p>
                            {inv.completed ? (
                              <p className="text-safe-400 text-xs font-medium">✓ Active</p>
                            ) : (
                              <p className="text-ink-700 text-xs">{ticksLeft ?? '?'} ticks left</p>
                            )}
                          </div>
                        </div>
                        {/* progress bar */}
                        {!inv.completed && (
                          <div className="h-1 bg-parch-300 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${progress}%`, background: color }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
