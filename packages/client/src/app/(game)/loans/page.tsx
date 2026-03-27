'use client';
import { useState, useEffect, useRef } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, Cell,
  ScatterChart, Scatter, ZAxis,
} from 'recharts';
import { usePlayerStore } from '../../../store/player-store';
import { useWorldStore } from '../../../store/world-store';
import { api } from '../../../lib/api';
import type { LoanProposal, BalanceSheet } from '@argentum/shared';

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

// ─── Automated lending types + helpers ──────────────────────────────────────

interface AutoRule {
  enabled: boolean;
  maxRiskPctPerYear: number;   // annualised default prob ceiling, e.g. 20 (%)
  minNetYieldPct: number;      // min (offeredRate - annualRisk) in %, e.g. 5
  maxLoanAmount: number;       // 0 = no limit
  maxTotalCapital: number;     // max cumulative capital to deploy per batch, 0 = no limit
  minReserveAfter: number;     // reserve ratio floor after accepting, e.g. 0.15
  allowedTypes: string[];      // [] = all types allowed
  rateDiscount: number;        // fraction below borrower's max to offer, e.g. 0.01 → 1% discount
}

const DEFAULT_RULE: AutoRule = {
  enabled: false,
  maxRiskPctPerYear: 20,
  minNetYieldPct: 5,
  maxLoanAmount: 0,
  maxTotalCapital: 0,
  minReserveAfter: 0.15,
  allowedTypes: [],
  rateDiscount: 0,
};

/**
 * Loss Given Default: fraction of principal lost when borrower defaults.
 * Accounts for collateral recovery — a fully collateralised loan has LGD near 0.
 *   LGD = max(0, 1 − (collateral_value × partial_recovery_rate) / requested_amount)
 */
function lgd(p: LoanProposal): number {
  const recovery = (p.collateral_value * p.partial_recovery_rate) / p.requested_amount;
  return Math.max(0, 1 - recovery);
}

/**
 * Net yield = offeredRate − (annualDefaultProb × LGD)
 * This is the risk-adjusted return after expected collateral-adjusted losses.
 */
function netYieldPct(p: LoanProposal, offeredRate: number): number {
  const annualDefaultProb = p.base_default_probability * 360;
  return (offeredRate - annualDefaultProb * lgd(p)) * 100;
}

/**
 * Returns true if a proposal passes the automated lending rule.
 * deployedSoFar: capital already committed in this batch (for capital-limit check).
 */
function proposalPassesRule(
  p: LoanProposal,
  rule: AutoRule,
  bs: BalanceSheet,
  deployedSoFar: number,
): boolean {
  const annualRiskPct = p.base_default_probability * 360 * 100;
  const offeredRate   = Math.max(0.02, p.max_acceptable_rate - rule.rateDiscount);
  const nyPct         = netYieldPct(p, offeredRate);

  if (annualRiskPct > rule.maxRiskPctPerYear) return false;
  if (nyPct < rule.minNetYieldPct) return false;
  if (rule.maxLoanAmount > 0 && p.requested_amount > rule.maxLoanAmount) return false;
  if (rule.allowedTypes.length > 0 && !rule.allowedTypes.includes(p.borrower_type)) return false;
  if (rule.maxTotalCapital > 0 && deployedSoFar + p.requested_amount > rule.maxTotalCapital) return false;

  // Check reserve ratio after this loan
  const cashAfter     = bs.cash - deployedSoFar - p.requested_amount;
  const reserveAfter  = bs.total_deposits_owed > 0 ? cashAfter / bs.total_deposits_owed : 1.0;
  if (reserveAfter < rule.minReserveAfter) return false;

  return true;
}

// ─── Queue tab ──────────────────────────────────────────────────────────────

