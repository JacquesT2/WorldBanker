import { pool } from '../pool';
import { REGIONS } from '@argentum/shared';
import { TOWNS } from '@argentum/shared';
import { TRADE_ROUTES } from '@argentum/shared';
import { v4 as uuidv4 } from 'uuid';

async function seed(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if world already exists
    const { rows: existing } = await client.query(
      "SELECT id FROM worlds WHERE is_active = true LIMIT 1"
    );
    if (existing.length > 0) {
      console.log(`[seed] Active world already exists (id: ${existing[0].id}). Skipping.`);
      await client.query('ROLLBACK');
      return;
    }

    // Create world
    const worldId = uuidv4();
    await client.query(
      "INSERT INTO worlds (id, name) VALUES ($1, 'Valdris')",
      [worldId]
    );
    console.log(`[seed] Created world: Valdris (${worldId})`);

    // Insert regions (without capital_town_id first — deferred FK)
    for (const region of REGIONS) {
      await client.query(
        `INSERT INTO regions
           (id, world_id, name, type, culture, base_risk_modifier, base_trade_modifier, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [region.id, worldId, region.name, region.type, region.culture,
         region.base_risk_modifier, region.base_trade_modifier, region.description]
      );
    }
    console.log(`[seed] Inserted ${REGIONS.length} regions`);

    // Insert towns
    for (const town of TOWNS) {
      const s = town.sectors;
      const output = town.population * town.wealth_per_capita *
        (1 + s.military * 0.01 + s.heavy_industry * 0.05 + s.construction * 0.04 +
             s.commerce * 0.06 + s.maritime * 0.07 + s.agriculture * 0.04);

      await client.query(
        `INSERT INTO towns
           (id, world_id, region_id, name, population, wealth_per_capita, economic_output,
            resources,
            sector_military, sector_heavy_industry, sector_construction,
            sector_commerce, sector_maritime, sector_agriculture,
            risk_factors, is_regional_capital, x_coord, y_coord)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          town.id, worldId, town.region_id, town.name,
          town.population, town.wealth_per_capita, output,
          town.resources,
          s.military, s.heavy_industry, s.construction,
          s.commerce, s.maritime, s.agriculture,
          town.risk_factors, town.is_regional_capital, town.x_coord, town.y_coord,
        ]
      );
    }
    console.log(`[seed] Inserted ${TOWNS.length} towns`);

    // Update region capital_town_ids now that towns exist
    for (const region of REGIONS) {
      await client.query(
        'UPDATE regions SET capital_town_id = $1 WHERE id = $2',
        [region.capital_town_id, region.id]
      );
    }
    console.log('[seed] Updated region capitals');

    // Insert trade routes
    for (const route of TRADE_ROUTES) {
      await client.query(
        `INSERT INTO trade_routes (id, world_id, town_a_id, town_b_id, strength, route_type)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [uuidv4(), worldId, route.town_a_id, route.town_b_id, route.strength, route.route_type]
      );
    }
    console.log(`[seed] Inserted ${TRADE_ROUTES.length} trade routes`);

    // Initialize world clock
    await client.query(
      `INSERT INTO world_clock (world_id, current_tick, current_day, current_season, current_year)
       VALUES ($1, 0, 1, 'spring', 1)`,
      [worldId]
    );

    // Initialize economic cycle
    await client.query(
      `INSERT INTO economic_cycle (world_id, phase, phase_tick_start, phase_duration, multiplier)
       VALUES ($1, 'normal', 0, 90, 1.0)`,
      [worldId]
    );

    await client.query('COMMIT');
    console.log(`[seed] World "Valdris" seeded successfully!`);
    console.log(`  World ID: ${worldId}`);
    console.log(`  ${REGIONS.length} regions, ${TOWNS.length} towns, ${TRADE_ROUTES.length} trade routes`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error('[seed] Error:', err.message);
  process.exit(1);
});
