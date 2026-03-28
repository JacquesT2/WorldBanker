'use client';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useWorldStore } from '../../../store/world-store';
import { usePlayerStore } from '../../../store/player-store';
import type { Town } from '@argentum/shared';

// ── canvas constants ─────────────────────────────────────────────────────────
const GRID_W = 240;
const GRID_H = 160;

// ── colours ──────────────────────────────────────────────────────────────────
type RGB = [number, number, number];

const BG: RGB = [200, 178, 120];

const REGION_RGB: Record<string, RGB> = {
  'coastal-trade-hub':  [33,  150, 243],
  'river-delta':        [76,  175,  80],
  'mountain-mining':    [121,  85,  72],
  'forest-timber':      [56,  142,  60],
  'steppe-pastoral':    [220, 170,  20],
  'volcanic':           [220,  70,  40],
  'island-archipelago': [0,   188, 212],
  'crossroads':         [156,  39, 176],
  'marshland':          [96,  125, 139],
  'highland-plateau':   [110, 130, 145],
};

function getTownRGB(
  town: Town,
  regions: Map<string, { type: string }>,
): RGB {
  const region = regions.get(town.region_id);
  return region ? (REGION_RGB[region.type] ?? [130, 130, 130]) : [130, 130, 130];
}

// Bresenham pixel line into Uint8ClampedArray
function drawPixelLine(
  data: Uint8ClampedArray,
  x0: number, y0: number, x1: number, y1: number,
  r: number, g: number, b: number, alpha: number,
) {
  const blend = alpha / 255;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  while (true) {
    if (x >= 0 && x < GRID_W && y >= 0 && y < GRID_H) {
      const i = (y * GRID_W + x) * 4;
      data[i]   = data[i]   * (1 - blend) + r * blend;
      data[i+1] = data[i+1] * (1 - blend) + g * blend;
      data[i+2] = data[i+2] * (1 - blend) + b * blend;
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx)  { err += dx; y += sy; }
  }
}

function setPixel(data: Uint8ClampedArray, x: number, y: number, r: number, g: number, b: number) {
  if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return;
  const i = (y * GRID_W + x) * 4;
  data[i] = r; data[i+1] = g; data[i+2] = b; data[i+3] = 255;
}

function economyRadius(output: number): number {
  if (output <= 0) return 1.5;
  return 2.5 + 9.5 * Math.pow(output / 1_500_000, 0.42);
}

// ── main renderer ─────────────────────────────────────────────────────────────
function renderPixelMap(
  canvas: HTMLCanvasElement,
  towns: Town[],
  regions: Map<string, { type: string; name: string }>,
  tradeRoutes: Array<{ town_a_id: string; town_b_id: string; route_type: string; strength: number }>,
  licensedTownIds: Set<string>,
  townEventMap: Map<string, number>,
  selectedTownId: string | null,
  noise: Float32Array,
): Int16Array {
  const ctx = canvas.getContext('2d')!;
  const raw = new Uint8ClampedArray(GRID_W * GRID_H * 4);
  const ownerMap = new Int16Array(GRID_W * GRID_H).fill(-1);

  // 1. Noisy background
  for (let i = 0; i < GRID_W * GRID_H; i++) {
    const n = noise[i];
    raw[i*4]   = Math.min(255, Math.max(0, BG[0] + n));
    raw[i*4+1] = Math.min(255, Math.max(0, BG[1] + n));
    raw[i*4+2] = Math.min(255, Math.max(0, BG[2] + n));
    raw[i*4+3] = 255;
  }

  // 2. Trade routes (drawn under towns)
  const townIdx = new Map(towns.map((t, i) => [t.id, i]));
  for (const route of tradeRoutes) {
    const a = towns[townIdx.get(route.town_a_id) ?? -1];
    const b = towns[townIdx.get(route.town_b_id) ?? -1];
    if (!a || !b) continue;
    const [r, g, bl] = route.route_type === 'sea'   ? [30, 100, 190] as RGB
                     : route.route_type === 'river' ? [40, 120,  70] as RGB
                     : [110, 80, 40] as RGB;
    const alpha = 55 + (route.strength / 10) * 55;
    drawPixelLine(raw, wx(a.x_coord), wy(a.y_coord), wx(b.x_coord), wy(b.y_coord), r, g, bl, alpha);
  }

  // 3. Precompute per-town grid info
  const infos = towns.map((t, idx) => ({
    idx,
    gx: wx(t.x_coord),
    gy: wy(t.y_coord),
    r:  economyRadius(t.economic_output),
    r2: economyRadius(t.economic_output) ** 2,
    rgb: getTownRGB(t, regions),
    id: t.id,
  }));

  // 4. Assign pixel ownership (nearest-within-radius wins)
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      let bestDist2 = Infinity;
      let bestIdx   = -1;
      for (const ti of infos) {
        const dx = gx - ti.gx, dy = gy - ti.gy;
        const d2 = dx*dx + dy*dy;
        if (d2 < ti.r2 && d2 < bestDist2) { bestDist2 = d2; bestIdx = ti.idx; }
      }
      const cell = gy * GRID_W + gx;
      ownerMap[cell] = bestIdx;
      if (bestIdx >= 0) {
        const ti  = infos[bestIdx];
        const edge = Math.sqrt(bestDist2) / ti.r;
        const s   = 1 - edge * 0.22;
        const n   = noise[cell] * 0.04;
        const [cr, cg, cb] = ti.rgb;
        raw[cell*4]   = Math.min(255, Math.max(0, cr * s + n));
        raw[cell*4+1] = Math.min(255, Math.max(0, cg * s + n));
        raw[cell*4+2] = Math.min(255, Math.max(0, cb * s + n));
      }
    }
  }

  // 5. Border highlights
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const tIdx = ownerMap[gy * GRID_W + gx];
      if (tIdx < 0) continue;
      const town = towns[tIdx];
      const isSelected = selectedTownId === town.id;
      const isLicensed = licensedTownIds.has(town.id);
      const hasEvent   = (townEventMap.get(town.id) ?? 0) > 0;
      if (!isSelected && !isLicensed && !hasEvent) continue;

      const isBorder =
        gx === 0          || ownerMap[ gy      * GRID_W + gx - 1] !== tIdx ||
        gx === GRID_W - 1 || ownerMap[ gy      * GRID_W + gx + 1] !== tIdx ||
        gy === 0          || ownerMap[(gy - 1) * GRID_W + gx    ] !== tIdx ||
        gy === GRID_H - 1 || ownerMap[(gy + 1) * GRID_W + gx    ] !== tIdx;

      if (isBorder) {
        if (isSelected)      setPixel(raw, gx, gy, 255, 225, 50);
        else if (isLicensed) setPixel(raw, gx, gy, 200, 160, 30);
        else if (hasEvent)   setPixel(raw, gx, gy, 220, 50,  30);
      }
    }
  }

  // 6. Capital white center dot
  for (const t of towns) {
    if (t.is_regional_capital) {
      setPixel(raw, wx(t.x_coord), wy(t.y_coord), 255, 255, 255);
    }
  }

  ctx.putImageData(new ImageData(raw, GRID_W, GRID_H), 0, 0);
  return ownerMap;
}

