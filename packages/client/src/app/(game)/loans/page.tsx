'use client';
import { useState } from 'react';
import { usePlayerStore } from '../../../store/player-store';
import { useWorldStore } from '../../../store/world-store';
import { api } from '../../../lib/api';

export default function LoansPage() {
  const proposals   = usePlayerStore(s => s.proposals);
  const removeProposal = usePlayerStore(s => s.removeProposal);
  const addLoan     = usePlayerStore(s => s.addLoan);
  const getTown     = useWorldStore(s => s.getTown);
  const getRegion   = useWorldStore(s => s.getRegion);
  const getEvents   = useWorldStore(s => s.getActiveEventsForTown);
  const clock       = useWorldStore(s => s.clock);

  const [rates, setRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  const handleAccept = async (proposalId: string) => {
    const rate = rates[proposalId] ?? 0.10;
    setLoading(proposalId);
    try {
      const res = await api.loans.accept(proposalId, rate);
      setMessages(m => ({ ...m, [proposalId]: `Accepted! Loan ID: ${res.loan_id.slice(0, 8)}...` }));
      removeProposal(proposalId);
    } catch (err) {
      setMessages(m => ({ ...m, [proposalId]: (err as Error).message }));
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async (proposalId: string) => {
    await api.loans.reject(proposalId).catch(() => {});
    removeProposal(proposalId);
  };

  const activeProposals = proposals.filter(
    p => !p.accepted_by_player_id && (!clock || p.expires_at_tick > clock.current_tick)
  );

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-gold-400 mb-4">
        Loan Queue ({activeProposals.length})
      </h2>

      {activeProposals.length === 0 && (
        <div className="bg-ink-700 border border-gold-600 rounded-lg p-8 text-center text-parch-200">
          No loan proposals at the moment. Expand to more towns to see more opportunities.
        </div>
      )}

      <div className="space-y-4">
        {activeProposals.map(proposal => {
          const town   = getTown(proposal.town_id);
          const region = town ? getRegion(town.region_id) : undefined;
          const events = getEvents(proposal.town_id);
          const rate   = rates[proposal.id] ?? proposal.max_acceptable_rate * 0.8;
          const annualDefaultRisk = (proposal.base_default_probability * 360 * 100).toFixed(1);
          const expiresIn = clock ? proposal.expires_at_tick - clock.current_tick : '?';

          return (
            <div key={proposal.id} className="bg-ink-700 border border-gold-600 rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-parch-100">{proposal.borrower_name}</h3>
                  <p className="text-sm text-parch-200">
                    {proposal.borrower_type} — {town?.name ?? proposal.town_id}
                    {region && `, ${region.name}`}
                  </p>
                </div>
                <div className="text-right text-xs text-parch-200">
                  Expires in {expiresIn} ticks
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                <div>
                  <p className="text-parch-200 text-xs">Requested Amount</p>
                  <p className="font-mono text-gold-400">{proposal.requested_amount.toFixed(0)}g</p>
                </div>
                <div>
                  <p className="text-parch-200 text-xs">Term</p>
                  <p className="font-mono">{proposal.term_ticks} ticks ({Math.round(proposal.term_ticks / 90)} seasons)</p>
                </div>
                <div>
                  <p className="text-parch-200 text-xs">Max Rate</p>
                  <p className="font-mono text-parch-100">{(proposal.max_acceptable_rate * 100).toFixed(1)}%/yr</p>
                </div>
                <div>
                  <p className="text-parch-200 text-xs">Base Default Risk</p>
                  <p className={`font-mono ${parseFloat(annualDefaultRisk) > 15 ? 'text-danger-400' : 'text-parch-100'}`}>
                    ~{annualDefaultRisk}%/yr
                  </p>
                </div>
                <div>
                  <p className="text-parch-200 text-xs">Collateral</p>
                  <p className="font-mono">{proposal.collateral_value.toFixed(0)}g ({(proposal.partial_recovery_rate * 100).toFixed(0)}% recovery)</p>
                </div>
                <div>
                  <p className="text-parch-200 text-xs">Region Risk</p>
                  <p className="font-mono">{region ? `×${region.base_risk_modifier.toFixed(2)}` : '—'}</p>
                </div>
              </div>

              {/* Active events warning */}
              {events.length > 0 && (
                <div className="mb-3 text-xs text-danger-400">
                  ⚠ {events.length} active event(s) in this town: {events.map(e => e.event_type.replace(/_/g, ' ')).join(', ')}
                </div>
              )}

              <div className="flex items-center gap-3">
                <label className="text-parch-200 text-sm">Your rate:</label>
                <input
                  type="number"
                  min={0.02}
                  max={proposal.max_acceptable_rate}
                  step={0.005}
                  value={rate}
                  onChange={e => setRates(r => ({ ...r, [proposal.id]: parseFloat(e.target.value) }))}
                  className="w-20 bg-ink-800 border border-gold-600 rounded px-2 py-1 text-sm font-mono text-parch-100"
                />
                <span className="text-parch-200 text-sm">= {(rate * 100).toFixed(1)}%/yr</span>

                <button
                  onClick={() => handleAccept(proposal.id)}
                  disabled={loading === proposal.id}
                  className="ml-auto bg-safe-500 hover:bg-safe-400 text-white text-sm font-bold px-4 py-1.5 rounded disabled:opacity-50"
                >
                  {loading === proposal.id ? '...' : 'Accept'}
                </button>
                <button
                  onClick={() => handleReject(proposal.id)}
                  disabled={loading === proposal.id}
                  className="bg-ink-800 border border-gold-600 hover:bg-ink-700 text-parch-200 text-sm px-4 py-1.5 rounded"
                >
                  Decline
                </button>
              </div>

              {messages[proposal.id] && (
                <p className="text-sm mt-2 text-parch-200">{messages[proposal.id]}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
