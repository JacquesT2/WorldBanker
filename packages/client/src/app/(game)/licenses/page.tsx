'use client';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { usePlayerStore } from '../../../store/player-store';

interface LicenseMarketEntry {
  town_id: string;
  town_name: string;
  region_name: string;
  region_type: string;
  population: number;
  wealth_per_capita: number;
  economic_output: number;
  existing_license_count: number;
  license_cost: number;
  you_are_licensed: boolean;
}

const RISK_COLORS: Record<string, string> = {
  'coastal-trade-hub':  'text-blue-400',
  'river-delta':        'text-green-400',
  'mountain-mining':    'text-yellow-600',
  'forest-timber':      'text-green-600',
  'steppe-pastoral':    'text-yellow-400',
  'volcanic':           'text-red-400',
  'island-archipelago': 'text-cyan-400',
  'crossroads':         'text-purple-400',
  'marshland':          'text-gray-400',
  'highland-plateau':   'text-gray-300',
};

export default function LicensesPage() {
  const [market, setMarket] = useState<LicenseMarketEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'output' | 'cost' | 'population'>('output');

  const bs = usePlayerStore(s => s.balanceSheet);

  useEffect(() => {
    api.licenses.market()
      .then(data => setMarket(data as LicenseMarketEntry[]))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const handlePurchase = async (townId: string) => {
    setPurchasing(townId);
    try {
      const res = await api.licenses.purchase(townId);
      setMessages(m => ({ ...m, [townId]: `License purchased! Cost: ${res.cost}g` }));
      setMarket(prev => prev.map(t =>
        t.town_id === townId
          ? { ...t, you_are_licensed: true, existing_license_count: t.existing_license_count + 1 }
          : t
      ));
    } catch (err) {
      setMessages(m => ({ ...m, [townId]: (err as Error).message }));
    } finally {
      setPurchasing(null);
    }
  };

  const filtered = market
    .filter(t =>
      t.town_name.toLowerCase().includes(search.toLowerCase()) ||
      t.region_name?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) =>
      sortBy === 'output'     ? b.economic_output - a.economic_output :
      sortBy === 'cost'       ? a.license_cost - b.license_cost :
                                b.population - a.population
    );

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-gold-400 mb-4">License Market</h2>

      {bs && (
        <p className="text-parch-200 text-sm mb-4">
          Available cash: <span className="font-mono text-gold-400">{bs.cash.toFixed(0)}g</span>
        </p>
      )}

      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search towns..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-ink-700 border border-gold-600 rounded px-3 py-2 text-sm text-parch-100 w-48"
        />
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="bg-ink-700 border border-gold-600 rounded px-3 py-2 text-sm text-parch-100"
        >
          <option value="output">Sort: Economy</option>
          <option value="population">Sort: Population</option>
          <option value="cost">Sort: License Cost</option>
        </select>
      </div>

      {loading ? (
        <p className="text-parch-200">Loading market...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-parch-200 border-b border-gold-600 text-left">
                <th className="pb-2 pr-4">Town</th>
                <th className="pb-2 pr-4">Region</th>
                <th className="pb-2 pr-4 text-right">Pop.</th>
                <th className="pb-2 pr-4 text-right">Output</th>
                <th className="pb-2 pr-4 text-right">Banks</th>
                <th className="pb-2 pr-4 text-right">Cost</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(town => (
                <tr
                  key={town.town_id}
                  className={`border-b border-ink-700 hover:bg-ink-700 ${town.you_are_licensed ? 'opacity-60' : ''}`}
                >
                  <td className="py-2 pr-4 font-medium">
                    {town.town_name}
                    {town.you_are_licensed && <span className="ml-2 text-xs text-safe-400">✓ Licensed</span>}
                  </td>
                  <td className={`py-2 pr-4 text-xs ${RISK_COLORS[town.region_type] ?? 'text-parch-200'}`}>
                    {town.region_name}
                  </td>
                  <td className="py-2 pr-4 text-right font-mono">{town.population.toLocaleString()}</td>
                  <td className="py-2 pr-4 text-right font-mono text-gold-400">
                    {(town.economic_output / 1000).toFixed(0)}k
                  </td>
                  <td className="py-2 pr-4 text-right font-mono">{town.existing_license_count}</td>
                  <td className="py-2 pr-4 text-right font-mono text-gold-400">{town.license_cost}g</td>
                  <td className="py-2">
                    {messages[town.town_id] ? (
                      <span className="text-xs text-parch-200">{messages[town.town_id]}</span>
                    ) : !town.you_are_licensed ? (
                      <button
                        onClick={() => handlePurchase(town.town_id)}
                        disabled={purchasing === town.town_id || (bs ? bs.cash < town.license_cost : true)}
                        className="bg-gold-500 hover:bg-gold-400 text-ink-800 text-xs font-bold px-3 py-1 rounded disabled:opacity-40"
                      >
                        {purchasing === town.town_id ? '...' : 'Buy'}
                      </button>
                    ) : null}
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
