'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePlayerStore } from '../../../store/player-store';
import { useWorldStore } from '../../../store/world-store';
import { api } from '../../../lib/api';
import type { Company } from '@argentum/shared';

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toFixed(0);
}

function riskBadge(prob: number): string {
  const pct = prob * 360 * 100;
  if (pct > 25) return 'bg-danger-400 bg-opacity-10 text-danger-400 border-danger-400';
  if (pct > 12) return 'bg-amber-100 text-amber-800 border-amber-400';
  return 'bg-safe-400 bg-opacity-10 text-safe-400 border-safe-400';
}

type CompanyWithRelation = Company & { relation_score: number };

export default function CompaniesPage() {
  const router = useRouter();
  const licenses = usePlayerStore(s => s.licenses);
  const getTown  = useWorldStore(s => s.getTown);

  const [companies, setCompanies] = useState<CompanyWithRelation[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    api.companies.list()
      .then(data => setCompanies(data as CompanyWithRelation[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const licensedTownIds = new Set(licenses.map(l => l.town_id));
  const allTypes = Array.from(new Set(companies.map(c => c.company_type))).sort();

  const filtered = companies.filter(c => {
    if (typeFilter !== 'all' && c.company_type !== typeFilter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalRevenue = filtered.reduce((s, c) => s + c.annual_revenue, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-gold-400">Companies</h2>
        <p className="text-xs text-ink-700">{filtered.length} companies in your licensed towns</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-parch-50 border border-parch-300 rounded-lg p-3">
          <p className="text-xs text-ink-700 mb-1">Total Companies</p>
          <p className="text-xl font-mono font-bold text-gold-400">{filtered.length}</p>
        </div>
        <div className="bg-parch-50 border border-parch-300 rounded-lg p-3">
          <p className="text-xs text-ink-700 mb-1">Combined Revenue</p>
          <p className="text-xl font-mono font-bold text-gold-400">{fmt(totalRevenue)}/yr</p>
        </div>
        <div className="bg-parch-50 border border-parch-300 rounded-lg p-3">
          <p className="text-xs text-ink-700 mb-1">Licensed Towns</p>
          <p className="text-xl font-mono font-bold text-gold-400">{licensedTownIds.size}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-parch-50 border border-parch-300 rounded-lg p-3 mb-4 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search by name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-white border border-parch-300 rounded px-2 py-1 text-xs font-mono text-ink-800 w-40"
        />
        <div className="flex items-center gap-1">
          <span className="text-xs text-ink-700">Type:</span>
          <button
            onClick={() => setTypeFilter('all')}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${typeFilter === 'all' ? 'bg-gold-500 text-parch-50 border-gold-500' : 'border-parch-300 text-ink-700 hover:bg-parch-200'}`}
          >
            all
          </button>
          {allTypes.map(t => (
            <button key={t}
              onClick={() => setTypeFilter(t)}
              className={`text-xs px-2 py-0.5 rounded border capitalize transition-colors ${typeFilter === t ? 'bg-gold-500 text-parch-50 border-gold-500' : 'border-parch-300 text-ink-700 hover:bg-parch-200'}`}
            >
              {t.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-ink-700 text-sm">Loading companies…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-parch-50 border border-parch-300 rounded-lg p-8 text-center text-ink-700">
          No companies found. Acquire banking licenses to see companies in those towns.
        </div>
      ) : (
        <div className="bg-parch-50 border border-parch-300 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-parch-200 text-ink-700 text-xs">
                <th className="text-left px-4 py-2">Company</th>
                <th className="text-left px-4 py-2">Town</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-right px-4 py-2">Revenue/yr</th>
                <th className="text-right px-4 py-2">Default risk</th>
                <th className="text-right px-4 py-2">Relation</th>
                <th className="text-right px-4 py-2">Debt</th>
                <th className="text-right px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const town   = getTown(c.town_id);
                const riskPct = c.base_default_probability * 360 * 100;
                const relColor = c.relation_score > 20 ? 'text-safe-400' : c.relation_score < -20 ? 'text-danger-400' : 'text-ink-700';
                return (
                  <tr
                    key={c.id}
                    className="border-t border-parch-200 hover:bg-parch-100 cursor-pointer"
                    onClick={() => router.push(`/companies/${c.id}`)}
                  >
                    <td className="px-4 py-2.5 font-medium text-ink-800">{c.name}</td>
                    <td className="px-4 py-2.5 text-ink-700 text-xs">{town?.name ?? c.town_id}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs capitalize text-ink-700">{c.company_type.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-gold-400">{fmt(c.annual_revenue)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${riskBadge(c.base_default_probability)}`}>
                        {riskPct.toFixed(1)}%/yr
                      </span>
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono text-xs ${relColor}`}>
                      {c.relation_score > 0 ? '+' : ''}{c.relation_score.toFixed(0)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-ink-700">{fmt(c.total_debt)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`text-xs font-medium ${
                        c.status === 'active' ? 'text-safe-400' :
                        c.status === 'struggling' ? 'text-amber-700' :
                        'text-danger-400'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
