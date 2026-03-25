import { v4 as uuidv4 } from 'uuid';
import type { WorldState } from '../state/world-state';
import type { WorldEvent, EventType, RiskFactor } from '@argentum/shared';
import {
  BASE_EVENT_PROBABILITY_PER_TICK,
  EVENT_REGIONAL_COOLDOWN_TICKS,
} from '@argentum/shared';

// Which events can occur in which risk factor context
const RISK_TO_EVENTS: Partial<Record<RiskFactor, EventType[]>> = {
  flood_prone:           ['flood'],
  drought_prone:         ['drought'],
  piracy_risk:           ['pirate_attack'],
  bandit_raids:          ['bandit_raid'],
  volcanic_activity:     ['volcanic_eruption'],
  earthquake_risk:       ['earthquake'],
  fire_risk:             ['forest_fire'],
  plague_risk:           ['plague'],
  political_instability: ['political_crisis'],
  storm_risk:            ['storm'],
};

// Events that can happen anywhere (positive events)
const UNIVERSAL_EVENTS: EventType[] = ['good_harvest', 'poor_harvest', 'trade_boom', 'migration_wave'];

// Event effects by type
interface EventTemplate {
  duration_ticks: number;
  economic_output_modifier: number;
  population_modifier: number;
  loan_default_modifier: number;
  descriptions: string[];
}

const EVENT_TEMPLATES: Record<EventType, EventTemplate> = {
  flood: {
    duration_ticks: 36,
    economic_output_modifier: 0.65,
    population_modifier: 0.97,
    loan_default_modifier: 1.8,
    descriptions: ['Rising waters have flooded farmland and damaged the granary.', 'The river burst its banks, destroying crops and disrupting river trade.'],
  },
  drought: {
    duration_ticks: 54,
    economic_output_modifier: 0.70,
    population_modifier: 0.96,
    loan_default_modifier: 2.0,
    descriptions: ['A prolonged drought has withered the harvest. Water prices soar.', 'Without rain, the wells run low and the fields dry up.'],
  },
  plague: {
    duration_ticks: 45,
    economic_output_modifier: 0.75,
    population_modifier: 0.92,
    loan_default_modifier: 1.6,
    descriptions: ['A sweating sickness has taken hold, emptying workshops and markets.', 'Plague spreads along the trade routes. A third of the labor force is ill.'],
  },
  bandit_raid: {
    duration_ticks: 12,
    economic_output_modifier: 0.80,
    population_modifier: 0.99,
    loan_default_modifier: 1.4,
    descriptions: ['Raiders from the steppe have attacked a merchant convoy.', 'Bandits attacked the town outskirts, burning a warehouse.'],
  },
  volcanic_eruption: {
    duration_ticks: 60,
    economic_output_modifier: 0.50,
    population_modifier: 0.90,
    loan_default_modifier: 2.5,
    descriptions: ['The volcano erupted overnight. Ash blankets the region.', 'A fissure opened near the mining tunnels. Production has halted.'],
  },
  earthquake: {
    duration_ticks: 18,
    economic_output_modifier: 0.60,
    population_modifier: 0.95,
    loan_default_modifier: 2.0,
    descriptions: ['A powerful earthquake collapsed several buildings and blocked the mountain road.', 'The earth shook for minutes. The walls cracked and the port is partially blocked.'],
  },
  trade_boom: {
    duration_ticks: 30,
    economic_output_modifier: 1.20,
    population_modifier: 1.01,
    loan_default_modifier: 0.7,
    descriptions: ['A surge of merchant activity — exotic goods are flowing in and demand for capital is high.', 'Word of new markets abroad has spurred a flurry of local investment.'],
  },
  pirate_attack: {
    duration_ticks: 20,
    economic_output_modifier: 0.78,
    population_modifier: 0.99,
    loan_default_modifier: 1.5,
    descriptions: ['Pirates blockade the harbor. Trade ships are diverting around the coast.', 'A pirate fleet raided the docks. Several merchant vessels were seized.'],
  },
  storm: {
    duration_ticks: 10,
    economic_output_modifier: 0.72,
    population_modifier: 0.99,
    loan_default_modifier: 1.4,
    descriptions: ['A violent storm lashed the harbor, sinking two ships.', 'High seas forced the closure of the port for three days.'],
  },
  forest_fire: {
    duration_ticks: 24,
    economic_output_modifier: 0.68,
    population_modifier: 0.97,
    loan_default_modifier: 1.7,
    descriptions: ['Fire consumed a large section of the forest. Timber output has plummeted.', 'A wildfire burned through the logging camps, destroying stockpiles.'],
  },
  good_harvest: {
    duration_ticks: 20,
    economic_output_modifier: 1.15,
    population_modifier: 1.02,
    loan_default_modifier: 0.75,
    descriptions: ['An exceptionally good harvest fills the granaries and boosts local confidence.', 'Bumper crops this season. Surplus grain is flowing to neighboring regions.'],
  },
  poor_harvest: {
    duration_ticks: 25,
    economic_output_modifier: 0.82,
    population_modifier: 0.98,
    loan_default_modifier: 1.4,
    descriptions: ['A poor growing season has thinned the harvest and raised food prices.', 'Late frost damaged the crops. Grain must be imported at high cost.'],
  },
  resource_discovery: {
    duration_ticks: 60,
    economic_output_modifier: 1.25,
    population_modifier: 1.03,
    loan_default_modifier: 0.65,
    descriptions: ['A new mineral vein has been discovered, triggering a rush of investment.', 'Prospectors found rich deposits nearby. The town is buzzing with opportunity.'],
  },
  political_crisis: {
    duration_ticks: 40,
    economic_output_modifier: 0.85,
    population_modifier: 0.99,
    loan_default_modifier: 1.3,
    descriptions: ['A dispute over trade taxes has paralyzed the town council.', 'Political upheaval has disrupted the guild agreements that keep commerce flowing.'],
  },
  migration_wave: {
    duration_ticks: 20,
    economic_output_modifier: 1.05,
    population_modifier: 1.05,
    loan_default_modifier: 0.9,
    descriptions: ['A wave of migrants from a troubled region is swelling the town population.', 'Refugees from the drought-stricken east are arriving, boosting labor supply.'],
  },
};

