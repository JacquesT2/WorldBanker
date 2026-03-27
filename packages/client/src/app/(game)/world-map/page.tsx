'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWorldStore } from '../../../store/world-store';
import { usePlayerStore } from '../../../store/player-store';
import { api } from '../../../lib/api';
import { SECTOR_LEVEL_COSTS, SECTOR_BUILD_TICKS, SECTOR_RETURN_RATES } from '@argentum/shared';
import type { SectorType } from '@argentum/shared';

// ── colours ──────────────────────────────────────────────────────────────────

const REGION_COLORS: Record<string, string> = {
  'coastal-trade-hub':  '#2196F3',
  'river-delta':        '#4CAF50',
  'mountain-mining':    '#795548',
  'forest-timber':      '#388E3C',
  'steppe-pastoral':    '#FFC107',
  'volcanic':           '#F44336',
  'island-archipelago': '#00BCD4',
  'crossroads':         '#9C27B0',
  'marshland':          '#607D8B',
  'highland-plateau':   '#78909C',
};

const SECTOR_COLORS: Record<SectorType, string> = {
  military:       '#ef4444',
  heavy_industry: '#f97316',
  construction:   '#eab308',
  commerce:       '#22c55e',
  maritime:       '#3b82f6',
  agriculture:    '#84cc16',
};

const SECTOR_ICONS: Record<SectorType, string> = {
  military:       '⚔',
  heavy_industry: '⚒',
  construction:   '🏗',
  commerce:       '💰',
  maritime:       '⚓',
  agriculture:    '🌾',
};

const SECTOR_LABELS: Record<SectorType, string> = {
  military:       'Military',
  heavy_industry: 'Heavy Industry',
  construction:   'Construction',
  commerce:       'Commerce',
  maritime:       'Maritime',
  agriculture:    'Agriculture',
};

const ALL_SECTORS: SectorType[] = ['military', 'heavy_industry', 'construction', 'commerce', 'maritime', 'agriculture'];

// ── component ─────────────────────────────────────────────────────────────────

interface Tooltip {
  townId: string;
  relX: number; // px relative to SVG container
  relY: number;
}

interface InvestmentEntry {
  id: string;
  player_id: string;
  town_id: string;
  sector_type: string;
  amount_invested: number;
  completion_tick: number;
  completed: boolean;
  annual_return_rate: number;
}

