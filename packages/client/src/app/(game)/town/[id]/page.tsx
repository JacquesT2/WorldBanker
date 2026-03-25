'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useWorldStore } from '../../../../store/world-store';
import { usePlayerStore } from '../../../../store/player-store';
import { api } from '../../../../lib/api';

export default function TownDetailPage() {
  const { id } = useParams<{ id: string }>();
  const town    = useWorldStore(s => s.getTown(id));
  const region  = useWorldStore(s => town ? s.getRegion(town.region_id) : undefined);
  const events  = useWorldStore(s => s.getActiveEventsForTown(id));
  const licenses = usePlayerStore(s => s.licenses);
  const deposits = usePlayerStore(s => s.deposits);

  const isLicensed = licenses.some(l => l.town_id === id);
  const myDeposit  = deposits.find(d => d.town_id === id);

  const [depositRate, setDepositRate] = useState(myDeposit?.interest_rate_offered ?? 0.03);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const handleSaveRate = async () => {
    setSaving(true);
    try {
      await api.deposits.setRate(id, depositRate);
      setSavedMsg('Rate updated!');
      setTimeout(() => setSavedMsg(''), 2000);
    } catch (err) {
      setSavedMsg((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!town) {
    return <div className="p-8 text-parch-200">Town not found.</div>;
  }

  const infraEntries = Object.entries(town.infrastructure) as [string, number][];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gold-400">{town.name}</h2>
          <p className="text-parch-200 text-sm">{region?.name ?? ''} — {region?.type?.replace(/-/g, ' ')}</p>
        </div>
        <div className="text-right text-sm">
          {isLicensed ? (
            <span className="text-safe-400 font-medium">✓ Licensed</span>
          ) : (
            <span className="text-parch-200">Not licensed here</span>
          )}
        </div>
      </div>

      {/* Active Events */}
      {events.length > 0 && (
        <div className="mb-4 space-y-2">
          {events.map(event => (
            <div key={event.id} className="bg-danger-500 bg-opacity-20 border border-danger-400 rounded p-3 text-sm">
              <div className="flex justify-between">
                <span className="font-medium text-danger-400">{event.event_type.replace(/_/g, ' ').toUpperCase()}</span>
                <span className="text-parch-200">{event.ticks_remaining} ticks remaining</span>
              </div>
              <p className="text-parch-100 mt-1">{event.description}</p>
              <p className="text-parch-200 text-xs mt-1">
                Output: ×{event.economic_output_modifier.toFixed(2)} •
                Default risk: ×{event.loan_default_modifier.toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Town stats */}
        <div className="bg-ink-700 border border-gold-600 rounded-lg p-4">
          <h3 className="text-gold-400 font-semibold mb-3">Town Statistics</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-parch-200">Population</span>
              <span className="font-mono">{town.population.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-parch-200">Wealth / capita</span>
              <span className="font-mono text-gold-400">{town.wealth_per_capita.toFixed(0)}g</span>
            </div>
            <div className="flex justify-between">
              <span className="text-parch-200">Economic Output</span>
              <span className="font-mono text-gold-400">{(town.economic_output / 1000).toFixed(0)}k</span>
            </div>
          </div>

          <h4 className="text-parch-200 text-xs mt-3 mb-2">Resources</h4>
          <div className="flex flex-wrap gap-1">
            {town.resources.map(r => (
              <span key={r} className="bg-ink-800 border border-gold-600 text-xs px-2 py-0.5 rounded text-parch-100">
                {r}
              </span>
            ))}
          </div>

          <h4 className="text-parch-200 text-xs mt-3 mb-2">Risk Factors</h4>
          <div className="flex flex-wrap gap-1">
            {town.risk_factors.map(r => (
              <span key={r} className="bg-danger-500 bg-opacity-20 border border-danger-400 text-xs px-2 py-0.5 rounded text-danger-400">
                {r.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>

        {/* Infrastructure */}
        <div className="bg-ink-700 border border-gold-600 rounded-lg p-4">
          <h3 className="text-gold-400 font-semibold mb-3">Infrastructure</h3>
          {infraEntries.map(([key, level]) => (
            <div key={key} className="flex items-center gap-2 mb-2">
              <span className="text-parch-200 text-xs w-16 capitalize">{key}</span>
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }, (_, i) => (
                  <div
                    key={i}
                    className={`w-4 h-2 rounded-sm ${i < level ? 'bg-gold-400' : 'bg-ink-800'}`}
                  />
                ))}
              </div>
              <span className="text-xs text-parch-200">{level}/5</span>
            </div>
          ))}
        </div>
      </div>

      {/* Your position */}
      {isLicensed && myDeposit && (
        <div className="bg-ink-700 border border-gold-600 rounded-lg p-4">
          <h3 className="text-gold-400 font-semibold mb-3">Your Position in {town.name}</h3>
          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <p className="text-parch-200 mb-1">Deposits Held</p>
              <p className="font-mono text-gold-400">{myDeposit.balance.toFixed(0)}g</p>
            </div>
            <div>
              <p className="text-parch-200 mb-1">Current Rate</p>
              <p className="font-mono text-gold-400">{(myDeposit.interest_rate_offered * 100).toFixed(1)}%</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-parch-200 text-sm">Set deposit rate:</label>
            <input
              type="number"
              min={0}
              max={0.15}
              step={0.005}
              value={depositRate}
              onChange={e => setDepositRate(parseFloat(e.target.value))}
              className="w-20 bg-ink-800 border border-gold-600 rounded px-2 py-1 text-sm font-mono text-parch-100"
            />
            <span className="text-parch-200 text-sm">= {(depositRate * 100).toFixed(1)}%/yr</span>
            <button
              onClick={handleSaveRate}
              disabled={saving}
              className="bg-gold-500 hover:bg-gold-400 text-ink-800 text-sm font-bold px-3 py-1 rounded disabled:opacity-50"
            >
              {saving ? '...' : 'Save'}
            </button>
            {savedMsg && <span className="text-safe-400 text-sm">{savedMsg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
