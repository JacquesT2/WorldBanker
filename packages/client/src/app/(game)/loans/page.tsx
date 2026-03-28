'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, Cell,
  ScatterChart, Scatter, ZAxis,
} from 'recharts';
import { usePlayerStore } from '../../../store/player-store';
import { useWorldStore } from '../../../store/world-store';
import { api } from '../../../lib/api';
import { getSocket } from '../../../lib/socket';
import type { LoanProposal, LoanAuction, BalanceSheet } from '@argentum/shared';
import {
  type AutoRule, type LoanLike,
  DEFAULT_RULE,
  lgd, netYieldPct, passesRule,
} from '../../../lib/auto-bid';

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toFixed(0);
}

function riskColor(annualPct: number): string {
  if (annualPct > 25) return 'text-danger-400';
  if (annualPct > 12) return 'text-amber-700';
  return 'text-safe-400';
}

function riskBadge(annualPct: number): string {
  if (annualPct > 25) return 'bg-danger-400 bg-opacity-10 text-danger-400 border-danger-400';
  if (annualPct > 12) return 'bg-amber-100 text-amber-800 border-amber-400';
  return 'bg-safe-400 bg-opacity-10 text-safe-400 border-safe-400';
}

type ProposalSort = 'amount_desc' | 'amount_asc' | 'risk_asc' | 'risk_desc' | 'rate_desc' | 'term_asc' | 'expiry_asc';

type RiskFilter  = 'all' | 'low' | 'medium' | 'high';
type TypeFilter  = 'all' | string;

// ─── Automated lending ── types/helpers imported from lib/auto-bid ──────────

// ─── Queue tab ──────────────────────────────────────────────────────────────

