'use client';
import { useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import type { BalanceSheetSnapshot } from '../store/player-store';

// ─── Game-time helpers ───────────────────────────────────────────────────────

// 360 ticks = 1 game year, 90 ticks = 1 season, 30 ticks ≈ 1 month
const TICKS_PER_YEAR   = 360;
const TICKS_PER_SEASON = 90;
const TICKS_PER_MONTH  = 30;
const SEASONS = ['Spr', 'Sum', 'Aut', 'Win'] as const;

function tickToGameDate(tick: number): string {
  const year        = Math.floor(tick / TICKS_PER_YEAR) + 1;
  const seasonIndex = Math.floor((tick % TICKS_PER_YEAR) / TICKS_PER_SEASON);
  const month       = Math.floor((tick % TICKS_PER_SEASON) / TICKS_PER_MONTH) + 1;
  return `Y${year} ${SEASONS[seasonIndex]} M${month}`;
}

function tickToShort(tick: number): string {
  const year        = Math.floor(tick / TICKS_PER_YEAR) + 1;
  const seasonIndex = Math.floor((tick % TICKS_PER_YEAR) / TICKS_PER_SEASON);
  return `Y${year} ${SEASONS[seasonIndex]}`;
}

// ─── Timeframe config ────────────────────────────────────────────────────────

const TIMEFRAMES = [
  { label: '1 Month',  ticks: TICKS_PER_MONTH },
  { label: '1 Season', ticks: TICKS_PER_SEASON },
  { label: '1 Year',   ticks: TICKS_PER_YEAR },
  { label: '2 Years',  ticks: TICKS_PER_YEAR * 2 },
  { label: 'All',      ticks: Infinity },
] as const;

type TimeframeLabel = typeof TIMEFRAMES[number]['label'];

// ─── Shared chart config ─────────────────────────────────────────────────────

const T = {
  grid:     '#c4a870',
  axis:     '#5a3818',
  cash:     '#2a6840',
  loans:    '#9a7018',
  deposits: '#963020',
  equity:   '#5a3c08',
  interest: '#742418',
  reserve:  '#2a6840',
  danger:   '#963020',
  tooltip:  { bg: '#fefcf5', border: '#c4a870' },
};

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toFixed(0);
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.tooltip.bg, border: `1px solid ${T.tooltip.border}`, borderRadius: 4, padding: '8px 12px' }}>
      <p className="text-xs text-ink-700 mb-1">{tickToGameDate(label)} <span className="opacity-50">(tick {label})</span></p>
      {payload.map((p: any) => (
        <p key={p.name} className="text-xs font-mono" style={{ color: p.color ?? p.stroke }}>
          {p.name}: {p.dataKey === 'reserve_ratio' ? `${(p.value * 100).toFixed(1)}%` : fmt(p.value)}
        </p>
      ))}
    </div>
  );
};

function xAxisProps(data: BalanceSheetSnapshot[]) {
  // Pick ~5 evenly-spaced tick labels
  const n = data.length;
  const step = Math.max(1, Math.floor(n / 5));
  const ticks = data
    .filter((_, i) => i % step === 0 || i === n - 1)
    .map(d => d.tick);
  return {
    dataKey: 'tick' as const,
    ticks,
    tickFormatter: (v: number) => tickToShort(v),
    tick: { fontSize: 10, fill: T.axis },
    tickLine: false,
    type: 'number' as const,
    domain: ['dataMin', 'dataMax'] as const,
  };
}

// ─── Chart card ──────────────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-parch-50 border border-parch-300 rounded-lg p-4">
      <h3 className="text-gold-400 font-semibold mb-4 text-sm">{title}</h3>
      {children}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface Props {
  history: BalanceSheetSnapshot[];
}

export default function BalanceSheetCharts({ history }: Props) {
  const [timeframe, setTimeframe] = useState<TimeframeLabel>('1 Season');

  if (history.length < 2) {
    return (
      <div className="bg-parch-50 border border-parch-300 rounded-lg p-8 text-center text-ink-700 text-sm">
        Charts will appear once data accumulates (a few ticks needed).
      </div>
    );
  }

  // Slice to timeframe
  const selected = TIMEFRAMES.find(t => t.label === timeframe)!;
  const sliced   = selected.ticks === Infinity
    ? history
    : history.slice(-selected.ticks);

  // Downsample to max 120 points for perf
  const step = Math.max(1, Math.floor(sliced.length / 120));
  const data  = sliced.filter((_, i) => i % step === 0 || i === sliced.length - 1);

  const xProps = xAxisProps(data);
  const yAxis  = <YAxis tickFormatter={fmt} tick={{ fontSize: 10, fill: T.axis }} tickLine={false} width={44} />;
  const grid   = <CartesianGrid strokeDasharray="3 3" stroke={T.grid} opacity={0.4} />;

  return (
    <div>
      {/* Timeframe selector */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-ink-700">Timeframe:</span>
        {TIMEFRAMES.map(tf => (
          <button
            key={tf.label}
            onClick={() => setTimeframe(tf.label)}
            className={`text-xs px-3 py-1 rounded border transition-colors ${
              timeframe === tf.label
                ? 'bg-gold-500 text-parch-50 border-gold-500'
                : 'border-parch-300 text-ink-700 hover:bg-parch-200'
            }`}
          >
            {tf.label}
          </button>
        ))}
        {selected.ticks !== Infinity && history.length < selected.ticks && (
          <span className="text-xs text-ink-700 opacity-60 ml-1">
            (only {history.length} ticks recorded so far)
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Assets & Liabilities */}
        <ChartCard title="Assets & Liabilities">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              {grid}
              <XAxis {...xProps} />
              {yAxis}
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="cash"               name="Cash"          stroke={T.cash}     fill={T.cash}     fillOpacity={0.15} strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="total_loan_book"    name="Loans"         stroke={T.loans}    fill={T.loans}    fillOpacity={0.15} strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="total_deposits_owed" name="Deposits owed" stroke={T.deposits} fill={T.deposits} fillOpacity={0.1}  strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Net Equity */}
        <ChartCard title="Net Equity">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              {grid}
              <XAxis {...xProps} />
              {yAxis}
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke={T.danger} strokeDasharray="3 2" strokeWidth={1} />
              <Area type="monotone" dataKey="equity" name="Equity" stroke={T.equity} fill={T.equity} fillOpacity={0.2} strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Reserve Ratio */}
        <ChartCard title="Reserve Ratio">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              {grid}
              <XAxis {...xProps} />
              <YAxis tickFormatter={v => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 10, fill: T.axis }} tickLine={false} width={36} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0.10} stroke={T.danger} strokeDasharray="4 2" strokeWidth={1} label={{ value: '10% min', fontSize: 9, fill: T.danger, position: 'insideTopRight' }} />
              <Line type="monotone" dataKey="reserve_ratio" name="Reserve ratio" stroke={T.reserve} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Interest accrued */}
        <ChartCard title="Cumulative Interest Accrued">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              {grid}
              <XAxis {...xProps} />
              {yAxis}
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="total_interest_accrued" name="Interest accrued" stroke={T.interest} fill={T.interest} fillOpacity={0.15} strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

      </div>
    </div>
  );
}