/**
 * Step 2: Roll for stochastic world events.
 * Events are geographically correlated with risk factors.
 * Regional cooldowns prevent the same disaster hitting too frequently.
 */
export function rollWorldEvents(state: WorldState): WorldEvent[] {
  const newEvents: WorldEvent[] = [];
  const tick = state.clock.current_tick;

  for (const town of state.towns.values()) {
    const region = state.getRegionForTown(town.id);
    if (!region) continue;

    // Build list of eligible events for this town
    const eligibleEvents: EventType[] = [...UNIVERSAL_EVENTS];
    for (const riskFactor of town.risk_factors) {
      const events = RISK_TO_EVENTS[riskFactor] ?? [];
      eligibleEvents.push(...events);
    }

    for (const eventType of eligibleEvents) {
      // Check regional cooldown
      const lastTick = state.eventCooldowns[region.id]?.[eventType] ?? 0;
      if (tick - lastTick < EVENT_REGIONAL_COOLDOWN_TICKS) continue;

      // Already have this event active in this town?
      const alreadyActive = Array.from(state.events.values()).some(
        e => e.town_id === town.id && e.event_type === eventType && e.ticks_remaining > 0
      );
      if (alreadyActive) continue;

      // Roll the dice
      const probability = BASE_EVENT_PROBABILITY_PER_TICK * region.base_risk_modifier;
      if (Math.random() >= probability) continue;

      // Create the event
      const template = EVENT_TEMPLATES[eventType];
      const severity = 0.4 + Math.random() * 0.6;
      const durationScale = 0.7 + Math.random() * 0.6;
      const duration = Math.round(template.duration_ticks * durationScale);

      const outputMod = severity < 0.5
        ? 1.0 + (template.economic_output_modifier - 1.0) * severity * 2
        : template.economic_output_modifier;

      const description = template.descriptions[
        Math.floor(Math.random() * template.descriptions.length)
      ]!;

      const event: WorldEvent = {
        id: uuidv4(),
        world_id: state.worldId,
        event_type: eventType,
        town_id: town.id,
        severity,
        duration_ticks: duration,
        ticks_remaining: duration,
        economic_output_modifier: parseFloat(outputMod.toFixed(3)),
        population_modifier: template.population_modifier,
        loan_default_modifier: template.loan_default_modifier,
        description,
        occurred_at_tick: tick,
      };

      state.events.set(event.id, event);
      newEvents.push(event);

      // Set cooldown
      if (!state.eventCooldowns[region.id]) {
        state.eventCooldowns[region.id] = {};
      }
      state.eventCooldowns[region.id]![eventType] = tick;

      console.log(`[events] ${eventType} at ${town.name} (severity: ${severity.toFixed(2)})`);
    }

    // Decrement ticks_remaining for all active events in this town
    for (const event of state.events.values()) {
      if (event.town_id === town.id && event.ticks_remaining > 0) {
        event.ticks_remaining -= 1;
      }
    }
  }

  return newEvents;
}