function LoanQueue() {
  const proposals      = usePlayerStore(s => s.proposals);
  const bs             = usePlayerStore(s => s.balanceSheet);
  const removeProposal = usePlayerStore(s => s.removeProposal);
  const addLoan        = usePlayerStore(s => s.addLoan);
  const getTown        = useWorldStore(s => s.getTown);
  const getRegion      = useWorldStore(s => s.getRegion);
  const getEvents      = useWorldStore(s => s.getActiveEventsForTown);
  const clock          = useWorldStore(s => s.clock);

  const [rates, setRates]         = useState<Record<string, number>>({});
  const [loading, setLoading]     = useState<string | null>(null);
  const [messages, setMessages]   = useState<Record<string, string>>({});
  const [sort, setSort]           = useState<ProposalSort>('expiry_asc');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  const handleAccept = async (proposalId: string) => {
    const rate = rates[proposalId] ?? 0.10;
    setLoading(proposalId);
    try {
      const res = await api.loans.accept(proposalId, rate);
      setMessages(m => ({ ...m, [proposalId]: `Accepted — loan ${res.loan_id.slice(0, 8)}…` }));
      removeProposal(proposalId);
      addLoan(res.loan);
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

  const active = proposals.filter(
    p => !p.accepted_by_player_id && (!clock || p.expires_at_tick > clock.current_tick)
  );

  // Collect unique company types for filter
  const borrowerTypes = Array.from(new Set(active.map(p => p.company_type))).sort();

  const filtered = active.filter(p => {
    const riskPct = p.base_default_probability * 360 * 100;
    if (riskFilter === 'low'    && riskPct >= 12) return false;
    if (riskFilter === 'medium' && (riskPct < 12 || riskPct >= 25)) return false;
    if (riskFilter === 'high'   && riskPct < 25) return false;
    if (typeFilter !== 'all'    && p.company_type !== typeFilter) return false;
    if (minAmount && p.requested_amount < parseFloat(minAmount)) return false;
    if (maxAmount && p.requested_amount > parseFloat(maxAmount)) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const riskA = a.base_default_probability * 360 * 100;
    const riskB = b.base_default_probability * 360 * 100;
    switch (sort) {
      case 'amount_desc': return b.requested_amount - a.requested_amount;
      case 'amount_asc':  return a.requested_amount - b.requested_amount;
      case 'risk_asc':    return riskA - riskB;
      case 'risk_desc':   return riskB - riskA;
      case 'rate_desc':   return b.max_acceptable_rate - a.max_acceptable_rate;
      case 'term_asc':    return a.term_ticks - b.term_ticks;
      case 'expiry_asc':  return (a.expires_at_tick ?? 0) - (b.expires_at_tick ?? 0);
      default:            return 0;
    }
  });

  const reserveLow = bs && bs.total_deposits_owed > 0 && bs.reserve_ratio < 0.10;

  return (
    <div>
      {/* Cash / reserve status bar */}
      {bs && (
        <div className={`flex items-center gap-6 rounded-lg px-4 py-3 mb-5 border text-sm ${
          reserveLow ? 'bg-danger-400 bg-opacity-10 border-danger-400' : 'bg-parch-50 border-parch-300'
        }`}>
          <div>
            <span className="text-xs text-ink-700 mr-1">Cash on hand:</span>
            <span className="font-mono font-semibold text-gold-400">{fmt(bs.cash)}</span>
          </div>
          <div>
            <span className="text-xs text-ink-700 mr-1">Deposits owed:</span>
            <span className="font-mono">{fmt(bs.total_deposits_owed)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-700 mr-1">Reserve ratio:</span>
            <span className={`font-mono font-semibold ${reserveLow ? 'text-danger-400' : 'text-safe-400'}`}>
              {(bs.reserve_ratio * 100).toFixed(1)}%
            </span>
            <div className="h-2 w-24 bg-parch-300 rounded overflow-hidden">
              <div
                className={`h-full rounded transition-all ${reserveLow ? 'bg-danger-400' : 'bg-safe-400'}`}
                style={{ width: `${Math.min(bs.reserve_ratio * 100 * 5, 100)}%` }}
              />
            </div>
          </div>
          <div>
            <span className="text-xs text-ink-700 mr-1">Equity:</span>
            <span className={`font-mono ${bs.equity >= 0 ? 'text-safe-400' : 'text-danger-400'}`}>
              {bs.equity < 0 ? '-' : ''}{fmt(Math.abs(bs.equity))}
            </span>
          </div>
          {reserveLow && (
            <span className="ml-auto text-danger-400 text-xs font-semibold">⚠ Reserve critical — lending more increases risk</span>
          )}
        </div>
      )}

      {/* Filters + sort */}
      <div className="bg-parch-50 border border-parch-300 rounded-lg p-3 mb-4 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-ink-700 w-12 shrink-0">Sort:</span>
          {([
            ['expiry_asc',  'Expiring soon'],
            ['amount_desc', 'Largest'],
            ['amount_asc',  'Smallest'],
            ['risk_asc',    'Lowest risk'],
            ['risk_desc',   'Highest risk'],
            ['rate_desc',   'Best rate'],
            ['term_asc',    'Short term'],
          ] as [ProposalSort, string][]).map(([val, label]) => (
            <button key={val} onClick={() => setSort(val)}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                sort === val ? 'bg-gold-500 text-parch-50 border-gold-500' : 'border-parch-300 text-ink-700 hover:bg-parch-200'
              }`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-ink-700 w-12 shrink-0">Filter:</span>

          <div className="flex items-center gap-1">
            <span className="text-xs text-ink-700">Risk:</span>
            {(['all', 'low', 'medium', 'high'] as RiskFilter[]).map(r => (
              <button key={r} onClick={() => setRiskFilter(r)}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                  riskFilter === r ? 'bg-gold-500 text-parch-50 border-gold-500' : 'border-parch-300 text-ink-700 hover:bg-parch-200'
                }`}>
                {r}
              </button>
            ))}
          </div>

          {borrowerTypes.length > 1 && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-ink-700">Type:</span>
              <button onClick={() => setTypeFilter('all')}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                  typeFilter === 'all' ? 'bg-gold-500 text-parch-50 border-gold-500' : 'border-parch-300 text-ink-700 hover:bg-parch-200'
                }`}>
                all
              </button>
              {borrowerTypes.map(t => (
                <button key={t} onClick={() => setTypeFilter(t)}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors capitalize ${
                    typeFilter === t ? 'bg-gold-500 text-parch-50 border-gold-500' : 'border-parch-300 text-ink-700 hover:bg-parch-200'
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1">
            <span className="text-xs text-ink-700">Amount:</span>
            <input type="number" placeholder="min" value={minAmount}
              onChange={e => setMinAmount(e.target.value)}
              className="w-20 bg-white border border-parch-300 rounded px-2 py-0.5 text-xs font-mono text-ink-800" />
            <span className="text-xs text-ink-700">–</span>
            <input type="number" placeholder="max" value={maxAmount}
              onChange={e => setMaxAmount(e.target.value)}
              className="w-20 bg-white border border-parch-300 rounded px-2 py-0.5 text-xs font-mono text-ink-800" />
          </div>

          {(riskFilter !== 'all' || typeFilter !== 'all' || minAmount || maxAmount) && (
            <button onClick={() => { setRiskFilter('all'); setTypeFilter('all'); setMinAmount(''); setMaxAmount(''); }}
              className="text-xs text-danger-400 hover:underline ml-1">
              Clear filters
            </button>
          )}

          <span className="text-xs text-ink-700 ml-auto">
            {sorted.length} of {active.length} proposals
          </span>
        </div>
      </div>

      {sorted.length === 0 && (
        <div className="bg-parch-50 border border-parch-300 rounded-lg p-8 text-center text-ink-700">
          No loan proposals right now. Expand to more towns to see more opportunities.
        </div>
      )}

      <div className="space-y-3">
        {sorted.map(proposal => {
          const town    = getTown(proposal.town_id);
          const region  = town ? getRegion(town.region_id) : undefined;
          const events  = getEvents(proposal.town_id);
          const rate    = rates[proposal.id] ?? proposal.max_acceptable_rate * 0.8;
          const riskPct = proposal.base_default_probability * 360 * 100;
          const expiresIn = clock ? proposal.expires_at_tick - clock.current_tick : '?';
          const seasons = Math.round(proposal.term_ticks / 90);

          return (
            <div key={proposal.id} className="bg-parch-50 border border-parch-300 rounded-lg p-4">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-ink-800">{proposal.borrower_name}</h3>
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${riskBadge(riskPct)}`}>
                      {riskPct.toFixed(1)}%/yr risk
                    </span>
                    {events.length > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded border bg-danger-400 bg-opacity-10 text-danger-400 border-danger-400">
                        ⚠ {events.length} event{events.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-ink-700 mt-0.5">
                    {proposal.company_type} — {town?.name ?? proposal.town_id}
                    {region && `, ${region.name}`}
                  </p>
                </div>
                <div className="text-right text-xs text-ink-700 shrink-0 ml-4">
                  <p className={typeof expiresIn === 'number' && expiresIn < 10 ? 'text-danger-400 font-medium' : ''}>
                    Expires in {expiresIn} ticks
                  </p>
                </div>
              </div>

              {/* Key stats grid */}
              <div className="grid grid-cols-4 gap-3 text-sm mb-3 bg-parch-100 rounded p-3">
                <div>
                  <p className="text-ink-700 text-xs mb-0.5">Requested</p>
                  <p className="font-mono font-semibold text-gold-400">{fmt(proposal.requested_amount)}</p>
                </div>
                <div>
                  <p className="text-ink-700 text-xs mb-0.5">Max rate</p>
                  <p className="font-mono">{(proposal.max_acceptable_rate * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-ink-700 text-xs mb-0.5">Term</p>
                  <p className="font-mono">{seasons} season{seasons !== 1 ? 's' : ''}</p>
                </div>
                <div>
                  <p className="text-ink-700 text-xs mb-0.5">Collateral</p>
                  <p className="font-mono">{fmt(proposal.collateral_value)} ({(proposal.partial_recovery_rate * 100).toFixed(0)}%)</p>
                </div>
              </div>

              {/* Rate input + actions */}
              <div className="flex items-center gap-3">
                <label className="text-ink-700 text-sm">Your rate:</label>
                <input
                  type="number"
                  min={0.02}
                  max={proposal.max_acceptable_rate}
                  step={0.005}
                  value={rate}
                  onChange={e => setRates(r => ({ ...r, [proposal.id]: parseFloat(e.target.value) }))}
                  className="w-20 bg-white border border-parch-300 rounded px-2 py-1 text-sm font-mono text-ink-800"
                />
                <span className="text-ink-700 text-sm">{(rate * 100).toFixed(1)}%/yr</span>
                <span className="text-xs text-ink-700 ml-1">
                  → est. income: {fmt(proposal.requested_amount * rate * (proposal.term_ticks / 360))}
                </span>

                <button
                  onClick={() => handleAccept(proposal.id)}
                  disabled={loading === proposal.id}
                  className="ml-auto bg-safe-500 hover:bg-safe-400 text-white text-sm font-bold px-4 py-1.5 rounded disabled:opacity-50"
                >
                  {loading === proposal.id ? '…' : 'Accept'}
                </button>
                <button
                  onClick={() => handleReject(proposal.id)}
                  disabled={loading === proposal.id}
                  className="bg-parch-100 border border-parch-300 hover:bg-parch-200 text-ink-700 text-sm px-4 py-1.5 rounded"
                >
                  Decline
                </button>
              </div>

              {messages[proposal.id] && (
                <p className="text-sm mt-2 text-ink-700">{messages[proposal.id]}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Portfolio tab ───────────────────────────────────────────────────────────

const GANTT_TOOLTIP = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{ background: '#fefcf5', border: '1px solid #c4a870', borderRadius: 4, padding: '8px 12px' }}>
      <p className="text-xs font-semibold text-ink-800 mb-1">{d.borrower_name}</p>
      <p className="text-xs text-ink-700">Principal: {fmt(d.principal)}</p>
      <p className="text-xs text-ink-700">Rate: {(d.interest_rate * 100).toFixed(1)}%/yr</p>
      <p className="text-xs text-ink-700">Interest earned: {fmt(d.interest_earned)}</p>
      <p className="text-xs text-ink-700">Matures: tick {d.maturity_tick}</p>
      <p className="text-xs text-ink-700">Remaining: {d.ticks_remaining} ticks</p>
    </div>
  );
};

function LoanPortfolio() {
  const loans  = usePlayerStore(s => s.loans);
  const clock  = useWorldStore(s => s.clock);
  const getTown = useWorldStore(s => s.getTown);

  const currentTick = clock?.current_tick ?? 0;
  const active = loans.filter(l => l.status === 'active');
  const closed = loans.filter(l => l.status !== 'active');

  if (active.length === 0) {
    return (
      <div className="bg-parch-50 border border-parch-300 rounded-lg p-8 text-center text-ink-700">
        No active loans. Accept proposals from the Queue tab.
      </div>
    );
  }

  // Summary stats
  const totalPrincipal    = active.reduce((s, l) => s + l.principal, 0);
  const totalInterestEarned = active.reduce((s, l) =>
    s + l.principal * l.interest_rate * (l.ticks_elapsed / 360), 0);
  const avgRate = active.reduce((s, l) => s + l.interest_rate, 0) / active.length;
  const nextMaturity = active.reduce((min, l) => {
    const mat = l.created_at_tick + l.term_ticks;
    return mat < min ? mat : min;
  }, Infinity);

  // Gantt data
  const ganttData = [...active]
    .sort((a, b) => (a.created_at_tick + a.term_ticks) - (b.created_at_tick + b.term_ticks))
    .map(l => {
      const maturity_tick   = l.created_at_tick + l.term_ticks;
      const ticks_remaining = Math.max(0, maturity_tick - currentTick);
      const interest_earned = l.principal * l.interest_rate * (l.ticks_elapsed / 360);
      const elapsed         = currentTick - l.created_at_tick;
      return {
        borrower_name: l.borrower_name,
        principal:     l.principal,
        interest_rate: l.interest_rate,
        interest_earned,
        maturity_tick,
        ticks_remaining,
        created_at_tick: l.created_at_tick,
        term_ticks: l.term_ticks,
        // Stacked bar: [offset (invisible), elapsed, remaining]
        offset:    l.created_at_tick,
        elapsed:   elapsed,
        remaining: ticks_remaining,
        riskPct:   l.default_probability_per_tick * 360 * 100,
      };
    });

  // Axis domain
  const minTick = Math.min(...ganttData.map(d => d.created_at_tick));
  const maxTick = Math.max(...ganttData.map(d => d.maturity_tick));

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Active loans',      value: String(active.length) },
          { label: 'Total principal',   value: fmt(totalPrincipal) },
          { label: 'Interest earned',   value: fmt(totalInterestEarned) },
          { label: 'Avg rate',          value: `${(avgRate * 100).toFixed(1)}%` },
        ].map(s => (
          <div key={s.label} className="bg-parch-50 border border-parch-300 rounded-lg p-3 text-center">
            <p className="text-xs text-ink-700 mb-1">{s.label}</p>
            <p className="font-mono font-semibold text-gold-400">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Maturity timeline (Gantt) */}
      <div className="bg-parch-50 border border-parch-300 rounded-lg p-4">
        <h3 className="text-gold-400 font-semibold mb-1 text-sm">Maturity Timeline</h3>
        <p className="text-xs text-ink-700 mb-4">
          Tan = time elapsed · Green = time remaining · Dashed line = now (tick {currentTick})
        </p>
        <ResponsiveContainer width="100%" height={Math.max(120, active.length * 32)}>
          <BarChart data={ganttData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barSize={14}>
            <CartesianGrid strokeDasharray="3 3" stroke="#c4a870" opacity={0.3} horizontal={false} />
            <XAxis
              type="number"
              domain={[minTick, maxTick]}
              tick={{ fontSize: 10, fill: '#5a3818' }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="borrower_name"
              tick={{ fontSize: 10, fill: '#5a3818' }}
              tickLine={false}
              width={80}
            />
            <Tooltip content={<GANTT_TOOLTIP />} />
            <ReferenceLine x={currentTick} stroke="#963020" strokeDasharray="4 2" strokeWidth={1.5} />
            {/* Invisible offset bar to push bars to start position */}
            <Bar dataKey="offset" stackId="g" fill="transparent" />
            {/* Elapsed portion */}
            <Bar dataKey="elapsed" stackId="g" name="Elapsed" fill="#c4a870" radius={[0, 0, 0, 0]} />
            {/* Remaining portion */}
            <Bar dataKey="remaining" stackId="g" name="Remaining" fill="#2a6840" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Loan table */}
      <div className="bg-parch-50 border border-parch-300 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-parch-200 text-ink-700 text-xs">
              <th className="text-left px-4 py-2">Borrower</th>
              <th className="text-left px-4 py-2">Town</th>
              <th className="text-right px-4 py-2">Principal</th>
              <th className="text-right px-4 py-2">Outstanding</th>
              <th className="text-right px-4 py-2">Rate</th>
              <th className="text-right px-4 py-2">Interest earned</th>
              <th className="text-right px-4 py-2">Matures</th>
              <th className="text-right px-4 py-2">Default risk</th>
            </tr>
          </thead>
          <tbody>
            {active.map(loan => {
              const town          = getTown(loan.town_id);
              const maturityTick  = loan.created_at_tick + loan.term_ticks;
              const ticksLeft     = Math.max(0, maturityTick - currentTick);
              const interestEarned = loan.principal * loan.interest_rate * (loan.ticks_elapsed / 360);
              const riskPct       = loan.default_probability_per_tick * 360 * 100;
              const progress      = Math.round((loan.ticks_elapsed / loan.term_ticks) * 100);
              return (
                <tr key={loan.id} className="border-t border-parch-200 hover:bg-parch-100">
                  <td className="px-4 py-2.5 font-medium">{loan.borrower_name}</td>
                  <td className="px-4 py-2.5 text-ink-700">{town?.name ?? loan.town_id.replace('town_', '')}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmt(loan.principal)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gold-400">{fmt(loan.outstanding_balance)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{(loan.interest_rate * 100).toFixed(1)}%</td>
                  <td className="px-4 py-2.5 text-right font-mono text-safe-400">{fmt(interestEarned)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="font-mono">tick {maturityTick}</span>
                    <span className="text-ink-700 text-xs ml-1">({ticksLeft} left)</span>
                    <div className="h-1 bg-parch-300 rounded mt-1 overflow-hidden">
                      <div className="h-full bg-gold-400 rounded" style={{ width: `${progress}%` }} />
                    </div>
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono text-xs ${riskColor(riskPct)}`}>
                    ~{riskPct.toFixed(1)}%/yr
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Closed loans */}
      {closed.length > 0 && (
        <div className="bg-parch-50 border border-parch-300 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-parch-200 text-xs font-semibold text-ink-700">
            Closed Loans ({closed.length})
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-ink-700 text-xs border-b border-parch-200">
                <th className="text-left px-4 py-2">Borrower</th>
                <th className="text-right px-4 py-2">Principal</th>
                <th className="text-right px-4 py-2">Rate</th>
                <th className="text-right px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {closed.map(loan => (
                <tr key={loan.id} className="border-t border-parch-200 opacity-60">
                  <td className="px-4 py-2">{loan.borrower_name}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(loan.principal)}</td>
                  <td className="px-4 py-2 text-right font-mono">{(loan.interest_rate * 100).toFixed(1)}%</td>
                  <td className={`px-4 py-2 text-right text-xs font-medium ${loan.status === 'repaid' ? 'text-safe-400' : 'text-danger-400'}`}>
                    {loan.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Automated lending tab ───────────────────────────────────────────────────

const SCATTER_TOOLTIP = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const sep = <div style={{ borderTop: '1px solid #c4a870', margin: '5px 0' }} />;
  return (
    <div style={{ background: '#fefcf5', border: '1px solid #c4a870', borderRadius: 4, padding: '8px 12px', fontSize: 12, minWidth: 200 }}>
      <p className="font-semibold text-ink-800 mb-1">{d.name}
        <span className="font-normal text-ink-700 ml-1 capitalize">({d.type})</span>
      </p>
      <p className="text-ink-700">Amount: <span className="font-mono">{fmt(d.amount)}</span></p>
      {sep}
      <p className="text-ink-700">Max rate: <span className="font-mono">{d.ratePct.toFixed(1)}%</span></p>
      <p className="text-ink-700">Annual default risk: <span className="font-mono">{d.riskPct.toFixed(1)}%</span></p>
      <p className="text-ink-700">Collateral coverage: <span className="font-mono">{d.collateralCovPct.toFixed(0)}%</span>
        <span className="text-ink-700 opacity-60 ml-1">({fmt(d.collateralAdj)} recoverable)</span>
      </p>
      <p className="text-ink-700">LGD: <span className="font-mono">{(d.lgdVal * 100).toFixed(0)}%</span>
        <span className="text-ink-700 opacity-60 ml-1">of principal at risk</span>
      </p>
      <p className="text-ink-700">Expected annual loss: <span className="font-mono text-danger-400">{d.expLossPct.toFixed(1)}%</span>
        <span className="text-ink-700 opacity-60 ml-1">= {d.riskPct.toFixed(1)}% × {(d.lgdVal * 100).toFixed(0)}%</span>
      </p>
      {sep}
      <p className="font-semibold text-ink-800">Net yield: <span className="font-mono text-safe-400">{d.netYieldPct.toFixed(1)}%</span>
        <span className="font-normal text-ink-700 opacity-60 ml-1">= {d.ratePct.toFixed(1)}% − {d.expLossPct.toFixed(1)}%</span>
      </p>
      {sep}
      {d.rejectReason ? (
        <p className="text-danger-400 font-semibold text-xs">✗ {d.rejectReason}</p>
      ) : (
        <p className="text-safe-400 font-semibold text-xs">✓ Passes all rules</p>
      )}
    </div>
  );
};

function RuleField({
  label, help, children,
}: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-ink-800 mb-0.5">{label}</label>
      {help && <p className="text-xs text-ink-700 mb-1 opacity-70">{help}</p>}
      {children}
    </div>
  );
}

function AutomatedLending() {
  const auctions = usePlayerStore(s => s.auctions);
  const bs       = usePlayerStore(s => s.balanceSheet);
  const clock    = useWorldStore(s => s.clock);

  const [rule, setRule] = useState<AutoRule>({ player_id: '', ...DEFAULT_RULE });
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load rule from server on mount
  useEffect(() => {
    api.autoBid.getRule().then(setRule).catch(() => {});
  }, []);

  // Update a field, persist to server with debounce
  const updateRule = <K extends keyof AutoRule>(key: K, value: AutoRule[K]) => {
    setRule(prev => {
      const next = { ...prev, [key]: value };
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        api.autoBid.setRule(next).catch(() => {});
      }, 500);
      return next;
    });
  };

  // ── Derived data ────────────────────────────────────────────────────────
  const active = auctions.filter(
    a => a.status === 'open' && (!clock || a.closes_at_tick > clock.current_tick)
  );

  const allTypes = Array.from(new Set(active.map(a => a.company_type))).sort();

  // Scatter data — Y axis is collateral-adjusted net yield, not raw rate
  const scatterData = active.map(p => {
    const annualRisk       = p.base_default_probability * 360;
    const riskPct          = annualRisk * 100;
    const ratePct          = p.max_acceptable_rate * 100;
    const lgdVal           = lgd(p);
    const expLossPct       = annualRisk * lgdVal * 100;
    const nyPct            = netYieldPct(p, p.max_acceptable_rate);
    const collateralAdj    = p.collateral_value * p.partial_recovery_rate;
    const collateralCovPct = p.requested_amount > 0 ? (collateralAdj / p.requested_amount) * 100 : 0;

    // Determine first failing rule for tooltip
    let rejectReason: string | null = null;
    if (bs) {
      const offered = Math.max(0.02, p.max_acceptable_rate - rule.rate_discount);
      const ny      = netYieldPct(p, offered);
      if (riskPct > rule.max_risk_pct_per_year)
        rejectReason = `Risk ${riskPct.toFixed(1)}% > ${rule.max_risk_pct_per_year}% limit`;
      else if (ny < rule.min_net_yield_pct)
        rejectReason = `Net yield ${ny.toFixed(1)}% < ${rule.min_net_yield_pct}% floor`;
      else if (rule.max_loan_amount > 0 && p.requested_amount > rule.max_loan_amount)
        rejectReason = `Amount ${fmt(p.requested_amount)} > ${fmt(rule.max_loan_amount)} cap`;
      else if (rule.allowed_types.length > 0 && !rule.allowed_types.includes(p.company_type))
        rejectReason = `Type "${p.company_type}" not in allowlist`;
      else {
        const cashAfter    = bs.cash - p.requested_amount;
        const reserveAfter = bs.total_deposits_owed > 0 ? cashAfter / bs.total_deposits_owed : 1.0;
        if (reserveAfter < rule.min_reserve_after)
          rejectReason = `Reserve ${(reserveAfter * 100).toFixed(1)}% < ${(rule.min_reserve_after * 100).toFixed(0)}% floor`;
      }
    }

    return {
      // Chart axes
      riskPct,
      netYieldPct: nyPct,   // ← Y axis is now net yield, not raw rate
      // Tooltip extras
      ratePct, lgdVal, expLossPct, collateralAdj, collateralCovPct,
      amount: p.requested_amount,
      name: p.borrower_name,
      type: p.company_type,
      accepted: !rejectReason,
      rejectReason,
    };
  });

  // Net yield histogram (buckets: <0, 0-5, 5-10, 10-15, 15-20, 20+)
  const BUCKETS = [
    { label: '<0%',   min: -Infinity, max: 0 },
    { label: '0–5%',  min: 0,         max: 5 },
    { label: '5–10%', min: 5,         max: 10 },
    { label: '10–15%',min: 10,        max: 15 },
    { label: '15–20%',min: 15,        max: 20 },
    { label: '20%+',  min: 20,        max: Infinity },
  ];
  const histData = BUCKETS.map(b => ({
    label: b.label,
    total: scatterData.filter(d => d.netYieldPct >= b.min && d.netYieldPct < b.max).length,
    accepted: scatterData.filter(d => d.accepted && d.netYieldPct >= b.min && d.netYieldPct < b.max).length,
  }));

  // Matching proposals (for preview table)
  let deployed = 0;
  const matching = bs
    ? active.filter(p => {
        if (!passesRule(p, rule, bs, deployed)) return false;
        deployed += p.requested_amount;
        return true;
      })
    : [];

  const projectedReserveRatio = bs && bs.total_deposits_owed > 0
    ? (bs.cash - deployed) / bs.total_deposits_owed
    : 1.0;

  return (
    <div className="space-y-5">

      {/* Enable toggle + status */}
      <div className={`flex items-center gap-4 rounded-lg px-4 py-3 border text-sm ${
        rule.enabled
          ? 'bg-safe-400 bg-opacity-10 border-safe-400'
          : 'bg-parch-50 border-parch-300'
      }`}>
        <button
          onClick={() => updateRule('enabled', !rule.enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            rule.enabled ? 'bg-safe-400' : 'bg-parch-300'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            rule.enabled ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
        <div>
          <span className={`font-semibold ${rule.enabled ? 'text-safe-400' : 'text-ink-700'}`}>
            {rule.enabled ? 'Automated lending active' : 'Automated lending disabled'}
          </span>
          {rule.enabled && bs && (
            <span className="text-ink-700 text-xs ml-2">
              — {matching.length} auction{matching.length !== 1 ? 's' : ''} currently match · bidding {fmt(deployed)}
            </span>
          )}
        </div>
        {rule.enabled && (
          <span className="ml-auto text-xs text-ink-700">
            Bids are placed automatically each tick when rules are met
          </span>
        )}
      </div>

      {/* Rule config + scatter chart */}
      <div className="grid grid-cols-5 gap-5">

        {/* ── Rule panel ─────────────────────────────────────────────── */}
        <div className="col-span-2 bg-parch-50 border border-parch-300 rounded-lg p-4 space-y-3">
          <h3 className="text-gold-400 font-semibold text-sm mb-1">Lending Rules</h3>

          <RuleField label="Max annual default risk (%)"
            help="Reject proposals where annualised default probability exceeds this threshold">
            <div className="flex items-center gap-2">
              <input type="range" min={1} max={60} step={1}
                value={rule.max_risk_pct_per_year}
                onChange={e => updateRule('max_risk_pct_per_year', Number(e.target.value))}
                className="flex-1 accent-gold-500" />
              <span className="w-10 text-right font-mono text-sm text-ink-800">{rule.max_risk_pct_per_year}%</span>
            </div>
          </RuleField>

          <RuleField label="Min net yield (%) — collateral-adjusted"
            help="Net yield = rate − (PD × LGD). LGD is reduced by collateral, so a well-secured loan can pass even at high default risk.">
            <div className="flex items-center gap-2">
              <input type="range" min={0} max={30} step={0.5}
                value={rule.min_net_yield_pct}
                onChange={e => updateRule('min_net_yield_pct', Number(e.target.value))}
                className="flex-1 accent-gold-500" />
              <span className="w-10 text-right font-mono text-sm text-ink-800">{rule.min_net_yield_pct}%</span>
            </div>
          </RuleField>

          <RuleField label="Min reserve ratio after lending (%)"
            help="Won't accept a loan if it would push reserve ratio below this floor">
            <div className="flex items-center gap-2">
              <input type="range" min={5} max={100} step={1}
                value={Math.round(rule.min_reserve_after * 100)}
                onChange={e => updateRule('min_reserve_after', Number(e.target.value) / 100)}
                className="flex-1 accent-gold-500" />
              <span className="w-10 text-right font-mono text-sm text-ink-800">{(rule.min_reserve_after * 100).toFixed(0)}%</span>
            </div>
          </RuleField>

          <RuleField label="Max single loan size (0 = unlimited)">
            <input type="number" min={0} step={100}
              value={rule.max_loan_amount}
              onChange={e => updateRule('max_loan_amount', Number(e.target.value))}
              placeholder="0 = no limit"
              className="w-full bg-white border border-parch-300 rounded px-2 py-1 text-sm font-mono text-ink-800" />
          </RuleField>

          <RuleField label="Max total capital per batch (0 = unlimited)"
            help="Caps total capital deployed in a single batch of auto-accepts">
            <input type="number" min={0} step={500}
              value={rule.max_total_capital}
              onChange={e => updateRule('max_total_capital', Number(e.target.value))}
              placeholder="0 = no limit"
              className="w-full bg-white border border-parch-300 rounded px-2 py-1 text-sm font-mono text-ink-800" />
          </RuleField>

          <RuleField label="Rate discount from borrower's max (%)"
            help="Offer this many points below the borrower's ceiling (0 = offer at their max rate)">
            <div className="flex items-center gap-2">
              <input type="range" min={0} max={10} step={0.5}
                value={rule.rate_discount * 100}
                onChange={e => updateRule('rate_discount', Number(e.target.value) / 100)}
                className="flex-1 accent-gold-500" />
              <span className="w-10 text-right font-mono text-sm text-ink-800">{(rule.rate_discount * 100).toFixed(1)}%</span>
            </div>
          </RuleField>

          {allTypes.length > 0 && (
            <RuleField label="Allowed borrower types (none selected = all)">
              <div className="flex flex-wrap gap-1 mt-1">
                {allTypes.map(t => {
                  const on = rule.allowed_types.includes(t);
                  return (
                    <button key={t}
                      onClick={() => updateRule('allowed_types',
                        on ? rule.allowed_types.filter(x => x !== t) : [...rule.allowed_types, t]
                      )}
                      className={`text-xs px-2 py-0.5 rounded border capitalize transition-colors ${
                        on ? 'bg-gold-500 text-parch-50 border-gold-500'
                           : 'border-parch-300 text-ink-700 hover:bg-parch-200'
                      }`}>
                      {t}
                    </button>
                  );
                })}
              </div>
            </RuleField>
          )}
        </div>

        {/* ── Scatter chart ────────────────────────────────────────────── */}
        <div className="col-span-3 bg-parch-50 border border-parch-300 rounded-lg p-4">
          <div className="flex items-start justify-between mb-1">
            <h3 className="text-gold-400 font-semibold text-sm">Risk vs Return</h3>
            <span className="text-xs text-ink-700 font-mono">
              tick {clock?.current_tick ?? '—'} · {active.length} auction{active.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-ink-700 mb-1">
            <span>X = annual default risk &nbsp;·&nbsp; Y = net yield after collateral-adjusted loss &nbsp;·&nbsp; size = amount</span>
          </div>
          <div className="flex items-center gap-4 text-xs mb-3">
            <span className="text-safe-400">● passes rules</span>
            <span style={{ color: '#c4a870' }}>● filtered</span>
            <span className="text-ink-700 opacity-70">Accept zone = top-left of both lines</span>
          </div>
          {scatterData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-ink-700 text-sm">
              No active proposals
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={270}>
              <ScatterChart margin={{ top: 8, right: 24, left: 8, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#c4a870" opacity={0.4} />
                <XAxis
                  type="number" dataKey="riskPct" name="Annual Risk"
                  tick={{ fontSize: 10, fill: '#5a3818' }} tickLine={false}
                  unit="%"
                  label={{ value: '← annual default risk %  (lower = safer)', position: 'insideBottom', offset: -14, fontSize: 9, fill: '#5a3818' }}
                />
                <YAxis
                  type="number" dataKey="netYieldPct" name="Net Yield"
                  tick={{ fontSize: 10, fill: '#5a3818' }} tickLine={false} width={36}
                  unit="%"
                  label={{ value: 'net yield %', angle: -90, position: 'insideLeft', offset: 0, fontSize: 9, fill: '#5a3818', dy: -10 }}
                />
                <ZAxis type="number" dataKey="amount" range={[30, 500]} name="Amount" />
                <Tooltip content={<SCATTER_TOOLTIP />} cursor={{ strokeDasharray: '3 3' }} />
                {/* Vertical: max risk ceiling */}
                <ReferenceLine x={rule.max_risk_pct_per_year} stroke="#963020" strokeDasharray="4 2" strokeWidth={1.5}
                  label={{ value: `risk ≤ ${rule.max_risk_pct_per_year}%`, fontSize: 9, fill: '#963020', position: 'insideTopRight' }} />
                {/* Horizontal: min net yield floor — dots above this line pass yield check */}
                <ReferenceLine y={rule.min_net_yield_pct} stroke="#2a6840" strokeDasharray="4 2" strokeWidth={1.5}
                  label={{ value: `yield ≥ ${rule.min_net_yield_pct}%`, fontSize: 9, fill: '#2a6840', position: 'insideTopLeft' }} />
                {/* Zero net yield reference */}
                <ReferenceLine y={0} stroke="#9a7018" strokeWidth={1} opacity={0.5} />
                <Scatter data={scatterData} isAnimationActive={false}>
                  {scatterData.map((d, i) => (
                    <Cell key={i}
                      fill={d.accepted ? '#2a6840' : '#c4a870'}
                      fillOpacity={d.accepted ? 0.8 : 0.4}
                      stroke={d.accepted ? '#1e5030' : '#9a7018'}
                      strokeWidth={1}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Net yield distribution histogram */}
      <div className="bg-parch-50 border border-parch-300 rounded-lg p-4">
        <h3 className="text-gold-400 font-semibold text-sm mb-3">
          Net Yield Distribution <span className="text-ink-700 font-normal">(rate − expected annual loss)</span>
        </h3>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={histData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#c4a870" opacity={0.3} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#5a3818' }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#5a3818' }} tickLine={false} width={24} allowDecimals={false} />
            <Tooltip
              formatter={(val: any, name: any) => [val, name === 'accepted' ? 'Would accept' : 'Total proposals']}
              contentStyle={{ background: '#fefcf5', border: '1px solid #c4a870', borderRadius: 4, fontSize: 12 }}
            />
            <Bar dataKey="total" name="total" fill="#c4a870" fillOpacity={0.5} radius={[3, 3, 0, 0]} />
            <Bar dataKey="accepted" name="accepted" fill="#2a6840" fillOpacity={0.8} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Matching proposals preview + portfolio impact */}
      <div className="bg-parch-50 border border-parch-300 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-parch-200 text-xs">
          <span className="font-semibold text-ink-800">
            {matching.length} auction{matching.length !== 1 ? 's' : ''} match current rules
            {matching.length > 0 && ` — bidding ${fmt(deployed)} capital`}
            <span className="font-normal text-ink-700 ml-2">· live at tick {clock?.current_tick ?? '—'}</span>
          </span>
          {bs && matching.length > 0 && (
            <span className={`font-mono ${projectedReserveRatio < rule.min_reserve_after ? 'text-danger-400' : 'text-safe-400'}`}>
              Reserve after: {(projectedReserveRatio * 100).toFixed(1)}%
              <span className="text-ink-700 font-normal ml-1">(now: {(bs.reserve_ratio * 100).toFixed(1)}%)</span>
            </span>
          )}
        </div>
        {matching.length === 0 ? (
          <div className="px-4 py-4 text-ink-700 text-sm">
            {active.length === 0 ? (
              <p className="text-center py-2">No open auctions right now.</p>
            ) : bs ? (
              <div>
                <p className="text-xs font-semibold text-ink-800 mb-2">
                  All {active.length} auction{active.length !== 1 ? 's' : ''} filtered — breakdown:
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                  {(() => {
                    let byRisk = 0, byYield = 0, byAmount = 0, byType = 0, byReserve = 0, byCapital = 0;
                    for (const p of active) {
                      const annualRiskPct = p.base_default_probability * 360 * 100;
                      const offeredRate   = Math.max(0.02, p.max_acceptable_rate - rule.rate_discount);
                      if (annualRiskPct > rule.max_risk_pct_per_year) { byRisk++; continue; }
                      if (netYieldPct(p, offeredRate) < rule.min_net_yield_pct) { byYield++; continue; }
                      if (rule.max_loan_amount > 0 && p.requested_amount > rule.max_loan_amount) { byAmount++; continue; }
                      if (rule.allowed_types.length > 0 && !rule.allowed_types.includes(p.company_type)) { byType++; continue; }
                      if (rule.max_total_capital > 0 && p.requested_amount > rule.max_total_capital) { byCapital++; continue; }
                      const cashAfter    = bs.cash - p.requested_amount;
                      const reserveAfter = bs.total_deposits_owed > 0 ? cashAfter / bs.total_deposits_owed : 1.0;
                      if (reserveAfter < rule.min_reserve_after) byReserve++;
                    }
                    return (
                      <>
                        {byRisk > 0    && <p><span className="text-danger-400 font-semibold">{byRisk}×</span> risk &gt; {rule.max_risk_pct_per_year}%/yr limit</p>}
                        {byYield > 0   && <p><span className="text-danger-400 font-semibold">{byYield}×</span> net yield &lt; {rule.min_net_yield_pct}% floor</p>}
                        {byAmount > 0  && <p><span className="text-danger-400 font-semibold">{byAmount}×</span> amount &gt; {fmt(rule.max_loan_amount)} cap</p>}
                        {byType > 0    && <p><span className="text-danger-400 font-semibold">{byType}×</span> borrower type not in allowlist</p>}
                        {byReserve > 0 && <p><span className="text-danger-400 font-semibold">{byReserve}×</span> would breach {(rule.min_reserve_after * 100).toFixed(0)}% reserve floor</p>}
                        {byCapital > 0 && <p><span className="text-danger-400 font-semibold">{byCapital}×</span> exceeds batch capital limit</p>}
                      </>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <p className="text-center py-2">Balance sheet not loaded yet.</p>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-ink-700 text-xs border-b border-parch-200">
                <th className="text-left px-3 py-2">Borrower</th>
                <th className="text-right px-3 py-2">Amount</th>
                <th className="text-right px-3 py-2">Offer rate</th>
                <th className="text-right px-3 py-2">PD/yr</th>
                <th className="text-right px-3 py-2 text-amber-700">LGD</th>
                <th className="text-right px-3 py-2">Collateral</th>
                <th className="text-right px-3 py-2">Exp. loss/yr</th>
                <th className="text-right px-3 py-2 text-safe-400">Net yield</th>
              </tr>
            </thead>
            <tbody>
              {matching.map(p => {
                const annualRiskPct  = p.base_default_probability * 360 * 100;
                const offeredRate    = Math.max(0.02, p.max_acceptable_rate - rule.rate_discount);
                const lgdVal         = lgd(p);
                const expLossPct     = annualRiskPct * lgdVal / 100 * 100;   // = annualRiskPct * lgdVal
                const nyPct          = netYieldPct(p, offeredRate);
                const collateralAdj  = p.collateral_value * p.partial_recovery_rate;
                const coveragePct    = p.requested_amount > 0 ? (collateralAdj / p.requested_amount) * 100 : 0;
                return (
                  <tr key={p.id} className="border-t border-parch-200 hover:bg-parch-100 text-xs">
                    <td className="px-3 py-2 font-medium text-sm">
                      {p.borrower_name}
                      <span className="text-ink-700 capitalize ml-1 font-normal">({p.company_type})</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gold-400">{fmt(p.requested_amount)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{(offeredRate * 100).toFixed(1)}%</td>
                    <td className={`px-3 py-2 text-right font-mono ${riskColor(annualRiskPct)}`}>
                      {annualRiskPct.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-amber-700">
                      {(lgdVal * 100).toFixed(0)}%
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-ink-700">
                      {fmt(collateralAdj)}
                      <span className="text-ink-700 opacity-60 ml-1">({coveragePct.toFixed(0)}%)</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-danger-400">
                      {expLossPct.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-safe-400">
                      {nyPct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}

// ─── Auction room ─────────────────────────────────────────────────────────────

function AuctionRoom() {
  const auctions  = usePlayerStore(s => s.auctions);
  const player    = usePlayerStore(s => s.player);
  const bs        = usePlayerStore(s => s.balanceSheet);
  const licenses  = usePlayerStore(s => s.licenses);
  const getTown   = useWorldStore(s => s.getTown);
  const getRegion = useWorldStore(s => s.getRegion);
  const getEvents = useWorldStore(s => s.getActiveEventsForTown);
  const clock     = useWorldStore(s => s.clock);

  const [bidRates, setBidRates]   = useState<Record<string, string>>({});
  const [bidStatus, setBidStatus] = useState<Record<string, string>>({});
  const [loading, setLoading]     = useState<string | null>(null);

  const playerId = player?.id;
  const open = auctions.filter(a => a.status === 'open');

  const handleBid = useCallback(async (auctionId: string, auction: LoanAuction) => {
    const rateStr = bidRates[auctionId];
    const rate = rateStr ? parseFloat(rateStr) / 100 : auction.max_acceptable_rate;
    if (isNaN(rate) || rate <= 0) {
      setBidStatus(s => ({ ...s, [auctionId]: 'Invalid rate' }));
      return;
    }
    if (rate > auction.max_acceptable_rate) {
      setBidStatus(s => ({ ...s, [auctionId]: `Max rate is ${(auction.max_acceptable_rate * 100).toFixed(1)}%` }));
      return;
    }

    setLoading(auctionId);
    setBidStatus(s => ({ ...s, [auctionId]: '' }));

    const socket = getSocket();
    socket.emit('auction:bid', { auction_id: auctionId, offered_rate: rate }, (res) => {
      if (res.success) {
        setBidStatus(s => ({ ...s, [auctionId]: `Bid placed @ ${(rate * 100).toFixed(1)}%` }));
      } else {
        setBidStatus(s => ({ ...s, [auctionId]: res.error ?? 'Error' }));
      }
      setLoading(null);
    });
  }, [bidRates]);

  if (open.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-4xl mb-4 opacity-30">⚖</div>
        <p className="text-ink-700 text-sm">No active auctions right now.</p>
        <p className="text-ink-700 text-xs mt-1">Auctions open every few ticks in towns where you hold a license.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-700">
          <span className="text-gold-400 font-semibold">{open.length} auction{open.length !== 1 ? 's' : ''}</span> open ·
          Lowest rate wins · Bids visible to all bidders · You may update your bid before close
        </p>
        {bs && (
          <span className="text-xs font-mono text-ink-700">
            Cash: <span className="text-gold-400 font-semibold">{fmt(bs.cash)}</span>
          </span>
        )}
      </div>

      {open.map(auction => {
        const town      = getTown(auction.town_id);
        const region    = getRegion(town?.region_id ?? '');
        const events    = getEvents(auction.town_id);
        const ticksLeft = clock ? Math.max(0, auction.closes_at_tick - clock.current_tick) : '?';
        const riskPct   = auction.base_default_probability * 360 * 100;
        const recovery  = auction.collateral_value * auction.partial_recovery_rate;
        const lgdVal    = Math.max(0, 1 - recovery / auction.requested_amount);

        const myBid     = auction.bids.find(b => b.player_id === playerId);
        const sortedBids = [...auction.bids].sort((a, b) => a.offered_rate - b.offered_rate);
        const winningBid = sortedBids[0];
        const imWinning  = winningBid?.player_id === playerId;
        const canFund    = bs && bs.cash >= auction.requested_amount;

        const defaultBidPct = myBid
          ? (myBid.offered_rate * 100).toFixed(2)
          : (Math.max(2, auction.max_acceptable_rate * 100 - 0.5)).toFixed(2);

        return (
          <div key={auction.id}
            className={`rounded-lg border overflow-hidden ${
              myBid
                ? imWinning
                  ? 'border-safe-400 bg-safe-400 bg-opacity-5'
                  : 'border-amber-400 bg-amber-50'
                : 'border-parch-300 bg-parch-50'
            }`}>

            {/* Header bar */}
            <div className={`flex items-center justify-between px-4 py-2.5 ${
              myBid
                ? imWinning ? 'bg-safe-400 bg-opacity-10' : 'bg-amber-100'
                : 'bg-parch-200'
            }`}>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-ink-800">{auction.borrower_name}</span>
                <span className={`text-xs px-2 py-0.5 rounded border capitalize ${riskBadge(riskPct)}`}>
                  {auction.company_type}
                </span>
                <span className="text-xs text-ink-700">{town?.name ?? auction.town_id}</span>
                {region && <span className="text-xs text-ink-700 opacity-70">{region.name}</span>}
                {events.length > 0 && (
                  <span className="text-xs text-amber-700">⚡ {events.length} event{events.length !== 1 ? 's' : ''}</span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs">
                {myBid && (
                  <span className={`font-semibold ${imWinning ? 'text-safe-400' : 'text-amber-700'}`}>
                    {imWinning ? '▲ Leading' : '▼ Outbid'} @ {(myBid.offered_rate * 100).toFixed(2)}%
                  </span>
                )}
                <span className={`font-mono font-semibold ${Number(ticksLeft) <= 2 ? 'text-danger-400' : 'text-ink-700'}`}>
                  {ticksLeft} tick{ticksLeft !== 1 ? 's' : ''} left
                </span>
              </div>
            </div>

            {/* Body */}
            <div className="px-4 py-3 grid grid-cols-12 gap-4">

              {/* Loan details */}
              <div className="col-span-4 space-y-1.5">
                <div className="grid grid-cols-2 gap-x-3 text-xs">
                  <span className="text-ink-700">Amount</span>
                  <span className="font-mono font-semibold text-gold-400 text-right">{fmt(auction.requested_amount)}g</span>

                  <span className="text-ink-700">Max rate</span>
                  <span className="font-mono text-right">{(auction.max_acceptable_rate * 100).toFixed(1)}%</span>

                  <span className="text-ink-700">Term</span>
                  <span className="font-mono text-right">{auction.term_ticks} ticks ({(auction.term_ticks / 90).toFixed(1)} seasons)</span>

                  <span className={`text-ink-700`}>Annual risk</span>
                  <span className={`font-mono text-right ${riskColor(riskPct)}`}>{riskPct.toFixed(1)}%/yr</span>

                  <span className="text-ink-700">Collateral</span>
                  <span className="font-mono text-right text-ink-700">{fmt(recovery)}g ({(lgdVal * 100).toFixed(0)}% LGD)</span>
                </div>
              </div>

              {/* Current bids */}
              <div className="col-span-4">
                <p className="text-xs font-semibold text-ink-800 mb-1.5">
                  Bids ({sortedBids.length})
                  {sortedBids.length > 0 && <span className="text-ink-700 font-normal ml-1">— lowest wins</span>}
                </p>
                {sortedBids.length === 0 ? (
                  <p className="text-xs text-ink-700 italic">No bids yet — be first</p>
                ) : (
                  <div className="space-y-1">
                    {sortedBids.map((bid, i) => (
                      <div key={bid.player_id}
                        className={`flex items-center justify-between text-xs rounded px-2 py-1 ${
                          i === 0 ? 'bg-safe-400 bg-opacity-10 border border-safe-400 border-opacity-30' : 'bg-parch-100'
                        }`}>
                        <div className="flex items-center gap-1.5">
                          {i === 0 && <span className="text-safe-400 font-bold text-xs">★</span>}
                          <span className={bid.player_id === playerId ? 'font-semibold text-gold-400' : 'text-ink-700'}>
                            {bid.bank_name}
                            {bid.player_id === playerId && ' (you)'}
                          </span>
                        </div>
                        <span className={`font-mono font-semibold ${i === 0 ? 'text-safe-400' : 'text-ink-800'}`}>
                          {(bid.offered_rate * 100).toFixed(2)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bid form */}
              <div className="col-span-4 flex flex-col justify-center">
                {!canFund ? (
                  <p className="text-xs text-danger-400 italic">Insufficient cash to fund this loan ({fmt(auction.requested_amount)}g required)</p>
                ) : (
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-ink-700 block mb-1">
                        Your bid rate (%) — lower is more competitive
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max={(auction.max_acceptable_rate * 100).toFixed(1)}
                          value={bidRates[auction.id] ?? defaultBidPct}
                          onChange={e => setBidRates(r => ({ ...r, [auction.id]: e.target.value }))}
                          className="flex-1 bg-white border border-parch-300 rounded px-2 py-1.5 text-sm font-mono text-ink-800 focus:border-gold-400 focus:outline-none"
                          placeholder={defaultBidPct}
                        />
                        <span className="text-xs text-ink-700">%</span>
                      </div>
                    </div>

                    {/* Quick bid buttons */}
                    <div className="flex gap-1">
                      {[-2, -1, 0].map(offset => {
                        const pct = Math.max(2, Math.min(
                          auction.max_acceptable_rate * 100,
                          auction.max_acceptable_rate * 100 + offset
                        ));
                        return (
                          <button key={offset}
                            onClick={() => setBidRates(r => ({ ...r, [auction.id]: pct.toFixed(1) }))}
                            className="flex-1 text-xs px-1 py-1 rounded border border-parch-300 hover:bg-parch-200 text-ink-700 transition-colors">
                            {pct.toFixed(1)}%
                          </button>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => handleBid(auction.id, auction)}
                      disabled={loading === auction.id}
                      className="w-full py-2 text-sm font-semibold rounded transition-colors disabled:opacity-50
                        bg-gold-500 text-parch-50 hover:bg-gold-600">
                      {loading === auction.id
                        ? 'Placing…'
                        : myBid ? 'Update Bid' : 'Place Bid'}
                    </button>

                    {bidStatus[auction.id] && (
                      <p className={`text-xs text-center ${
                        bidStatus[auction.id].includes('placed') || bidStatus[auction.id].includes('Bid')
                          ? 'text-safe-400' : 'text-danger-400'
                      }`}>
                        {bidStatus[auction.id]}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LoansPage() {
  const proposals = usePlayerStore(s => s.proposals);
  const auctions  = usePlayerStore(s => s.auctions);
  const loans     = usePlayerStore(s => s.loans);
  const clock     = useWorldStore(s => s.clock);
  const [tab, setTab] = useState<'auctions' | 'queue' | 'portfolio' | 'automated'>('auctions');

  const auctionCount   = auctions.filter(a => a.status === 'open').length;
  const queueCount     = proposals.filter(
    p => !p.accepted_by_player_id && (!clock || p.expires_at_tick > clock.current_tick)
  ).length;
  const portfolioCount = loans.filter(l => l.status === 'active').length;

  return (
    <div className="p-6">
      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-parch-300">
        {([
          ['auctions',  'Auctions',   auctionCount],
          ['queue',     'Loan Queue', queueCount],
          ['portfolio', 'Portfolio',  portfolioCount],
          ['automated', 'Automated',  null],
        ] as [typeof tab, string, number | null][]).map(([id, label, count]) => (
          <button key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === id
                ? 'border-gold-400 text-gold-400'
                : 'border-transparent text-ink-700 hover:text-ink-800'
            }`}
          >
            {label}
            {count != null && count > 0 && (
              <span className={`ml-2 text-xs rounded-full px-1.5 py-0.5 ${
                id === 'auctions' ? 'bg-gold-500 text-parch-50' : 'bg-parch-300 text-ink-800'
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'auctions'  && <AuctionRoom />}
      {tab === 'queue'     && <LoanQueue />}
      {tab === 'portfolio' && <LoanPortfolio />}
      {tab === 'automated' && <AutomatedLending />}
    </div>
  );
}
