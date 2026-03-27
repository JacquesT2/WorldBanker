'use client';
import { useWorldStore } from '../../../store/world-store';

const EVENT_ICONS: Record<string, string> = {
  flood:             '🌊',
  drought:           '☀',
  plague:            '💀',
  bandit_raid:       '⚔',
  volcanic_eruption: '🌋',
  earthquake:        '🌍',
  trade_boom:        '📈',
  pirate_attack:     '🚢',
  storm:             '⛈',
  forest_fire:       '🔥',
  good_harvest:      '🌾',
  poor_harvest:      '🌿',
  resource_discovery:'⛏',
  political_crisis:  '👑',
  migration_wave:    '👥',
};

const EVENT_COLORS: Record<string, string> = {
  flood:             'border-blue-500',
  drought:           'border-yellow-600',
  plague:            'border-purple-600',
  bandit_raid:       'border-red-600',
  volcanic_eruption: 'border-orange-600',
  earthquake:        'border-orange-500',
  trade_boom:        'border-green-600',
  pirate_attack:     'border-red-500',
  storm:             'border-blue-600',
  forest_fire:       'border-orange-500',
  good_harvest:      'border-green-500',
  poor_harvest:      'border-yellow-500',
  resource_discovery:'border-gold-400',
  political_crisis:  'border-purple-500',
  migration_wave:    'border-cyan-600',
};

export default function EventsPage() {
  const events = useWorldStore(s =>
    Array.from(s.events.values())
      .filter(e => e.ticks_remaining > 0)
      .sort((a, b) => b.occurred_at_tick - a.occurred_at_tick)
  );
  const getTown = useWorldStore(s => s.getTown);
  const getRegion = useWorldStore(s => s.getRegion);

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-gold-400 mb-4">
        World Events ({events.length} active)
      </h2>

      {events.length === 0 && (
        <div className="bg-parch-50 border border-parch-300 rounded-lg p-8 text-center text-ink-700">
          No active events. The world is calm for now.
        </div>
      )}

      <div className="space-y-3">
        {events.map(event => {
          const town   = getTown(event.town_id);
          const region = town ? getRegion(town.region_id) : undefined;
          const icon   = EVENT_ICONS[event.event_type] ?? '!';
          const borderColor = EVENT_COLORS[event.event_type] ?? 'border-parch-300';

          return (
            <div
              key={event.id}
              className={`bg-parch-50 border-l-4 ${borderColor} rounded-lg p-4`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{icon}</span>
                  <div>
                    <h3 className="font-semibold text-ink-800">
                      {event.event_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </h3>
                    <p className="text-ink-700 text-sm">
                      {town?.name ?? event.town_id}{region && `, ${region.name}`}
                    </p>
                    <p className="text-ink-800 text-sm mt-1">{event.description}</p>
                  </div>
                </div>
                <div className="text-right text-xs text-ink-700 shrink-0 ml-4">
                  <p>Severity: {(event.severity * 100).toFixed(0)}%</p>
                  <p>{event.ticks_remaining} ticks left</p>
                </div>
              </div>

              <div className="mt-2 flex gap-4 text-xs text-ink-700">
                <span>Output: ×{event.economic_output_modifier.toFixed(2)}</span>
                <span>Population: ×{event.population_modifier.toFixed(2)}</span>
                <span>Loan risk: ×{event.loan_default_modifier.toFixed(2)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
