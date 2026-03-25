'use client';
import { useRouter } from 'next/navigation';
import { useWorldStore } from '../../../store/world-store';
import { usePlayerStore } from '../../../store/player-store';

const REGION_COLORS: Record<string, string> = {
  'coastal-trade-hub':    '#2196F3',
  'river-delta':          '#4CAF50',
  'mountain-mining':      '#795548',
  'forest-timber':        '#388E3C',
  'steppe-pastoral':      '#FFC107',
  'volcanic':             '#F44336',
  'island-archipelago':   '#00BCD4',
  'crossroads':           '#9C27B0',
  'marshland':            '#607D8B',
  'highland-plateau':     '#78909C',
};

export default function WorldMapPage() {
  const router = useRouter();
  const towns   = useWorldStore(s => Array.from(s.towns.values()));
  const regions = useWorldStore(s => s.regions);
  const events  = useWorldStore(s => s.events);
  const licenses = usePlayerStore(s => s.licenses);
  const licensedTownIds = new Set(licenses.map(l => l.town_id));

  // Map of townId -> active event count
  const townEventCount = new Map<string, number>();
  for (const event of events.values()) {
    if (event.ticks_remaining > 0) {
      townEventCount.set(event.town_id, (townEventCount.get(event.town_id) ?? 0) + 1);
    }
  }

  return (
    <div className="p-4 h-full flex flex-col">
      <h2 className="text-xl font-bold text-gold-400 mb-3">World Map — Valdris</h2>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4 text-xs">
        {Object.entries(REGION_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-parch-200">{type.replace(/-/g, ' ')}</span>
          </div>
        ))}
      </div>

      {/* SVG Map */}
      <div className="flex-1 bg-ink-700 border border-gold-600 rounded-lg overflow-hidden">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Background */}
          <rect width="100" height="100" fill="#1a0e07" />

          {/* Town nodes */}
          {towns.map(town => {
            const region = regions.get(town.region_id);
            const color  = region ? REGION_COLORS[region.type] ?? '#888' : '#888';
            const hasEvents = (townEventCount.get(town.id) ?? 0) > 0;
            const isLicensed = licensedTownIds.has(town.id);
            const radius = town.is_regional_capital ? 1.8 : 1.0;

            return (
              <g key={town.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/town/${town.id}`)}>
                {/* Event indicator ring */}
                {hasEvents && (
                  <circle
                    cx={town.x_coord}
                    cy={town.y_coord}
                    r={radius + 1.2}
                    fill="none"
                    stroke="#e85d4a"
                    strokeWidth="0.5"
                    opacity="0.8"
                  />
                )}

                {/* Your license ring */}
                {isLicensed && (
                  <circle
                    cx={town.x_coord}
                    cy={town.y_coord}
                    r={radius + 0.7}
                    fill="none"
                    stroke="#d4a017"
                    strokeWidth="0.4"
                  />
                )}

                {/* Town dot */}
                <circle
                  cx={town.x_coord}
                  cy={town.y_coord}
                  r={radius}
                  fill={color}
                  opacity={0.85}
                />

                {/* Capital marker */}
                {town.is_regional_capital && (
                  <circle
                    cx={town.x_coord}
                    cy={town.y_coord}
                    r={0.5}
                    fill="white"
                    opacity={0.9}
                  />
                )}

                {/* Town name (only capitals to avoid clutter) */}
                {town.is_regional_capital && (
                  <text
                    x={town.x_coord + 2}
                    y={town.y_coord + 0.5}
                    fontSize="1.8"
                    fill="#f9efce"
                    opacity={0.9}
                  >
                    {town.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <p className="text-xs text-parch-200 mt-2">
        Click any town to view details. Gold rings = your licenses. Red rings = active events.
      </p>
    </div>
  );
}