function wx(x: number): number { return Math.round((x / 100) * GRID_W); }
function wy(y: number): number { return Math.round((y / 100) * GRID_H); }

// ── component ─────────────────────────────────────────────────────────────────
interface Tooltip { townId: string; relX: number; relY: number }

export default function WorldMapPage() {
  const router = useRouter();
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const ownerRef   = useRef<Int16Array | null>(null);
  const noiseRef   = useRef<Float32Array | null>(null);

  const clockTick   = useWorldStore(s => s.clock?.current_tick ?? 0);
  const regions     = useWorldStore(s => s.regions);
  const tradeRoutes = useWorldStore(s => s.tradeRoutes);
  const licenses    = usePlayerStore(s => s.licenses);

  const licensedTownIds = useMemo(() => new Set(licenses.map(l => l.town_id)), [licenses]);

  const [tooltip,        setTooltip]  = useState<Tooltip | null>(null);
  const [selectedTownId, setSelected] = useState<string | null>(null);

  const towns    = Array.from(useWorldStore.getState().towns.values());
  const townById = new Map(towns.map(t => [t.id, t]));
  const selectedTown = selectedTownId ? townById.get(selectedTownId) : null;

  // Lazy noise init (stable across renders)
  if (!noiseRef.current) {
    const n = new Float32Array(GRID_W * GRID_H);
    for (let i = 0; i < n.length; i++) n[i] = (Math.random() - 0.5) * 18;
    noiseRef.current = n;
  }

  // ── canvas render ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !noiseRef.current) return;
    const { towns: townsMap, events } = useWorldStore.getState();
    const towns = Array.from(townsMap.values());
    if (!towns.length) return;

    const townEventMap = new Map<string, number>();
    for (const ev of events.values()) {
      if (ev.ticks_remaining > 0) townEventMap.set(ev.town_id, (townEventMap.get(ev.town_id) ?? 0) + 1);
    }

    ownerRef.current = renderPixelMap(
      canvas, towns, regions, tradeRoutes,
      licensedTownIds, townEventMap, selectedTownId, noiseRef.current,
    );
  }, [clockTick, regions, tradeRoutes, licensedTownIds, selectedTownId]);

  // ── canvas interaction ─────────────────────────────────────────────────────
  const canvasToGrid = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const gx = Math.floor((e.clientX - rect.left) / rect.width  * GRID_W);
    const gy = Math.floor((e.clientY - rect.top)  / rect.height * GRID_H);
    return { gx, gy, relX: e.clientX - rect.left, relY: e.clientY - rect.top };
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!ownerRef.current) return;
    const { gx, gy } = canvasToGrid(e);
    if (gx < 0 || gx >= GRID_W || gy < 0 || gy >= GRID_H) return;
    const tIdx = ownerRef.current[gy * GRID_W + gx];
    if (tIdx >= 0) {
      const town = Array.from(useWorldStore.getState().towns.values())[tIdx];
      if (!town) return;
      setSelected(prev => prev === town.id ? null : town.id);
    } else {
      setSelected(null);
    }
    setTooltip(null);
  };

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (selectedTownId || !ownerRef.current) { setTooltip(null); return; }
    const { gx, gy, relX, relY } = canvasToGrid(e);
    if (gx < 0 || gx >= GRID_W || gy < 0 || gy >= GRID_H) { setTooltip(null); return; }
    const tIdx = ownerRef.current[gy * GRID_W + gx];
    if (tIdx >= 0) {
      const allTowns = Array.from(useWorldStore.getState().towns.values());
      const town = allTowns[tIdx];
      if (town) setTooltip({ townId: town.id, relX, relY });
    } else {
      setTooltip(null);
    }
  }, [selectedTownId]);

  // ── town label positions (for capital names) ───────────────────────────────
  const capitalLabels = useMemo(() =>
    Array.from(useWorldStore.getState().towns.values())
      .filter(t => t.is_regional_capital)
      .map(t => ({
        id: t.id,
        name: t.name,
        xPct: (wx(t.x_coord) + 2) / GRID_W * 100,
        yPct: wy(t.y_coord) / GRID_H * 100,
      })),
  [clockTick]);

  return (
    <div className="h-full flex overflow-hidden" style={{ background: '#f5e8c8' }}>

      {/* ── MAP AREA ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* top bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-parch-300 flex-wrap">
          <span className="text-gold-400 font-bold text-sm tracking-wide">VALDRIS — WORLD MAP</span>
          <span className="text-ink-700 text-xs">|</span>
          <span className="text-xs text-ink-700">Click a town to inspect · Gold border = licensed · Red = active event</span>
        </div>

        {/* pixel canvas */}
        <div className="flex-1 relative overflow-hidden" style={{ background: '#c8b880' }}>
          <canvas
            ref={canvasRef}
            width={GRID_W}
            height={GRID_H}
            onClick={handleCanvasClick}
            onMouseMove={handleCanvasMouseMove}
            onMouseLeave={() => setTooltip(null)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              imageRendering: 'pixelated',
              cursor: 'crosshair',
              display: 'block',
            }}
          />

          {/* capital name labels */}
          {capitalLabels.map(lbl => (
            <div
              key={lbl.id}
              className="absolute pointer-events-none"
              style={{ left: `${lbl.xPct}%`, top: `${lbl.yPct}%`, transform: 'translateY(-50%)' }}
            >
              <span
                className="text-[9px] font-bold leading-none whitespace-nowrap"
                style={{ color: '#1a0a00', textShadow: '0 0 2px #f5e8c8, 0 0 2px #f5e8c8' }}
              >
                {lbl.name}
              </span>
            </div>
          ))}

          {/* tooltip */}
          {tooltip && !selectedTownId && (() => {
            const t = townById.get(tooltip.townId);
            if (!t) return null;
            const region = regions.get(t.region_id);
            return (
              <div
                className="absolute z-20 pointer-events-none"
                style={{ left: tooltip.relX + 14, top: tooltip.relY - 10 }}
              >
                <div className="bg-parch-50 border border-parch-300 rounded-lg shadow-lg p-3 text-xs min-w-36">
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
                  {Array.from(useWorldStore.getState().events.values()).some(
                    ev => ev.town_id === t.id && ev.ticks_remaining > 0
                  ) && (
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
          {Object.entries(REGION_RGB).map(([type, rgb]) => (
            <span key={type} className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` }} />
              {type.replace(/-/g, ' ')}
            </span>
          ))}
          <span className="ml-auto">Gold border = licensed · Red border = event · Size = economic output · ◦ = capital</span>
        </div>
      </div>

      {/* ── SIDE PANEL ───────────────────────────────────────────────── */}
      {selectedTown && (
        <div className="w-72 border-l border-parch-300 flex flex-col overflow-y-auto" style={{ background: '#f0e0b0' }}>
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

          {/* license status */}
          <div className="p-4">
            {licensedTownIds.has(selectedTown.id) ? (
              <p className="text-safe-400 text-xs font-semibold">✓ You hold a banking license here</p>
            ) : (
              <>
                <p className="text-ink-700 text-xs mb-2">No banking license in {selectedTown.name}.</p>
                <button onClick={() => router.push('/licenses')} className="text-xs text-gold-400 hover:underline">
                  Manage licenses →
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