export default function WorldMapPage() {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);

  const towns    = useWorldStore(s => Array.from(s.towns.values()));
  const regions  = useWorldStore(s => s.regions);
  const events   = useWorldStore(s => s.events);
  const tradeRoutes = useWorldStore(s => s.tradeRoutes);
  const clock    = useWorldStore(s => s.clock);
  const licenses = usePlayerStore(s => s.licenses);
  const bs       = usePlayerStore(s => s.balanceSheet);

  const licensedTownIds = new Set(licenses.map(l => l.town_id));

  // active-event map
  const townEventCount = new Map<string, number>();
  for (const ev of events.values()) {
    if (ev.ticks_remaining > 0)
      townEventCount.set(ev.town_id, (townEventCount.get(ev.town_id) ?? 0) + 1);
  }

  // town lookup
  const townById = new Map(towns.map(t => [t.id, t]));

  // ui state
  const [tooltip, setTooltip]         = useState<Tooltip | null>(null);
  const [selectedTownId, setSelected] = useState<string | null>(null);
  const [filterSector, setFilter]     = useState<SectorType | null>(null);
  const [investments, setInvestments] = useState<InvestmentEntry[]>([]);
  const [form, setForm] = useState({ sector_type: 'commerce' as SectorType, amount: 0 });
  const [submitting, setSubmitting]   = useState(false);
  const [message, setMessage]         = useState('');

  const selectedTown = selectedTownId ? townById.get(selectedTownId) : null;

  // load investments on mount
  useEffect(() => {
    api.investments.mine()
      .then(data => setInvestments(data as InvestmentEntry[]))
      .catch(() => {});
  }, []);

  // ── mouse handlers ────────────────────────────────────────────────────────

  const handleTownClick = (townId: string) => {
    if (selectedTownId === townId) {
      setSelected(null);
    } else {
      setSelected(townId);
      setMessage('');
      // default sector to highest-potential non-max sector
      const t = townById.get(townId);
      if (t) {
        const best = (ALL_SECTORS.find(s => t.sectors[s] < 5) ?? 'commerce') as SectorType;
        setForm({ sector_type: best, amount: 0 });
      }
    }
  };

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // don't show tooltip if panel is open
    if (selectedTownId) { setTooltip(null); return; }
  }, [selectedTownId]);

  const handleTownHover = (townId: string, _svgX: number, _svgY: number, e: React.MouseEvent) => {
    if (selectedTownId) return;
    const rect = svgRef.current?.getBoundingClientRect();
    const relX = rect ? e.clientX - rect.left : e.clientX;
    const relY = rect ? e.clientY - rect.top  : e.clientY;
    setTooltip({ townId, relX, relY });
  };

  // ── invest ───────────────────────────────────────────────────────────────

  const currentSectorLevel = selectedTown ? selectedTown.sectors[form.sector_type] : 0;
  const requiredAmount = currentSectorLevel < 5
    ? (SECTOR_LEVEL_COSTS[form.sector_type] ?? [])[currentSectorLevel] ?? 0
    : 0;
  const buildTicks = SECTOR_BUILD_TICKS[form.sector_type] ?? 90;

  const handleInvest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTownId) return;
    setSubmitting(true);
    setMessage('');
    try {
      await api.investments.invest(selectedTownId, form.sector_type, form.amount);
      setMessage('Investment placed!');
      const updated = await api.investments.mine();
      setInvestments(updated as InvestmentEntry[]);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── render helpers ────────────────────────────────────────────────────────

  const townInvestments = selectedTownId
    ? investments.filter(i => i.town_id === selectedTownId)
    : [];

  // sector level coloring for nodes when filter active
  const getNodeColor = (townId: string) => {
    const t = townById.get(townId);
    if (!t) return '#888';
    if (filterSector) {
      const level = t.sectors[filterSector];
      // 0 = gray, 1-2 = amber, 3-4 = green, 5 = gold
      if (level === 0) return '#6b7280';
      if (level <= 2) return '#d97706';
      if (level <= 4) return '#16a34a';
      return '#ca8a04';
    }
    const region = regions.get(t.region_id);
    return region ? (REGION_COLORS[region.type] ?? '#888') : '#888';
  };

  // node radius: capitals bigger, scaled slightly by pop
  const getRadius = (townId: string) => {
    const t = townById.get(townId);
    if (!t) return 1.0;
    const base = t.is_regional_capital ? 2.2 : 1.2;
    // small pop bonus
    const popMod = Math.sqrt(t.population / 30000) * 0.3;
    return base + popMod;
  };

  return (
    <div className="h-full flex overflow-hidden" style={{ background: '#f5e8c8' }}>

      {/* ── MAP AREA ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* top bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-parch-300 flex-wrap">
          <span className="text-gold-400 font-bold text-sm tracking-wide">VALDRIS — WORLD MAP</span>
          <span className="text-ink-700 text-xs">|</span>
          <span className="text-xs text-ink-700">Filter by sector:</span>
          <button
            onClick={() => setFilter(null)}
            className={`px-2 py-0.5 rounded text-xs font-medium border ${!filterSector ? 'bg-gold-500 text-parch-50 border-gold-500' : 'border-parch-300 text-ink-700 hover:border-gold-400'}`}
          >
            Region
          </button>
          {ALL_SECTORS.map(s => (
            <button
              key={s}
              onClick={() => setFilter(filterSector === s ? null : s)}
              className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${filterSector === s ? 'text-parch-50 border-transparent' : 'border-parch-300 text-ink-700 hover:border-current'}`}
              style={filterSector === s ? { background: SECTOR_COLORS[s] } : { color: SECTOR_COLORS[s] }}
            >
              {SECTOR_ICONS[s]} {SECTOR_LABELS[s]}
            </button>
          ))}
        </div>

        {/* SVG map */}
        <div className="flex-1 relative overflow-hidden">
          <svg
            ref={svgRef}
            viewBox="0 0 100 100"
            className="w-full h-full"
            style={{ background: '#d4c090' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setTooltip(null)}
          >
            {/* parchment texture gradient */}
            <defs>
              <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
                <stop offset="0%" stopColor="#e8d4a0" stopOpacity="0" />
                <stop offset="100%" stopColor="#8b6914" stopOpacity="0.25" />
              </radialGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="0.4" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            <rect width="100" height="100" fill="#e0cfa0" />
            <rect width="100" height="100" fill="url(#vignette)" />

            {/* ── trade routes ─────────────────────────────────── */}
            {tradeRoutes.map((route, i) => {
              const a = townById.get(route.town_a_id);
              const b = townById.get(route.town_b_id);
              if (!a || !b) return null;
              const opacity = 0.12 + (route.strength / 10) * 0.25;
              const strokeW = 0.12 + (route.strength / 10) * 0.25;
              const color = route.route_type === 'sea' ? '#1e6fa5'
                : route.route_type === 'river' ? '#2d7a40'
                : '#7a5c2a';
              return (
                <line
                  key={i}
                  x1={a.x_coord} y1={a.y_coord}
                  x2={b.x_coord} y2={b.y_coord}
                  stroke={color}
                  strokeWidth={strokeW}
                  opacity={opacity}
                  strokeDasharray={route.route_type === 'sea' ? '0.8 0.5' : undefined}
                />
              );
            })}

            {/* ── town nodes ───────────────────────────────────── */}
            {towns.map(town => {
              const color    = getNodeColor(town.id);
              const radius   = getRadius(town.id);
              const hasEvent = (townEventCount.get(town.id) ?? 0) > 0;
              const isLicensed = licensedTownIds.has(town.id);
              const isSelected = selectedTownId === town.id;
              const cx = town.x_coord;
              const cy = town.y_coord;

              return (
                <g
                  key={town.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleTownClick(town.id)}
                  onMouseEnter={e => handleTownHover(town.id, cx, cy, e)}
                  onMouseLeave={() => !selectedTownId && setTooltip(null)}
                >
                  {/* selected glow ring */}
                  {isSelected && (
                    <circle cx={cx} cy={cy} r={radius + 2.5}
                      fill="none" stroke="#9a7018" strokeWidth="0.8" opacity="0.7" />
                  )}

                  {/* event pulse ring */}
                  {hasEvent && (
                    <circle cx={cx} cy={cy} r={radius + 1.5}
                      fill="none" stroke="#dc2626" strokeWidth="0.45" opacity="0.8" />
                  )}

                  {/* license ring */}
                  {isLicensed && !isSelected && (
                    <circle cx={cx} cy={cy} r={radius + 0.9}
                      fill="none" stroke="#ca8a04" strokeWidth="0.4" opacity="0.9" />
                  )}

                  {/* sector arc rings (mini radar — 6 arcs, one per sector) */}
                  {!filterSector && ALL_SECTORS.map((sector, si) => {
                    const level = town.sectors[sector];
                    if (level === 0) return null;
                    const arcR = radius + 0.5 + si * 0.28;
                    const frac = level / 5;
                    // arc from top, clockwise
                    const startAngle = -Math.PI / 2;
                    const endAngle   = startAngle + 2 * Math.PI * frac;
                    const x1 = cx + arcR * Math.cos(startAngle);
                    const y1 = cy + arcR * Math.sin(startAngle);
                    const x2 = cx + arcR * Math.cos(endAngle);
                    const y2 = cy + arcR * Math.sin(endAngle);
                    const large = frac > 0.5 ? 1 : 0;
                    return (
                      <path
                        key={sector}
                        d={`M ${x1} ${y1} A ${arcR} ${arcR} 0 ${large} 1 ${x2} ${y2}`}
                        fill="none"
                        stroke={SECTOR_COLORS[sector]}
                        strokeWidth="0.22"
                        opacity="0.75"
                      />
                    );
                  })}

                  {/* main dot */}
                  <circle
                    cx={cx} cy={cy} r={radius}
                    fill={color}
                    opacity={isSelected ? 1 : 0.88}
                    filter={isSelected ? 'url(#glow)' : undefined}
                  />

                  {/* capital marker */}
                  {town.is_regional_capital && (
                    <circle cx={cx} cy={cy} r={radius * 0.35}
                      fill="white" opacity="0.9" />
                  )}

                  {/* town label — all towns on hover/select, always for capitals */}
                  {(town.is_regional_capital || isSelected || tooltip?.townId === town.id) && (
                    <text
                      x={cx + radius + 0.5}
                      y={cy + 0.5}
                      fontSize={town.is_regional_capital ? '2.0' : '1.6'}
                      fontWeight={town.is_regional_capital ? 'bold' : 'normal'}
                      fill="#2a1505"
                      opacity="0.95"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {town.name}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* ── tooltip (HTML overlay) ────────────────────────── */}
          {tooltip && !selectedTownId && (() => {
            const t = townById.get(tooltip.townId);
            if (!t) return null;
            const region = regions.get(t.region_id);
            const topSectors = ALL_SECTORS
              .filter(s => t.sectors[s] > 0)
              .sort((a, b) => t.sectors[b] - t.sectors[a])
              .slice(0, 3);
            return (
              <div
                className="absolute z-20 pointer-events-none"
                style={{ left: tooltip.relX + 12, top: tooltip.relY - 10 }}
              >
                <div className="bg-parch-50 border border-parch-300 rounded-lg shadow-lg p-3 text-xs min-w-36" style={{ backdropFilter: 'blur(2px)' }}>
                  <p className="font-bold text-gold-400 text-sm">{t.name}</p>
                  <p className="text-ink-700 mb-1">{region?.name} · {region?.type?.replace(/-/g, ' ')}</p>
                  <div className="space-y-0.5 text-ink-800">
                    <div className="flex justify-between gap-3">
                      <span className="text-ink-700">Population</span>
                      <span className="font-mono">{t.population.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-ink-700">Output</span>
                      <span className="font-mono text-gold-400">{Math.round(t.economic_output).toLocaleString()}</span>
                    </div>
                  </div>
                  {topSectors.length > 0 && (
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {topSectors.map(s => (
                        <span key={s} className="px-1.5 py-0.5 rounded text-xs font-medium text-white"
                          style={{ background: SECTOR_COLORS[s] }}>
                          {SECTOR_ICONS[s]} Lv{t.sectors[s]}
                        </span>
                      ))}
                    </div>
                  )}
                  {(townEventCount.get(t.id) ?? 0) > 0 && (
                    <p className="text-danger-400 mt-1 text-xs">⚠ Active events</p>
                  )}
                  {licensedTownIds.has(t.id) && (
                    <p className="text-safe-400 mt-0.5 text-xs">✓ Licensed</p>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* legend */}
        <div className="px-4 py-2 border-t border-parch-300 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-700">
          {filterSector ? (
            <>
              <span className="text-ink-700">Sector level:</span>
              <span style={{ color: '#6b7280' }}>● None</span>
              <span style={{ color: '#d97706' }}>● Low (1–2)</span>
              <span style={{ color: '#16a34a' }}>● High (3–4)</span>
              <span style={{ color: '#ca8a04' }}>● Max (5)</span>
            </>
          ) : (
            <>
              {Object.entries(REGION_COLORS).map(([type, color]) => (
                <span key={type} className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                  {type.replace(/-/g, ' ')}
                </span>
              ))}
            </>
          )}
          <span className="text-ink-700 ml-auto">Gold ring = license · Red ring = event · Arcs = sector levels</span>
        </div>
      </div>

      {/* ── SIDE PANEL ───────────────────────────────────────────────── */}
      {selectedTown && (
        <div className="w-80 border-l border-parch-300 flex flex-col overflow-y-auto" style={{ background: '#f0e0b0' }}>
          {/* header */}
          <div className="p-4 border-b border-parch-300">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-gold-400 font-bold text-lg leading-tight">{selectedTown.name}</h3>
                <p className="text-ink-700 text-xs">{regions.get(selectedTown.region_id)?.name}</p>
              </div>
              <div className="flex gap-2 items-center">
                <button
                  onClick={() => router.push(`/town/${selectedTown.id}`)}
                  className="text-xs px-2 py-1 border border-parch-300 rounded text-ink-700 hover:border-gold-400 hover:text-gold-400"
                >
                  Details
                </button>
                <button
                  onClick={() => setSelected(null)}
                  className="text-ink-700 hover:text-ink-800 text-lg leading-none"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-parch-50 rounded p-2">
                <p className="text-ink-700">Population</p>
                <p className="font-mono font-medium">{selectedTown.population.toLocaleString()}</p>
              </div>
              <div className="bg-parch-50 rounded p-2">
                <p className="text-ink-700">Output</p>
                <p className="font-mono font-medium text-gold-400">{Math.round(selectedTown.economic_output).toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* sectors */}
          <div className="p-4 border-b border-parch-300">
            <h4 className="text-ink-700 text-xs font-semibold uppercase tracking-wide mb-3">Sector Development</h4>
            <div className="space-y-2">
              {ALL_SECTORS.map(sector => {
                const level = selectedTown.sectors[sector];
                return (
                  <div key={sector} className="flex items-center gap-2">
                    <span className="text-sm w-4">{SECTOR_ICONS[sector]}</span>
                    <span className="text-xs text-ink-700 w-24">{SECTOR_LABELS[sector]}</span>
                    <div className="flex gap-0.5 flex-1">
                      {Array.from({ length: 5 }, (_, i) => (
                        <div
                          key={i}
                          className="h-2 flex-1 rounded-sm"
                          style={{ background: i < level ? SECTOR_COLORS[sector] : '#d4c090' }}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-ink-700 w-6 text-right">{level}/5</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* invest — only if licensed */}
          {licensedTownIds.has(selectedTown.id) ? (
            <div className="p-4 border-b border-parch-300">
              <h4 className="text-ink-700 text-xs font-semibold uppercase tracking-wide mb-3">Fund Sector Development</h4>
              <form onSubmit={handleInvest} className="space-y-3">
                <div>
                  <label className="block text-ink-700 text-xs mb-1">Sector</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ALL_SECTORS.map(s => {
                      const lvl = selectedTown.sectors[s];
                      const cost = lvl < 5 ? (SECTOR_LEVEL_COSTS[s] ?? [])[lvl] ?? 0 : 0;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, sector_type: s, amount: cost }))}
                          disabled={lvl >= 5}
                          className={`p-2 rounded text-xs text-left border transition-all ${
                            form.sector_type === s
                              ? 'border-transparent text-white'
                              : 'border-parch-300 text-ink-700 hover:border-current disabled:opacity-40 disabled:cursor-not-allowed'
                          }`}
                          style={form.sector_type === s ? { background: SECTOR_COLORS[s] } : {}}
                        >
                          <span>{SECTOR_ICONS[s]} {SECTOR_LABELS[s]}</span>
                          <br />
                          <span className="opacity-75">Lv{lvl}{lvl >= 5 ? ' MAX' : ''}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedTown.sectors[form.sector_type] < 5 && (
                  <>
                    <div className="bg-parch-50 rounded p-2 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-ink-700">Minimum investment</span>
                        <span className="font-mono text-gold-400">{requiredAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-700">Build time</span>
                        <span className="font-mono">{buildTicks} ticks ({Math.round(buildTicks / 90)} seasons)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-700">Annual return</span>
                        <span className="font-mono text-safe-400">{((SECTOR_RETURN_RATES[form.sector_type] ?? 0) * 100).toFixed(0)}%</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-ink-700 text-xs mb-1">
                        Amount <span className="text-ink-600">(min {requiredAmount.toLocaleString()})</span>
                      </label>
                      <input
                        type="number"
                        min={requiredAmount}
                        value={form.amount || ''}
                        onChange={e => setForm(f => ({ ...f, amount: parseInt(e.target.value) || 0 }))}
                        className="w-full bg-white border border-parch-300 rounded px-3 py-1.5 text-sm font-mono text-ink-800"
                        required
                      />
                      {bs && (
                        <p className="text-xs text-ink-700 mt-0.5">
                          Available: <span className="font-mono text-gold-400">{Math.floor(bs.cash).toLocaleString()}</span>
                        </p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={submitting || !form.amount || form.amount < requiredAmount || (bs ? bs.cash < form.amount : true)}
                      className="w-full py-2 rounded font-bold text-sm text-parch-50 disabled:opacity-40 transition-colors"
                      style={{ background: SECTOR_COLORS[form.sector_type] }}
                    >
                      {submitting ? 'Investing…' : `Fund ${SECTOR_LABELS[form.sector_type]}`}
                    </button>
                    {message && (
                      <p className={`text-xs ${message.includes('!') ? 'text-safe-400' : 'text-danger-400'}`}>{message}</p>
                    )}
                  </>
                )}
              </form>
            </div>
          ) : (
            <div className="p-4 border-b border-parch-300">
              <p className="text-ink-700 text-xs">You need a banking license in {selectedTown.name} to fund sector development.</p>
              <button
                onClick={() => router.push('/licenses')}
                className="mt-2 text-xs text-gold-400 hover:underline"
              >
                Manage licenses →
              </button>
            </div>
          )}

          {/* active investments in this town */}
          {townInvestments.length > 0 && (
            <div className="p-4">
              <h4 className="text-ink-700 text-xs font-semibold uppercase tracking-wide mb-2">Your Investments Here</h4>
              <div className="space-y-2">
                {townInvestments.map(inv => {
                  const ticksLeft = clock ? Math.max(0, inv.completion_tick - clock.current_tick) : '?';
                  const sector = inv.sector_type as SectorType;
                  return (
                    <div key={inv.id} className="bg-parch-50 border border-parch-300 rounded p-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium" style={{ color: SECTOR_COLORS[sector] ?? '#888' }}>
                          {SECTOR_ICONS[sector] ?? ''} {SECTOR_LABELS[sector] ?? inv.sector_type}
                        </span>
                        {inv.completed ? (
                          <span className="text-safe-400 font-medium">✓ Active</span>
                        ) : (
                          <span className="text-ink-700">{ticksLeft} ticks left</span>
                        )}
                      </div>
                      <div className="flex justify-between mt-0.5 text-ink-700">
                        <span className="font-mono">{Math.round(inv.amount_invested).toLocaleString()} gold</span>
                        <span className="font-mono">{(inv.annual_return_rate * 100).toFixed(0)}%/yr</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
