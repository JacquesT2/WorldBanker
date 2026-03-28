'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWorldStore } from '../../../../store/world-store';
import { usePlayerStore } from '../../../../store/player-store';
import { api } from '../../../../lib/api';
import TownCharts from '../../../../components/TownCharts';
interface CompetingBank {
  player_id: string;
  bank_name: string;
  deposit_rate: number;
  reputation: number;
  is_you: boolean;
}

export default function TownDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const town    = useWorldStore(s => s.getTown(id));
  const region  = useWorldStore(s => town ? s.getRegion(town.region_id) : undefined);
  const events  = useWorldStore(s => s.getActiveEventsForTown(id));
  const licenses = usePlayerStore(s => s.licenses);
  const deposits = usePlayerStore(s => s.deposits);

  const townDepositHistory = usePlayerStore(s => s.townDepositHistory[id] ?? []);

  const isLicensed = licenses.some(l => l.town_id === id);
  const myDeposit  = deposits.find(d => d.town_id === id);

  const [depositRate, setDepositRate] = useState(myDeposit?.interest_rate_offered ?? 0.03);
  const [competingBanks, setCompetingBanks] = useState<CompetingBank[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    api.world.town(id).then((data: any) => {
      if (data?.competing_banks) setCompetingBanks(data.competing_banks);
    }).catch(() => {});
  }, [id]);

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
    return <div className="p-8 text-ink-700">Town not found.</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-2xl font-bold text-gold-400">{town.name}</h2>
          <p className="text-ink-700 text-sm">{region?.name ?? ''} — {region?.type?.replace(/-/g, ' ')}</p>
        </div>
        <div className="flex items-center gap-3">
          {isLicensed ? (
            <span className="text-safe-400 text-sm font-medium bg-safe-400 bg-opacity-10 px-2 py-1 rounded border border-safe-400 border-opacity-30">
              ✓ Licensed
            </span>
          ) : (
            <span className="text-ink-700 text-sm">Not licensed here</span>
          )}
          <button
            onClick={() => router.push('/world-map')}
            className="text-xs px-2 py-1 border border-parch-300 rounded text-ink-700 hover:border-gold-400 hover:text-gold-400"
          >
            ← Map
          </button>
        </div>
      </div>

      {/* ── Active Events ─────────────────────────────────────────── */}
      {events.length > 0 && (
        <div className="mb-5 space-y-2">
          {events.map(event => (
            <div key={event.id} className="bg-danger-500 bg-opacity-10 border border-danger-400 rounded-lg p-3 text-sm">
              <div className="flex justify-between">
                <span className="font-medium text-danger-400">{event.event_type.replace(/_/g, ' ').toUpperCase()}</span>
                <span className="text-ink-700">{event.ticks_remaining} ticks remaining</span>
              </div>
              <p className="text-ink-800 mt-1">{event.description}</p>
              <p className="text-ink-700 text-xs mt-1">
                Output: ×{event.economic_output_modifier.toFixed(2)} ·
                Default risk: ×{event.loan_default_modifier.toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Stats + Resources ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="bg-parch-50 border border-parch-300 rounded-lg p-4">
          <h3 className="text-gold-400 font-semibold mb-3 text-sm uppercase tracking-wide">Town Statistics</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-700">Population</span>
              <span className="font-mono">{town.population.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-700">Wealth / capita</span>
              <span className="font-mono text-gold-400">{town.wealth_per_capita.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-700">Economic Output</span>
              <span className="font-mono text-gold-400">{town.economic_output.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
          </div>

          <h4 className="text-ink-700 text-xs mt-3 mb-2 uppercase tracking-wide">Resources</h4>
          <div className="flex flex-wrap gap-1">
            {town.resources.map(r => (
              <span key={r} className="bg-parch-100 border border-parch-300 text-xs px-2 py-0.5 rounded text-ink-800 capitalize">
                {r.replace(/_/g, ' ')}
              </span>
            ))}
          </div>

          <h4 className="text-ink-700 text-xs mt-3 mb-2 uppercase tracking-wide">Risk Factors</h4>
          <div className="flex flex-wrap gap-1">
            {town.risk_factors.length === 0 ? (
              <span className="text-xs text-ink-700">None</span>
            ) : town.risk_factors.map(r => (
              <span key={r} className="bg-danger-500 bg-opacity-10 border border-danger-400 text-xs px-2 py-0.5 rounded text-danger-400">
                {r.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>

      </div>

      {/* ── Your position ─────────────────────────────────────────── */}
      {isLicensed && myDeposit && (
        <div className="bg-parch-50 border border-parch-300 rounded-lg p-4 mb-5">
          <h3 className="text-gold-400 font-semibold mb-3 text-sm uppercase tracking-wide">Your Position in {town.name}</h3>
          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <p className="text-ink-700 mb-1">Deposits Held</p>
              <p className="font-mono text-gold-400">{myDeposit.balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div>
              <p className="text-ink-700 mb-1">Current Rate</p>
              <p className="font-mono text-gold-400">{(myDeposit.interest_rate_offered * 100).toFixed(1)}%</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-ink-700 text-sm">Set deposit rate:</label>
            <input
              type="number"
              min={0}
              max={0.15}
              step={0.005}
              value={depositRate}
              onChange={e => setDepositRate(parseFloat(e.target.value))}
              className="w-20 bg-white border border-parch-300 rounded px-2 py-1 text-sm font-mono text-ink-800"
            />
            <span className="text-ink-700 text-sm">= {(depositRate * 100).toFixed(1)}%/yr</span>
            <button
              onClick={handleSaveRate}
              disabled={saving}
              className="bg-gold-500 hover:bg-gold-400 text-parch-50 text-sm font-bold px-3 py-1 rounded disabled:opacity-50"
            >
              {saving ? '…' : 'Save'}
            </button>
            {savedMsg && <span className="text-safe-400 text-sm">{savedMsg}</span>}
          </div>
        </div>
      )}

      {/* ── Charts ────────────────────────────────────────────────── */}
      {(isLicensed || competingBanks.length > 0) && (
        <div>
          <h3 className="text-gold-400 font-semibold mb-4 text-sm uppercase tracking-wide">Market Analytics</h3>
          <TownCharts
            townId={id}
            competingBanks={competingBanks}
            depositHistory={townDepositHistory}
            economicOutput={town.economic_output}
          />
        </div>
      )}
    </div>
  );
}
