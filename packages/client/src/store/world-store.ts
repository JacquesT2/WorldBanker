'use client';
import { create } from 'zustand';
import type { Town, Region, WorldEvent, WorldClock, TradeRoute } from '@argentum/shared';
import type { TickDelta } from '@argentum/shared';

interface WorldStore {
  // Data
  towns: Map<string, Town>;
  regions: Map<string, Region>;
  events: Map<string, WorldEvent>;
  clock: WorldClock | null;
  tradeRoutes: TradeRoute[];
  isLoaded: boolean;

  // Actions
  hydrate: (data: {
    towns: Town[];
    regions: Region[];
    events: WorldEvent[];
    clock: WorldClock;
  }) => void;
  applyDelta: (delta: TickDelta) => void;
  getTown: (id: string) => Town | undefined;
  getRegion: (id: string) => Region | undefined;
  getActiveEventsForTown: (townId: string) => WorldEvent[];
}

export const useWorldStore = create<WorldStore>((set, get) => ({
  towns: new Map(),
  regions: new Map(),
  events: new Map(),
  clock: null,
  tradeRoutes: [],
  isLoaded: false,

  hydrate: ({ towns, regions, events, clock }) => {
    set({
      towns: new Map(towns.map(t => [t.id, t])),
      regions: new Map(regions.map(r => [r.id, r])),
      events: new Map(events.map(e => [e.id, e])),
      clock,
      isLoaded: true,
    });
  },

  applyDelta: (delta) => {
    set(state => {
      const newTowns = new Map(state.towns);
      const newEvents = new Map(state.events);

      // Apply town updates
      for (const update of delta.town_updates) {
        const town = newTowns.get(update.town_id);
        if (town) {
          newTowns.set(update.town_id, {
            ...town,
            population: update.population,
            economic_output: update.economic_output,
          });
        }
      }

      // Add new events
      for (const event of delta.new_events) {
        newEvents.set(event.id, event);
      }

      // Remove resolved events
      for (const id of delta.resolved_event_ids) {
        newEvents.delete(id);
      }

      // Update existing events' ticks_remaining
      for (const event of newEvents.values()) {
        if (event.ticks_remaining > 0) {
          newEvents.set(event.id, { ...event, ticks_remaining: event.ticks_remaining - 1 });
        }
      }

      return {
        towns: newTowns,
        events: newEvents,
        clock: delta.clock,
      };
    });
  },

  getTown: (id) => get().towns.get(id),
  getRegion: (id) => get().regions.get(id),
  getActiveEventsForTown: (townId) =>
    Array.from(get().events.values()).filter(e => e.town_id === townId && e.ticks_remaining > 0),
}));