function LoanQueue() {
  const proposals      = usePlayerStore(s => s.proposals);
  const bs             = usePlayerStore(s => s.balanceSheet);
  const removeProposal = usePlayerStore(s => s.removeProposal);
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

  // Collect unique borrower types for filter
  const borrowerTypes = Array.from(new Set(active.map(p => p.borrower_type))).sort();

  const filtered = active.filter(p => {
    const riskPct = p.base_default_probability * 360 * 100;
    if (riskFilter === 'low'    && riskPct >= 12) return false;
    if (riskFilter === 'medium' && (riskPct < 12 || riskPct >= 25)) return false;
    if (riskFilter === 'high'   && riskPct < 25) return false;
    if (typeFilter !== 'all'    && p.borrower_type !== typeFilter) return false;
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
                    {proposal.borrower_type} — {town?.name ?? proposal.town_id}
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
  const proposals      = usePlayerStore(s => s.proposals);
  const bs             = usePlayerStore(s => s.balanceSheet);
  const removeProposal = usePlayerStore(s => s.removeProposal);
  const clock          = useWorldStore(s => s.clock);

  const [rule, setRule] = useState<AutoRule>(DEFAULT_RULE);
  const [autoLog, setAutoLog] = useState<string[]>([]);
  const autoAcceptingRef = useRef(new Set<string>());
  const isLoadedRef      = useRef(false);

  // Load rule from localStorage once on mount — never save here
  useEffect(() => {
    try {
      const saved = localStorage.getItem('argentum_auto_rule');
      if (saved) setRule({ ...DEFAULT_RULE, ...JSON.parse(saved) });
    } catch {}
    isLoadedRef.current = true;
  }, []);

  // Update a field and immediately persist — only called from user interactions
  const updateRule = <K extends keyof AutoRule>(key: K, value: AutoRule[K]) => {
    setRule(prev => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem('argentum_auto_rule', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // ── Auto-execution ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!rule.enabled || !bs) return;

    const active = proposals.filter(
      p => !p.accepted_by_player_id && (!clock || p.expires_at_tick > clock.current_tick)
    );

    let deployedSoFar = 0;
    for (const p of active) {
      if (autoAcceptingRef.current.has(p.id)) continue;
      if (!proposalPassesRule(p, rule, bs, deployedSoFar)) continue;

      const offeredRate = Math.max(0.02, p.max_acceptable_rate - rule.rateDiscount);
      deployedSoFar += p.requested_amount;
      autoAcceptingRef.current.add(p.id);

      api.loans.accept(p.id, offeredRate)
        .then(() => {
          const when = clock ? `tick ${clock.current_tick}` : '';
          setAutoLog(l => [
            `✓ ${p.borrower_name} — ${fmt(p.requested_amount)} @ ${(offeredRate * 100).toFixed(1)}% ${when}`,
            ...l.slice(0, 29),
          ]);
          removeProposal(p.id);
        })
        .catch(err => {
          autoAcceptingRef.current.delete(p.id);
          setAutoLog(l => [
            `✗ ${p.borrower_name} — ${(err as Error).message}`,
            ...l.slice(0, 29),
          ]);
        });
    }
  }, [proposals, rule.enabled, bs, clock]);

  // setField removed — use updateRule directly

  // ── Derived data ────────────────────────────────────────────────────────
  const active = proposals.filter(
    p => !p.accepted_by_player_id && (!clock || p.expires_at_tick > clock.current_tick)
  );

  const allTypes = Array.from(new Set(active.map(p => p.borrower_type))).sort();

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
      const offered = Math.max(0.02, p.max_acceptable_rate - rule.rateDiscount);
      const ny      = netYieldPct(p, offered);
      if (riskPct > rule.maxRiskPctPerYear)
        rejectReason = `Risk ${riskPct.toFixed(1)}% > ${rule.maxRiskPctPerYear}% limit`;
      else if (ny < rule.minNetYieldPct)
        rejectReason = `Net yield ${ny.toFixed(1)}% < ${rule.minNetYieldPct}% floor`;
      else if (rule.maxLoanAmount > 0 && p.requested_amount > rule.maxLoanAmount)
        rejectReason = `Amount ${fmt(p.requested_amount)} > ${fmt(rule.maxLoanAmount)} cap`;
      else if (rule.allowedTypes.length > 0 && !rule.allowedTypes.includes(p.borrower_type))
        rejectReason = `Type "${p.borrower_type}" not in allowlist`;
      else {
        const cashAfter    = bs.cash - p.requested_amount;
        const reserveAfter = bs.total_deposits_owed > 0 ? cashAfter / bs.total_deposits_owed : 1.0;
        if (reserveAfter < rule.minReserveAfter)
          rejectReason = `Reserve ${(reserveAfter * 100).toFixed(1)}% < ${(rule.minReserveAfter * 100).toFixed(0)}% floor`;
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
      type: p.borrower_type,
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
        if (!proposalPassesRule(p, rule, bs, deployed)) return false;
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
              — {matching.length} proposal{matching.length !== 1 ? 's' : ''} currently match · deploying {fmt(deployed)}
            </span>
          )}
        </div>
        {rule.enabled && (
          <span className="ml-auto text-xs text-ink-700">
            Proposals are accepted automatically each tick when rules are met
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
                value={rule.maxRiskPctPerYear}
                onChange={e => updateRule('maxRiskPctPerYear', Number(e.target.value))}
                className="flex-1 accent-gold-500" />
              <span className="w-10 text-right font-mono text-sm text-ink-800">{rule.maxRiskPctPerYear}%</span>
            </div>
          </RuleField>

          <RuleField label="Min net yield (%) — collateral-adjusted"
            help="Net yield = rate − (PD × LGD). LGD is reduced by collateral, so a well-secured loan can pass even at high default risk.">
            <div className="flex items-center gap-2">
              <input type="range" min={0} max={30} step={0.5}
                value={rule.minNetYieldPct}
                onChange={e => updateRule('minNetYieldPct', Number(e.target.value))}
                className="flex-1 accent-gold-500" />
              <span className="w-10 text-right font-mono text-sm text-ink-800">{rule.minNetYieldPct}%</span>
            </div>
          </RuleField>

          <RuleField label="Min reserve ratio after lending (%)"
            help="Won't accept a loan if it would push reserve ratio below this floor">
            <div className="flex items-center gap-2">
              <input type="range" min={5} max={100} step={1}
                value={Math.round(rule.minReserveAfter * 100)}
                onChange={e => updateRule('minReserveAfter', Number(e.target.value) / 100)}
                className="flex-1 accent-gold-500" />
              <span className="w-10 text-right font-mono text-sm text-ink-800">{(rule.minReserveAfter * 100).toFixed(0)}%</span>
            </div>
          </RuleField>

          <RuleField label="Max single loan size (0 = unlimited)">
            <input type="number" min={0} step={100}
              value={rule.maxLoanAmount}
              onChange={e => updateRule('maxLoanAmount', Number(e.target.value))}
              placeholder="0 = no limit"
              className="w-full bg-white border border-parch-300 rounded px-2 py-1 text-sm font-mono text-ink-800" />
          </RuleField>

          <RuleField label="Max total capital per batch (0 = unlimited)"
            help="Caps total capital deployed in a single batch of auto-accepts">
            <input type="number" min={0} step={500}
              value={rule.maxTotalCapital}
              onChange={e => updateRule('maxTotalCapital', Number(e.target.value))}
              placeholder="0 = no limit"
              className="w-full bg-white border border-parch-300 rounded px-2 py-1 text-sm font-mono text-ink-800" />
          </RuleField>

          <RuleField label="Rate discount from borrower's max (%)"
            help="Offer this many points below the borrower's ceiling (0 = offer at their max rate)">
            <div className="flex items-center gap-2">
              <input type="range" min={0} max={10} step={0.5}
                value={rule.rateDiscount * 100}
                onChange={e => updateRule('rateDiscount', Number(e.target.value) / 100)}
                className="flex-1 accent-gold-500" />
              <span className="w-10 text-right font-mono text-sm text-ink-800">{(rule.rateDiscount * 100).toFixed(1)}%</span>
            </div>
          </RuleField>

          {allTypes.length > 0 && (
            <RuleField label="Allowed borrower types (none selected = all)">
              <div className="flex flex-wrap gap-1 mt-1">
                {allTypes.map(t => {
                  const on = rule.allowedTypes.includes(t);
                  return (
                    <button key={t}
                      onClick={() => updateRule('allowedTypes',
                        on ? rule.allowedTypes.filter(x => x !== t) : [...rule.allowedTypes, t]
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
              tick {clock?.current_tick ?? '—'} · {active.length} proposal{active.length !== 1 ? 's' : ''}
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
                <ReferenceLine x={rule.maxRiskPctPerYear} stroke="#963020" strokeDasharray="4 2" strokeWidth={1.5}
                  label={{ value: `risk ≤ ${rule.maxRiskPctPerYear}%`, fontSize: 9, fill: '#963020', position: 'insideTopRight' }} />
                {/* Horizontal: min net yield floor — dots above this line pass yield check */}
                <ReferenceLine y={rule.minNetYieldPct} stroke="#2a6840" strokeDasharray="4 2" strokeWidth={1.5}
                  label={{ value: `yield ≥ ${rule.minNetYieldPct}%`, fontSize: 9, fill: '#2a6840', position: 'insideTopLeft' }} />
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
            {matching.length} proposal{matching.length !== 1 ? 's' : ''} match current rules
            {matching.length > 0 && ` — deploying ${fmt(deployed)} capital`}
            <span className="font-normal text-ink-700 ml-2">· live at tick {clock?.current_tick ?? '—'}</span>
          </span>
          {bs && matching.length > 0 && (
            <span className={`font-mono ${projectedReserveRatio < rule.minReserveAfter ? 'text-danger-400' : 'text-safe-400'}`}>
              Reserve after: {(projectedReserveRatio * 100).toFixed(1)}%
              <span className="text-ink-700 font-normal ml-1">(now: {(bs.reserve_ratio * 100).toFixed(1)}%)</span>
            </span>
          )}
        </div>
        {matching.length === 0 ? (
          <div className="px-4 py-4 text-ink-700 text-sm">
            {active.length === 0 ? (
              <p className="text-center py-2">No proposals in the queue right now.</p>
            ) : bs ? (
              <div>
                <p className="text-xs font-semibold text-ink-800 mb-2">
                  All {active.length} proposal{active.length !== 1 ? 's' : ''} filtered — breakdown:
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                  {(() => {
                    let byRisk = 0, byYield = 0, byAmount = 0, byType = 0, byReserve = 0, byCapital = 0;
                    for (const p of active) {
                      const annualRiskPct = p.base_default_probability * 360 * 100;
                      const offeredRate   = Math.max(0.02, p.max_acceptable_rate - rule.rateDiscount);
                      if (annualRiskPct > rule.maxRiskPctPerYear) { byRisk++; continue; }
                      if (netYieldPct(p, offeredRate) < rule.minNetYieldPct) { byYield++; continue; }
                      if (rule.maxLoanAmount > 0 && p.requested_amount > rule.maxLoanAmount) { byAmount++; continue; }
                      if (rule.allowedTypes.length > 0 && !rule.allowedTypes.includes(p.borrower_type)) { byType++; continue; }
                      if (rule.maxTotalCapital > 0 && p.requested_amount > rule.maxTotalCapital) { byCapital++; continue; }
                      const cashAfter    = bs.cash - p.requested_amount;
                      const reserveAfter = bs.total_deposits_owed > 0 ? cashAfter / bs.total_deposits_owed : 1.0;
                      if (reserveAfter < rule.minReserveAfter) byReserve++;
                    }
                    return (
                      <>
                        {byRisk > 0    && <p><span className="text-danger-400 font-semibold">{byRisk}×</span> risk &gt; {rule.maxRiskPctPerYear}%/yr limit</p>}
                        {byYield > 0   && <p><span className="text-danger-400 font-semibold">{byYield}×</span> net yield &lt; {rule.minNetYieldPct}% floor</p>}
                        {byAmount > 0  && <p><span className="text-danger-400 font-semibold">{byAmount}×</span> amount &gt; {fmt(rule.maxLoanAmount)} cap</p>}
                        {byType > 0    && <p><span className="text-danger-400 font-semibold">{byType}×</span> borrower type not in allowlist</p>}
                        {byReserve > 0 && <p><span className="text-danger-400 font-semibold">{byReserve}×</span> would breach {(rule.minReserveAfter * 100).toFixed(0)}% reserve floor</p>}
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
                const offeredRate    = Math.max(0.02, p.max_acceptable_rate - rule.rateDiscount);
                const lgdVal         = lgd(p);
                const expLossPct     = annualRiskPct * lgdVal / 100 * 100;   // = annualRiskPct * lgdVal
                const nyPct          = netYieldPct(p, offeredRate);
                const collateralAdj  = p.collateral_value * p.partial_recovery_rate;
                const coveragePct    = p.requested_amount > 0 ? (collateralAdj / p.requested_amount) * 100 : 0;
                return (
                  <tr key={p.id} className="border-t border-parch-200 hover:bg-parch-100 text-xs">
                    <td className="px-3 py-2 font-medium text-sm">
                      {p.borrower_name}
                      <span className="text-ink-700 capitalize ml-1 font-normal">({p.borrower_type})</span>
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

      {/* Auto-accept log */}
      {autoLog.length > 0 && (
        <div className="bg-parch-50 border border-parch-300 rounded-lg p-4">
          <h3 className="text-gold-400 font-semibold text-sm mb-2">Activity Log</h3>
          <div className="space-y-0.5 max-h-40 overflow-y-auto">
            {autoLog.map((entry, i) => (
              <p key={i} className={`text-xs font-mono ${entry.startsWith('✓') ? 'text-safe-400' : 'text-danger-400'}`}>
                {entry}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LoansPage() {
  const proposals = usePlayerStore(s => s.proposals);
  const loans     = usePlayerStore(s => s.loans);
  const clock     = useWorldStore(s => s.clock);
  const [tab, setTab] = useState<'queue' | 'portfolio' | 'automated'>('queue');

  const queueCount     = proposals.filter(
    p => !p.accepted_by_player_id && (!clock || p.expires_at_tick > clock.current_tick)
  ).length;
  const portfolioCount = loans.filter(l => l.status === 'active').length;

  return (
    <div className="p-6">
      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-parch-300">
        {([
          ['queue',     'Loan Queue',  queueCount],
          ['portfolio', 'Portfolio',   portfolioCount],
          ['automated', 'Automated',   null],
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
                id === 'queue' ? 'bg-gold-500 text-parch-50' : 'bg-parch-300 text-ink-800'
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'queue'     && <LoanQueue />}
      {tab === 'portfolio' && <LoanPortfolio />}
      {tab === 'automated' && <AutomatedLending />}
    </div>
  );
}
