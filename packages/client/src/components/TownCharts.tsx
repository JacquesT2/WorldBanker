'use client';
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import type { TownDepositSnapshot } from '../store/player-store';
import { calcDepositDistribution } from '@argentum/shared';

const THEME = {
  grid:    '#c4a870',
  axis:    '#5a3818',
  you:     '#9a7018',
  other:   '#c4a870',
  deposit: '#2a6840',
  tooltip: { bg: '#fefcf5', border: '#c4a870' },
};

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toFixed(0);
}

interface CompetingBank {
  player_id: string;
  bank_name: string;
  deposit_rate: number;
  reputation: number;
  is_you: boolean;
}

interface Props {
  townId: string;
  competingBanks: CompetingBank[];
  depositHistory: TownDepositSnapshot[];
  economicOutput: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: THEME.tooltip.bg, border: `1px solid ${THEME.tooltip.border}`, borderRadius: 4, padding: '8px 12px' }}>
      <p className="text-xs text-ink-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="text-xs font-mono" style={{ color: p.color ?? THEME.axis }}>
          {p.name}: {p.dataKey === 'deposit_rate' ? `${(p.value * 100).toFixed(2)}%` : fmt(p.value)}
        </p>
      ))}
    </div>
  );
};

export default function TownCharts({ competingBanks, depositHistory, economicOutput }: Props) {
  const rateData = competingBanks.map(b => ({
    name: b.is_you ? 'You' : b.bank_name,
    deposit_rate: b.deposit_rate,
    is_you: b.is_you,
  }));

  // Compute market share using the same formula the server uses
  const distribution = calcDepositDistribution(
    economicOutput,
    competingBanks.map(b => ({
      player_id: b.player_id,
      offered_rate: b.deposit_rate,
      reputation: b.reputation,
    })),
  );
  const totalFlow = distribution.reduce((s, d) => s + d.new_deposits, 0);
  const shareData = competingBanks.map(b => {
    const flow = distribution.find(d => d.player_id === b.player_id)?.new_deposits ?? 0;
    return {
      name: b.is_you ? 'You' : b.bank_name,
      share: totalFlow > 0 ? (flow / totalFlow) * 100 : 0,
      flow,
      is_you: b.is_you,
    };
  });

  return (
    <div className="space-y-6">

      {/* Competing deposit rates */}
      {competingBanks.length > 0 && (
        <div className="bg-parch-50 border border-parch-300 rounded-lg p-4">
          <h3 className="text-gold-400 font-semibold mb-4 text-sm">Deposit Rates — Competing Banks</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={rateData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={THEME.grid} opacity={0.4} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: THEME.axis }} tickLine={false} />
              <YAxis tickFormatter={v => `${(v * 100).toFixed(1)}%`} tick={{ fontSize: 10, fill: THEME.axis }} tickLine={false} width={40} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="deposit_rate" name="Deposit rate" radius={[3, 3, 0, 0]}>
                {rateData.map((entry, i) => (
                  <Cell key={i} fill={entry.is_you ? THEME.you : THEME.other} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-ink-700 mt-2">Your bar is darker. Higher rate = more deposit attraction.</p>
        </div>
      )}

      {/* Market share of deposit flow */}
      {shareData.length > 0 && (
        <div className="bg-parch-50 border border-parch-300 rounded-lg p-4">
          <h3 className="text-gold-400 font-semibold mb-1 text-sm">Deposit Flow — Market Share</h3>
          <p className="text-xs text-ink-700 mb-3">
            % of new deposits flowing to each bank this tick (~{fmt(totalFlow / shareData.length * shareData.length)}g/tick total)
          </p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={shareData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={THEME.grid} opacity={0.4} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: THEME.axis }} tickLine={false} />
              <YAxis tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fontSize: 10, fill: THEME.axis }} tickLine={false} width={40} domain={[0, 100]} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]!;
                  return (
                    <div style={{ background: THEME.tooltip.bg, border: `1px solid ${THEME.tooltip.border}`, borderRadius: 4, padding: '8px 12px' }}>
                      <p className="text-xs text-ink-700 mb-1">{label}</p>
                      <p className="text-xs font-mono" style={{ color: d.color ?? THEME.axis }}>
                        Share: {(d.value as number).toFixed(1)}%
                      </p>
                      <p className="text-xs font-mono text-ink-700">
                        Flow: {fmt(shareData.find(s => s.name === label)?.flow ?? 0)}g/tick
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="share" name="Market share" radius={[3, 3, 0, 0]}>
                {shareData.map((entry, i) => (
                  <Cell key={i} fill={entry.is_you ? THEME.you : THEME.other} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Your deposit in this town over time */}
      {depositHistory.length >= 2 ? (
        <div className="bg-parch-50 border border-parch-300 rounded-lg p-4">
          <h3 className="text-gold-400 font-semibold mb-4 text-sm">Your Deposits Here — Over Time</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={depositHistory} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={THEME.grid} opacity={0.4} />
              <XAxis dataKey="tick" tick={{ fontSize: 10, fill: THEME.axis }} tickLine={false} />
              <YAxis tickFormatter={fmt} tick={{ fontSize: 10, fill: THEME.axis }} tickLine={false} width={44} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="balance"
                name="Deposits"
                stroke={THEME.deposit}
                fill={THEME.deposit}
                fillOpacity={0.15}
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="bg-parch-50 border border-parch-300 rounded-lg p-4 text-center text-ink-700 text-sm">
          Deposit history will appear after a few ticks.
        </div>
      )}

    </div>
  );
}
