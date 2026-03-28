/**
 * Company seeder — generates non-player companies and their assets for every town.
 *
 * Calibration:
 *   Total annual_revenue across all companies in a town ≈ population × wealth_per_capita.
 *   This matches the old sector-formula baseline so deposit generation and loan sizes
 *   remain in the same ballpark as before.
 *
 * Company mix per town is driven by the town's resource types, with traits
 * assigned to match the company type's archetypal personality.
 */

import type { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { TOWNS } from '@argentum/shared';
import type {
  CompanyType, AssetType, CompanyTraitId,
} from '@argentum/shared';
import { deriveCompanyParams } from '../../../engine/company-processor';

// ── Trait archetype per company type ─────────────────────────────────────────

const TYPE_TRAITS: Record<CompanyType, CompanyTraitId[][]> = {
  merchant_guild:      [['organised', 'well_connected', 'friendly'], ['organised', 'opportunistic', 'hierarchical']],
  noble_house:         [['hierarchical', 'conservative', 'well_connected'], ['hierarchical', 'predatory', 'loyal']],
  craft_workshop:      [['orderly', 'traditional', 'loyal'], ['orderly', 'innovative', 'flat']],
  shipping_company:    [['risk_tolerant', 'well_connected', 'aggressive'], ['risk_tolerant', 'opportunistic', 'friendly']],
  farm_estate:         [['conservative', 'traditional', 'loyal'], ['conservative', 'orderly', 'isolated']],
  mining_operation:    [['aggressive', 'hierarchical', 'risk_tolerant'], ['aggressive', 'isolated', 'orderly']],
  trade_company:       [['opportunistic', 'well_connected', 'predatory'], ['opportunistic', 'organised', 'friendly']],
  military_contractor: [['hierarchical', 'aggressive', 'loyal'], ['hierarchical', 'organised', 'conservative']],
  religious_order:     [['kind', 'traditional', 'loyal'], ['kind', 'flat', 'conservative']],
  banking_house:       [['organised', 'conservative', 'well_connected'], ['bureaucratic', 'hierarchical', 'loyal']],
};

// ── Asset templates per company type ─────────────────────────────────────────

interface AssetTemplate {
  type: AssetType;
  namePatterns: string[];
  valueRange: [number, number];
  revenueRatio: number; // fraction of company annual_revenue contributed by one of these
}

const TYPE_ASSETS: Record<CompanyType, AssetTemplate[]> = {
  merchant_guild: [
    { type: 'warehouse',    namePatterns: ['The {name} Warehouse', '{name} Storage Hall'], valueRange: [800, 2500],   revenueRatio: 0.4 },
    { type: 'market_stall', namePatterns: ['{name} Market Stall', 'The {name} Bazaar'],    valueRange: [200, 800],    revenueRatio: 0.35 },
    { type: 'tavern',       namePatterns: ['The {name} Inn', '{name} Alehouse'],            valueRange: [300, 1200],   revenueRatio: 0.25 },
  ],
  noble_house: [
    { type: 'warehouse',    namePatterns: ['{name} Estates Storehouse', 'The {name} Vault'],valueRange: [2000, 8000],  revenueRatio: 0.5 },
    { type: 'watchtower',   namePatterns: ['{name} Tower', 'The {name} Keep'],              valueRange: [5000, 15000], revenueRatio: 0.3 },
    { type: 'farm',         namePatterns: ['{name} Estate Farmlands', 'The {name} Fields'], valueRange: [1500, 5000],  revenueRatio: 0.2 },
  ],
  craft_workshop: [
    { type: 'smithy',       namePatterns: ['{name} Smithy', 'The {name} Forge'],            valueRange: [600, 2000],   revenueRatio: 0.5 },
    { type: 'tannery',      namePatterns: ['{name} Tannery', 'The {name} Leatherworks'],    valueRange: [400, 1500],   revenueRatio: 0.3 },
    { type: 'textile_mill', namePatterns: ['{name} Weavery', 'The {name} Cloth Hall'],      valueRange: [800, 2500],   revenueRatio: 0.2 },
  ],
  shipping_company: [
    { type: 'merchant_ship',namePatterns: ['The {name}', 'MV {name}'],                      valueRange: [3000, 10000], revenueRatio: 0.55 },
    { type: 'dockyard',     namePatterns: ['{name} Docks', 'The {name} Wharf'],             valueRange: [1500, 5000],  revenueRatio: 0.30 },
    { type: 'warehouse',    namePatterns: ['{name} Quay Warehouse', 'Port {name} Storage'], valueRange: [500, 2000],   revenueRatio: 0.15 },
  ],
  farm_estate: [
    { type: 'farm',         namePatterns: ['{name} Farm', 'The {name} Fields'],             valueRange: [1000, 4000],  revenueRatio: 0.5 },
    { type: 'granary',      namePatterns: ['{name} Granary', 'The {name} Barn'],            valueRange: [500, 2000],   revenueRatio: 0.3 },
    { type: 'mill',         namePatterns: ['{name} Mill', 'The {name} Watermill'],          valueRange: [700, 2500],   revenueRatio: 0.2 },
  ],
  mining_operation: [
    { type: 'mine',         namePatterns: ['{name} Mine', 'The {name} Shaft'],              valueRange: [3000, 12000], revenueRatio: 0.6 },
    { type: 'quarry',       namePatterns: ['{name} Quarry', 'The {name} Stone Pit'],        valueRange: [1000, 4000],  revenueRatio: 0.25 },
    { type: 'smithy',       namePatterns: ['{name} Processing Works', 'The {name} Smelter'],valueRange: [1500, 5000],  revenueRatio: 0.15 },
  ],
  trade_company: [
    { type: 'warehouse',    namePatterns: ['{name} Trading Post', 'The {name} Emporium'],   valueRange: [1500, 5000],  revenueRatio: 0.45 },
    { type: 'market_stall', namePatterns: ['{name} Exchange', 'The {name} Counting House'], valueRange: [500, 2000],   revenueRatio: 0.35 },
    { type: 'merchant_ship',namePatterns: ['The Trade Vessel {name}', 'Brig {name}'],       valueRange: [2000, 7000],  revenueRatio: 0.20 },
  ],
  military_contractor: [
    { type: 'watchtower',   namePatterns: ['{name} Garrison', 'Fort {name}'],               valueRange: [4000, 12000], revenueRatio: 0.55 },
    { type: 'smithy',       namePatterns: ['{name} Armoury', 'The {name} Weaponsmith'],     valueRange: [1500, 4000],  revenueRatio: 0.30 },
    { type: 'warehouse',    namePatterns: ['{name} Supply Depot', 'The {name} Stores'],     valueRange: [800, 2500],   revenueRatio: 0.15 },
  ],
  religious_order: [
    { type: 'granary',      namePatterns: ['{name} Charitable Store', 'The {name} Tithe Barn'],valueRange: [1000, 3000],revenueRatio: 0.4 },
    { type: 'farm',         namePatterns: ['{name} Order Farmstead', 'The {name} Abbey Grounds'],valueRange: [1200, 4000],revenueRatio: 0.35 },
    { type: 'tavern',       namePatterns: ['{name} Pilgrim House', 'The {name} Hospice'],   valueRange: [500, 2000],   revenueRatio: 0.25 },
  ],
  banking_house: [
    { type: 'warehouse',    namePatterns: ['{name} Vault', 'The {name} Treasury'],          valueRange: [3000, 10000], revenueRatio: 0.6 },
    { type: 'market_stall', namePatterns: ['{name} Exchange Counter', 'The {name} Counting House'],valueRange: [500, 2000],revenueRatio: 0.25 },
    { type: 'tavern',       namePatterns: ['{name} Merchants Club', 'The {name} Guild Hall'],valueRange: [1000, 3000], revenueRatio: 0.15 },
  ],
};

// ── Company name generation ────────────────────────────────────────────────

const PREFIXES = ['The', 'House of', 'Order of', 'Company of', 'Brotherhood of', 'Guild of', 'League of'];
const NOUNS = [
  'the Golden Wheel', 'the Silver Scale', 'the Iron Crown', 'the Red Pennant',
  'the Gilded Anchor', 'the Crossed Keys', 'the Salt Road', 'the Black Stone',
  'the White Hart', 'the Blue Star', 'the Amber Cup', 'the Fallen Oak',
  'the Crescent Moon', 'the Rising Sun', 'the Twin Rivers', 'the Iron Fist',
  'the Green Field', 'the Grey Wolf', 'the Crimson Tide', 'the Quiet Shore',
  'the Broken Chain', 'the Full Coffer', 'the Merchant Prince', 'the Long Road',
];
const SURNAMES = [
  'Aldric', 'Seravane', 'Corbin', 'Veldris', 'Ostan', 'Mira', 'Thalvus',
  'Brennan', 'Halwick', 'Crestmore', 'Dunvale', 'Ironside', 'Goldsworth',
  'Fairweather', 'Blackwood', 'Redstone', 'Greymark', 'Thornton', 'Ashford',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function generateCompanyName(type: CompanyType): string {
  switch (type) {
    case 'noble_house':
      return `House ${pickRandom(SURNAMES)}`;
    case 'religious_order':
      return `${pickRandom(PREFIXES)} the ${pickRandom(['Sacred Flame', 'Holy Path', 'Blessed Grain', 'Eternal Coin', 'Wandering Friar'])}`;
    case 'farm_estate':
      return `${pickRandom(SURNAMES)} Estate`;
    case 'mining_operation':
      return `${pickRandom(SURNAMES)} Mining Co.`;
    case 'shipping_company':
      return `${pickRandom(SURNAMES)} Shipping`;
    default:
      return `${pickRandom(PREFIXES)} ${pickRandom(NOUNS)}`;
  }
}

function generateAssetName(template: string, companyName: string): string {
  // Use a short identifier derived from the company name
  const shortName = companyName.replace(/^(The|House|Order of|Company of|Brotherhood of|Guild of|League of)\s+/i, '')
    .split(' ').slice(0, 2).join(' ');
  return template.replace('{name}', shortName);
}

// ── Resource → company type mapping ──────────────────────────────────────────

type ResourceType = string;

function resourceToCompanyType(resources: ResourceType[]): CompanyType[] {
  const types: CompanyType[] = [];
  if (resources.some(r => ['grain', 'livestock', 'herbs', 'wool'].includes(r))) types.push('farm_estate');
  if (resources.some(r => ['iron', 'coal', 'copper', 'gold_ore', 'silver_ore', 'obsidian'].includes(r))) types.push('mining_operation');
  if (resources.some(r => ['fish', 'pearls', 'salt'].includes(r))) types.push('shipping_company');
  if (resources.some(r => ['spice', 'silk', 'wine'].includes(r))) types.push('trade_company');
  if (resources.some(r => ['timber', 'stone', 'peat'].includes(r))) types.push('craft_workshop');
  if (resources.some(r => ['horses'].includes(r))) types.push('military_contractor');
  return types;
}

// ── Main seeder ───────────────────────────────────────────────────────────────

export async function seedCompanies(client: PoolClient, worldId: string): Promise<void> {
  let totalCompanies = 0;
  let totalAssets = 0;

  for (const town of TOWNS) {
    // Determine company mix: resource-driven types + always a merchant guild
    const resourceTypes = resourceToCompanyType(town.resources);
    const companyTypes: CompanyType[] = [
      'merchant_guild',
      ...resourceTypes.slice(0, 2),
    ];

    // Larger/wealthier towns get more companies
    const wealthScore = town.population * town.wealth_per_capita;
    if (wealthScore > 2_000_000 && companyTypes.length < 4) companyTypes.push('noble_house');
    if (wealthScore > 5_000_000 && companyTypes.length < 5) companyTypes.push('banking_house');

    // Ensure at least 3 companies
    while (companyTypes.length < 3) companyTypes.push('merchant_guild');

    // Deduplicate while preserving order
    const seen = new Set<string>();
    const uniqueTypes = companyTypes.filter(t => {
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    }) as CompanyType[];

    // Total target revenue for this town ≈ population × wealth_per_capita
    const targetTotalRevenue = town.population * town.wealth_per_capita;
    const revenuePerCompany  = targetTotalRevenue / uniqueTypes.length;

    for (const companyType of uniqueTypes) {
      const name   = generateCompanyName(companyType);
      const traits = pickRandom(TYPE_TRAITS[companyType] ?? [['organised']]) as CompanyTraitId[];

      // Add slight noise to revenue so companies aren't all identical
      const revNoise = 0.8 + Math.random() * 0.4; // ×0.8 – ×1.2
      const annual_revenue = Math.round(revenuePerCompany * revNoise);

      const params = deriveCompanyParams({ traits, annual_revenue });
      const initialCash = Math.round(annual_revenue * (0.05 + Math.random() * 0.1)); // 5–15% of annual rev

      const companyId = uuidv4();

      await client.query(
        `INSERT INTO companies
           (id, world_id, name, town_id, company_type, traits,
            cash, annual_revenue, annual_expenses, equity, total_debt,
            loan_demand_per_tick, max_acceptable_rate, base_default_probability,
            status, founded_at_tick, asset_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          companyId, worldId, name, town.id, companyType, traits,
          initialCash, annual_revenue, params.annual_expenses,
          initialCash,  // equity starts = cash (no debt, assets valued separately)
          0,            // total_debt
          params.loan_demand_per_tick, params.max_acceptable_rate, params.base_default_probability,
          'active', 0,
          TYPE_ASSETS[companyType]?.length ?? 0,
        ],
      );

      // Seed assets for this company
      const assetTemplates = TYPE_ASSETS[companyType] ?? [];
      let assetCount = 0;

      for (const template of assetTemplates) {
        const assetName  = generateAssetName(pickRandom(template.namePatterns), name);
        const assetValue = template.valueRange[0] + Math.random() * (template.valueRange[1] - template.valueRange[0]);
        const assetRevenue = annual_revenue * template.revenueRatio * (0.85 + Math.random() * 0.3);

        await client.query(
          `INSERT INTO company_assets
             (id, company_id, world_id, town_id, asset_type, name, value, condition, annual_revenue, created_at_tick)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            uuidv4(), companyId, worldId, town.id, template.type,
            assetName, Math.round(assetValue), 100, Math.round(assetRevenue), 0,
          ],
        );
        assetCount++;
        totalAssets++;
      }

      // Update asset_count
      await client.query(
        'UPDATE companies SET asset_count = $1 WHERE id = $2',
        [assetCount, companyId],
      );

      totalCompanies++;
    }
  }

  console.log(`[seed-companies] Created ${totalCompanies} companies and ${totalAssets} assets across ${TOWNS.length} towns`);
}
