'use client';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell,
} from 'recharts';
import type { BankingLicense, Deposit } from '@argentum/shared';

const THEME = {
  grid:     '#c4a870',
  axis:     '#5a3818',
  deposit:  '#2a6840',
  rate:     '#9a7018',
  tooltip:  { bg: '#fefcf5', border: '#c4a870' },
};

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toFixed(0);
}

interface TownMeta {
  id: string;
  name: string;
}

interface Props {
  licenses: BankingLicense[];
  deposits: Deposit[];
  getTown: (id: string) => TownMeta | undefined;
  townTotalDeposits: Record<string, number>;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: THEME.tooltip.bg, border: `1px solid ${THEME.tooltip.border}`, borderRadius: 4, padding: '8px 12px' }}>
      <p className="text-xs text-ink-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="text-xs font-mono" style={{ color: p.fill ?? THEME.axis }}>
          {p.name}: {p.dataKey === 'rate' ? `${(p.value * 100).toFixed(2)}%` : fmt(p.value)}
        </p>
      ))}
    </div>
  );
};

export default function MarketCoverageCharts({ licenses, deposits, getTown, townTotalDeposits }: Props) {
  if (licenses.length === 0) {
    return (
      <div className="bg-parch-50 border border-parch-300 rounded-lg p-6 text-center text-ink-700 text-sm">
        No licenses yet. Purchase licenses to see market coverage.
      </div>
    );
  }

  const data = licenses.map(l => {
    const town = getTown(l.town_id);
    const dep = deposits.find(d => d.town_id === l.town_id);
    return {
      name: town?.name ?? l.town_id.replace('town_', ''),
      deposits: dep?.balance ?? 0,
      rate: dep?.interest_rate_offered ?? 0,
      town_total: townTotalDeposits[l.town_id] ?? 0,
    };
  }).sort((a, b) => b.deposits - a.deposits);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

      {/* Deposits per town */}
      <div className="bg-parch-50 border border-parch-300 rounded-lg p-4">
        <h3 className="text-gold-400 font-semibold mb-4 text-sm">Deposits Held per Town</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={THEME.grid} opacity={0.4} horizontal={false} />
            <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 10, fill: THEME.axis }} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: THEME.axis }} tickLine={false} width={70} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="deposits" name="Deposits" fill={THEME.deposit} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Deposit rate per town */}
      <div className="bg-parch-50 border border-parch-300 rounded-lg p-4">
        <h3 className="text-gold-400 font-semibold mb-4 text-sm">Deposit Rate Offered per Town</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={THEME.grid} opacity={0.4} horizontal={false} />
            <XAxis type="number" tickFormatter={v => `${(v * 100).toFixed(1)}%`} tick={{ fontSize: 10, fill: THEME.axis }} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: THEME.axis }} tickLine={false} width={70} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="rate" name="Rate" fill={THEME.rate} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Your deposits vs total town deposits */}
      <div className="bg-parch-50 border border-parch-300 rounded-lg p-4 md:col-span-2">
        <h3 className="text-gold-400 font-semibold mb-4 text-sm">Your Deposits vs Total Town Deposits</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={THEME.grid} opacity={0.4} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: THEME.axis }} tickLine={false} angle={-30} textAnchor="end" />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 10, fill: THEME.axis }} tickLine={false} width={44} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="town_total" name="All banks" fill={THEME.grid} radius={[3, 3, 0, 0]} opacity={0.6} />
            <Bar dataKey="deposits" name="Your deposits" fill={THEME.deposit} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-ink-700 mt-2">Tan = total deposits held by all banks in this town. Green = your share.</p>
      </div>

    </div>
  );
}
