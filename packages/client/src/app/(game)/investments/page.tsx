'use client';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { usePlayerStore } from '../../../store/player-store';
import { useWorldStore } from '../../../store/world-store';
import { INFRA_LEVEL_COSTS, INFRA_BUILD_TICKS } from '@argentum/shared';

interface InvestmentEntry {
  id: string;
  player_id: string;
  town_id: string;
  infra_type: string;
  amount_invested: number;
  completion_tick: number;
  completed: boolean;
  annual_return_rate: number;
}

const INFRA_TYPES = ['roads', 'port', 'granary', 'walls', 'market'] as const;

export default function InvestmentsPage() {
  const [investments, setInvestments] = useState<InvestmentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ town_id: '', infra_type: 'roads', amount: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const licenses = usePlayerStore(s => s.licenses);
  const bs       = usePlayerStore(s => s.balanceSheet);
  const getTown  = useWorldStore(s => s.getTown);
  const clock    = useWorldStore(s => s.clock);

  useEffect(() => {
    api.investments.mine()
      .then(data => setInvestments(data as InvestmentEntry[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const selectedTown = getTown(form.town_id);
  const currentLevel = selectedTown
    ? selectedTown.infrastructure[form.infra_type as keyof typeof selectedTown.infrastructure]
    : 0;
  const requiredAmount = currentLevel < 5
    ? (INFRA_LEVEL_COSTS[form.infra_type] ?? [])[currentLevel] ?? 0
    : 0;
  const buildTicks = INFRA_BUILD_TICKS[form.infra_type] ?? 90;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      await api.investments.invest(form.town_id, form.infra_type, form.amount);
      setMessage('Investment placed successfully!');
      const updated = await api.investments.mine();
      setInvestments(updated as InvestmentEntry[]);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-xl font-bold text-gold-400 mb-6">Infrastructure Investments</h2>

      {/* New Investment Form */}
      <div className="bg-ink-700 border border-gold-600 rounded-lg p-4 mb-6">
        <h3 className="text-gold-400 font-semibold mb-3">Fund New Infrastructure</h3>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-parch-200 text-sm mb-1">Town (licensed only)</label>
            <select
              value={form.town_id}
              onChange={e => setForm(f => ({ ...f, town_id: e.target.value }))}
              className="w-full bg-ink-800 border border-gold-600 rounded px-3 py-2 text-sm text-parch-100"
              required
            >
              <option value="">Select a town...</option>
              {licenses.map(l => {
                const town = getTown(l.town_id);
                return (
                  <option key={l.town_id} value={l.town_id}>
                    {town?.name ?? l.town_id}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-parch-200 text-sm mb-1">Infrastructure Type</label>
            <select
              value={form.infra_type}
              onChange={e => setForm(f => ({ ...f, infra_type: e.target.value, amount: 0 }))}
              className="w-full bg-ink-800 border border-gold-600 rounded px-3 py-2 text-sm text-parch-100"
            >
              {INFRA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {selectedTown && (
            <>
              <div className="text-sm text-parch-200 col-span-2">
                Current level: {currentLevel}/5 •
                Required investment: <span className="text-gold-400 font-mono">{requiredAmount}g</span> •
                Build time: <span className="font-mono">{buildTicks} ticks ({Math.round(buildTicks / 90)} seasons)</span>
              </div>

              <div>
                <label className="block text-parch-200 text-sm mb-1">Amount (min: {requiredAmount}g)</label>
                <input
                  type="number"
                  min={requiredAmount}
                  value={form.amount || ''}
                  onChange={e => setForm(f => ({ ...f, amount: parseInt(e.target.value) || 0 }))}
                  className="w-full bg-ink-800 border border-gold-600 rounded px-3 py-2 text-sm font-mono text-parch-100"
                  required
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={submitting || currentLevel >= 5 || (bs ? bs.cash < form.amount : true)}
                  className="w-full bg-gold-500 hover:bg-gold-400 text-ink-800 font-bold py-2 rounded text-sm disabled:opacity-40"
                >
                  {submitting ? '...' : currentLevel >= 5 ? 'Max Level' : 'Invest'}
                </button>
              </div>
            </>
          )}
        </form>
        {message && <p className="mt-2 text-sm text-parch-200">{message}</p>}
      </div>

      {/* Active Investments */}
      <h3 className="text-gold-400 font-semibold mb-3">Your Investments ({investments.length})</h3>
      {loading ? (
        <p className="text-parch-200">Loading...</p>
      ) : investments.length === 0 ? (
        <p className="text-parch-200">No investments yet.</p>
      ) : (
        <div className="space-y-2">
          {investments.map(inv => {
            const town = getTown(inv.town_id);
            const ticksLeft = clock ? Math.max(0, inv.completion_tick - clock.current_tick) : '?';
            return (
              <div key={inv.id} className="bg-ink-700 border border-gold-600 rounded p-3 flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium">{town?.name ?? inv.town_id}</span>
                  <span className="text-parch-200 ml-2">— {inv.infra_type}</span>
                </div>
                <div className="flex items-center gap-4 text-parch-200">
                  <span className="font-mono text-gold-400">{inv.amount_invested.toFixed(0)}g</span>
                  {inv.completed ? (
                    <span className="text-safe-400 font-medium">✓ Complete</span>
                  ) : (
                    <span>{ticksLeft} ticks remaining</span>
                  )}
                  <span className="font-mono">{(inv.annual_return_rate * 100).toFixed(0)}%/yr return</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
