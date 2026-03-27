import type { BorrowerType } from '@argentum/shared';

export interface BotStrategy {
  id: string;
  username: string;
  bankName: string;
  description: string;
  startingTownId: string;
  startingCash: number;

  // Lending rules
  maxRiskPctPerYear: number;   // annualised default ceiling
  minNetYieldPct: number;      // collateral-adjusted net yield floor
  minLoanAmount: number;       // ignore tiny proposals (0 = no minimum)
  maxLoanAmount: number;       // skip oversized proposals (0 = no max)
  minReserveAfter: number;     // reserve floor after accepting
  preferredTypes: BorrowerType[];  // [] = accept all types
  rateDiscount: number;        // offer max_acceptable_rate - rateDiscount
  maxLoansPerBatch: number;    // cap per action cycle

  // Deposit strategy
  depositRateOffered: number;  // annual rate offered to savers

  // Cadence
  actEveryNTicks: number;      // how many ticks between bot actions
}

export const BOT_STRATEGIES: BotStrategy[] = [
  {
    id: 'iron_vault',
    username: 'bot_iron_vault',
    bankName: 'The Iron Vault',
    description: 'Ultra-conservative; only accepts near-certain loans with strong collateral.',
    startingTownId: 'town_aurea',
    startingCash: 8000,
    maxRiskPctPerYear: 8,
    minNetYieldPct: 2,
    minLoanAmount: 0,
    maxLoanAmount: 0,
    minReserveAfter: 0.25,
    preferredTypes: ['merchant', 'guild', 'noble'],
    rateDiscount: 0.01,
    maxLoansPerBatch: 2,
    depositRateOffered: 0.02,
    actEveryNTicks: 4,
  },
  {
    id: 'goldthorn',
    username: 'bot_goldthorn',
    bankName: 'Goldthorn & Sons',
    description: 'Trade-focused merchant bank; funds guilds, craftsmen and merchants aggressively.',
    startingTownId: 'town_ferrath',
    startingCash: 12000,
    maxRiskPctPerYear: 25,
    minNetYieldPct: 5,
    minLoanAmount: 0,
    maxLoanAmount: 0,
    minReserveAfter: 0.15,
    preferredTypes: ['merchant', 'guild', 'craftsman', 'shipwright'],
    rateDiscount: 0,
    maxLoansPerBatch: 4,
    depositRateOffered: 0.04,
    actEveryNTicks: 3,
  },
  {
    id: 'house_aldric',
    username: 'bot_house_aldric',
    bankName: 'House of Aldric',
    description: 'Noble financier; prefers large prestige loans to nobles and guilds. Slow but steady.',
    startingTownId: 'town_sylvenmere',
    startingCash: 18000,
    maxRiskPctPerYear: 14,
    minNetYieldPct: 3,
    minLoanAmount: 400,
    maxLoanAmount: 0,
    minReserveAfter: 0.20,
    preferredTypes: ['noble', 'guild'],
    rateDiscount: 0.005,
    maxLoansPerBatch: 2,
    depositRateOffered: 0.025,
    actEveryNTicks: 6,
  },
  {
    id: 'reckless_capital',
    username: 'bot_reckless',
    bankName: 'Reckless Capital',
    description: 'High-risk high-reward; accepts nearly any loan and offers top deposit rates to fund it.',
    startingTownId: 'town_skarhold',
    startingCash: 5000,
    maxRiskPctPerYear: 55,
    minNetYieldPct: 4,
    minLoanAmount: 0,
    maxLoanAmount: 0,
    minReserveAfter: 0.08,
    preferredTypes: [],
    rateDiscount: 0,
    maxLoansPerBatch: 6,
    depositRateOffered: 0.07,
    actEveryNTicks: 2,
  },
  {
    id: 'commons_bank',
    username: 'bot_commons',
    bankName: 'The Commons Bank',
    description: 'Community lender; funds farmers, miners and craftsmen. Competitive savings rates.',
    startingTownId: 'town_midmark_city',
    startingCash: 7000,
    maxRiskPctPerYear: 28,
    minNetYieldPct: 4,
    minLoanAmount: 0,
    maxLoanAmount: 1500,
    minReserveAfter: 0.18,
    preferredTypes: ['farmer', 'craftsman', 'miner'],
    rateDiscount: 0.005,
    maxLoansPerBatch: 5,
    depositRateOffered: 0.05,
    actEveryNTicks: 5,
  },
];
