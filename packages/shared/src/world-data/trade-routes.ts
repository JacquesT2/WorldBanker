import type { TradeRoute } from '../types/world.js';

/**
 * ~80 trade routes connecting towns across Valdris.
 * Routes follow geographic logic:
 *   - Sea routes: coastal/island towns connected by sea
 *   - River routes: towns in delta/marsh connected along river networks
 *   - Land routes: all other connections by road or mountain pass
 * Strength 1–10: higher = more trade volume and faster economic propagation.
 */
export const TRADE_ROUTES: Omit<TradeRoute, 'id'>[] = [

  // ─── INTRA-REGION: Aurean Coast ──────────────────────────────────────────
  { town_a_id: 'town_aurea',     town_b_id: 'town_portmere',   strength: 9, route_type: 'sea' },
  { town_a_id: 'town_aurea',     town_b_id: 'town_harwick',    strength: 7, route_type: 'sea' },
  { town_a_id: 'town_aurea',     town_b_id: 'town_tidehaven',  strength: 8, route_type: 'sea' },
  { town_a_id: 'town_aurea',     town_b_id: 'town_vestmark',   strength: 6, route_type: 'sea' },
  { town_a_id: 'town_harwick',   town_b_id: 'town_saltcliff',  strength: 6, route_type: 'sea' },
  { town_a_id: 'town_tidehaven', town_b_id: 'town_vestmark',   strength: 7, route_type: 'sea' },

  // ─── INTRA-REGION: Valdris Delta ────────────────────────────────────────
  { town_a_id: 'town_ferrath',       town_b_id: 'town_millhaven',     strength: 8, route_type: 'river' },
  { town_a_id: 'town_ferrath',       town_b_id: 'town_harvest_cross', strength: 8, route_type: 'river' },
  { town_a_id: 'town_ferrath',       town_b_id: 'town_rivenmoor',     strength: 7, route_type: 'river' },
  { town_a_id: 'town_millhaven',     town_b_id: 'town_greenford',     strength: 6, route_type: 'river' },
  { town_a_id: 'town_millhaven',     town_b_id: 'town_longmeadow',    strength: 5, route_type: 'river' },
  { town_a_id: 'town_harvest_cross', town_b_id: 'town_rivenmoor',     strength: 6, route_type: 'river' },

  // ─── INTRA-REGION: Ironspine Mountains ──────────────────────────────────
  { town_a_id: 'town_skarhold',    town_b_id: 'town_coppergate',  strength: 7, route_type: 'land' },
  { town_a_id: 'town_skarhold',    town_b_id: 'town_anvil_pass',  strength: 8, route_type: 'land' },
  { town_a_id: 'town_skarhold',    town_b_id: 'town_forge_hollow', strength: 6, route_type: 'land' },
  { town_a_id: 'town_coppergate',  town_b_id: 'town_deepvein',    strength: 5, route_type: 'land' },
  { town_a_id: 'town_anvil_pass',  town_b_id: 'town_stonemarsh',  strength: 5, route_type: 'land' },
  { town_a_id: 'town_forge_hollow', town_b_id: 'town_stonemarsh', strength: 5, route_type: 'land' },

  // ─── INTRA-REGION: Thornwood ────────────────────────────────────────────
  { town_a_id: 'town_sylvenmere', town_b_id: 'town_ashpine',  strength: 7, route_type: 'river' },
  { town_a_id: 'town_sylvenmere', town_b_id: 'town_logrun',   strength: 7, route_type: 'river' },
  { town_a_id: 'town_sylvenmere', town_b_id: 'town_barkwood', strength: 6, route_type: 'land' },
  { town_a_id: 'town_ashpine',    town_b_id: 'town_furrow',   strength: 5, route_type: 'land' },
  { town_a_id: 'town_ashpine',    town_b_id: 'town_wyldend',  strength: 4, route_type: 'land' },
  { town_a_id: 'town_logrun',     town_b_id: 'town_barkwood', strength: 5, route_type: 'land' },

  // ─── INTRA-REGION: Dustplains ────────────────────────────────────────────
  { town_a_id: 'town_yarim',          town_b_id: 'town_grassend',       strength: 7, route_type: 'land' },
  { town_a_id: 'town_yarim',          town_b_id: 'town_dustford',       strength: 7, route_type: 'land' },
  { town_a_id: 'town_yarim',          town_b_id: 'town_thornherd',      strength: 6, route_type: 'land' },
  { town_a_id: 'town_grassend',       town_b_id: 'town_stallion_reach', strength: 6, route_type: 'land' },
  { town_a_id: 'town_dustford',       town_b_id: 'town_drifter_post',   strength: 4, route_type: 'land' },
  { town_a_id: 'town_stallion_reach', town_b_id: 'town_drifter_post',   strength: 4, route_type: 'land' },

  // ─── INTRA-REGION: Caldera Reach ────────────────────────────────────────
  { town_a_id: 'town_ashgate',      town_b_id: 'town_cinderveil',   strength: 6, route_type: 'land' },
  { town_a_id: 'town_ashgate',      town_b_id: 'town_furnace_gate', strength: 7, route_type: 'land' },
  { town_a_id: 'town_ashgate',      town_b_id: 'town_hearthstone',  strength: 6, route_type: 'land' },
  { town_a_id: 'town_cinderveil',   town_b_id: 'town_magmahold',    strength: 4, route_type: 'land' },
  { town_a_id: 'town_furnace_gate', town_b_id: 'town_sulfur_cross', strength: 4, route_type: 'land' },
  { town_a_id: 'town_hearthstone',  town_b_id: 'town_furnace_gate', strength: 5, route_type: 'land' },

  // ─── INTRA-REGION: Shattered Isles ──────────────────────────────────────
  { town_a_id: 'town_corsair_haven', town_b_id: 'town_spice_harbor',  strength: 8, route_type: 'sea' },
  { town_a_id: 'town_corsair_haven', town_b_id: 'town_deepchannel',   strength: 7, route_type: 'sea' },
  { town_a_id: 'town_corsair_haven', town_b_id: 'town_pearl_rock',    strength: 7, route_type: 'sea' },
  { town_a_id: 'town_spice_harbor',  town_b_id: 'town_shallowmere',   strength: 6, route_type: 'sea' },
  { town_a_id: 'town_pearl_rock',    town_b_id: 'town_wave_break',    strength: 5, route_type: 'sea' },
  { town_a_id: 'town_shallowmere',   town_b_id: 'town_wave_break',    strength: 5, route_type: 'sea' },

  // ─── INTRA-REGION: Midmark ───────────────────────────────────────────────
  { town_a_id: 'town_midmark_city', town_b_id: 'town_waygate',       strength: 9, route_type: 'land' },
  { town_a_id: 'town_midmark_city', town_b_id: 'town_crosshaven',    strength: 8, route_type: 'land' },
  { town_a_id: 'town_midmark_city', town_b_id: 'town_junction',      strength: 8, route_type: 'land' },
  { town_a_id: 'town_midmark_city', town_b_id: 'town_tradefort',     strength: 7, route_type: 'land' },
  { town_a_id: 'town_midmark_city', town_b_id: 'town_halting_green', strength: 7, route_type: 'land' },
  { town_a_id: 'town_waygate',      town_b_id: 'town_tradefort',     strength: 7, route_type: 'land' },

  // ─── INTRA-REGION: Saltmarsh ─────────────────────────────────────────────
  { town_a_id: 'town_brineholt',   town_b_id: 'town_bogside',      strength: 6, route_type: 'river' },
  { town_a_id: 'town_brineholt',   town_b_id: 'town_salt_landing', strength: 7, route_type: 'river' },
  { town_a_id: 'town_brineholt',   town_b_id: 'town_reedhaven',    strength: 5, route_type: 'river' },
  { town_a_id: 'town_salt_landing', town_b_id: 'town_brack',       strength: 6, route_type: 'sea' },
  { town_a_id: 'town_bogside',      town_b_id: 'town_reedhaven',   strength: 4, route_type: 'river' },
  { town_a_id: 'town_reedhaven',    town_b_id: 'town_mudwater',    strength: 4, route_type: 'river' },

  // ─── INTRA-REGION: Greyhaven Plateau ────────────────────────────────────
  { town_a_id: 'town_greystone',     town_b_id: 'town_shepherd_vale',  strength: 7, route_type: 'land' },
  { town_a_id: 'town_greystone',     town_b_id: 'town_coldvale',       strength: 7, route_type: 'land' },
  { town_a_id: 'town_greystone',     town_b_id: 'town_monastic_hill',  strength: 6, route_type: 'land' },
  { town_a_id: 'town_shepherd_vale', town_b_id: 'town_quarry_ridge',   strength: 5, route_type: 'land' },
  { town_a_id: 'town_coldvale',      town_b_id: 'town_monastic_hill',  strength: 5, route_type: 'land' },
  { town_a_id: 'town_quarry_ridge',  town_b_id: 'town_highpass',       strength: 5, route_type: 'land' },

  // ─── INTER-REGION: Critical trade arteries ──────────────────────────────

  // Aurean Coast ↔ Saltmarsh (coastal shipping)
  { town_a_id: 'town_vestmark',   town_b_id: 'town_brack',        strength: 6, route_type: 'sea' },
  { town_a_id: 'town_saltcliff',  town_b_id: 'town_salt_landing', strength: 5, route_type: 'sea' },

  // Aurean Coast ↔ Shattered Isles (island supply chain)
  { town_a_id: 'town_aurea',           town_b_id: 'town_corsair_haven', strength: 7, route_type: 'sea' },
  { town_a_id: 'town_tidehaven',       town_b_id: 'town_deepchannel',   strength: 5, route_type: 'sea' },

  // Aurean Coast ↔ Thornwood (timber for shipbuilding)
  { town_a_id: 'town_aurea',     town_b_id: 'town_sylvenmere', strength: 6, route_type: 'land' },

  // Aurean Coast ↔ Midmark (goods distribution)
  { town_a_id: 'town_aurea',       town_b_id: 'town_crosshaven',    strength: 7, route_type: 'land' },
  { town_a_id: 'town_tidehaven',   town_b_id: 'town_halting_green', strength: 5, route_type: 'land' },

  // Valdris Delta ↔ Midmark (grain to market)
  { town_a_id: 'town_ferrath',       town_b_id: 'town_midmark_city',  strength: 8, route_type: 'land' },
  { town_a_id: 'town_harvest_cross', town_b_id: 'town_crosshaven',    strength: 6, route_type: 'land' },

  // Valdris Delta ↔ Saltmarsh (river delta merges)
  { town_a_id: 'town_millhaven',   town_b_id: 'town_brineholt',  strength: 5, route_type: 'river' },
  { town_a_id: 'town_greenford',   town_b_id: 'town_reedhaven',  strength: 4, route_type: 'river' },

  // Ironspine Mountains ↔ Midmark (ore to markets)
  { town_a_id: 'town_skarhold',    town_b_id: 'town_midmark_city', strength: 7, route_type: 'land' },
  { town_a_id: 'town_anvil_pass',  town_b_id: 'town_halting_green', strength: 5, route_type: 'land' },

  // Ironspine Mountains ↔ Thornwood (ore + timber exchange)
  { town_a_id: 'town_coppergate', town_b_id: 'town_sylvenmere', strength: 5, route_type: 'land' },

  // Ironspine Mountains ↔ Valdris Delta (ore for food)
  { town_a_id: 'town_stonemarsh', town_b_id: 'town_harvest_cross', strength: 5, route_type: 'land' },

  // Thornwood ↔ Midmark (timber supply)
  { town_a_id: 'town_logrun',     town_b_id: 'town_halting_green', strength: 5, route_type: 'land' },

  // Midmark ↔ Dustplains (goods for horses/livestock)
  { town_a_id: 'town_midmark_city', town_b_id: 'town_yarim',        strength: 7, route_type: 'land' },
  { town_a_id: 'town_tradefort',    town_b_id: 'town_thornherd',    strength: 5, route_type: 'land' },

  // Midmark ↔ Caldera Reach (luxury minerals inbound)
  { town_a_id: 'town_waygate',      town_b_id: 'town_ashgate',      strength: 5, route_type: 'land' },

  // Midmark ↔ Greyhaven (stone and wool to market)
  { town_a_id: 'town_junction',     town_b_id: 'town_greystone',    strength: 6, route_type: 'land' },

  // Dustplains ↔ Caldera Reach (eastern corridor)
  { town_a_id: 'town_grassend',  town_b_id: 'town_furnace_gate', strength: 4, route_type: 'land' },

  // Dustplains ↔ Greyhaven (plateau border)
  { town_a_id: 'town_dustford',  town_b_id: 'town_greystone',     strength: 5, route_type: 'land' },
  { town_a_id: 'town_thornherd', town_b_id: 'town_coldvale',      strength: 4, route_type: 'land' },

  // Greyhaven ↔ Saltmarsh (plateau goods to coast)
  { town_a_id: 'town_coldvale', town_b_id: 'town_brineholt', strength: 4, route_type: 'land' },

  // Saltmarsh ↔ Shattered Isles (salt trade)
  { town_a_id: 'town_brineholt',   town_b_id: 'town_corsair_haven', strength: 5, route_type: 'sea' },
  { town_a_id: 'town_salt_landing', town_b_id: 'town_deepchannel',  strength: 4, route_type: 'sea' },
];
