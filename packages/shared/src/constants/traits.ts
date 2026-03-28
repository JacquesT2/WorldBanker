import type { CompanyTrait, CompanyTraitId } from '../types/company.js';

/**
 * All trait definitions with their effect multipliers.
 *
 * Conventions:
 *   - cashflow_modifier / margin_modifier: 1.0 = neutral, >1 = better, <1 = worse
 *   - base_default_modifier: 1.0 = neutral, >1 = riskier, <1 = safer
 *   - collateral_modifier: >1 = offers more collateral
 *   - loan_demand_modifier: >1 = seeks loans more often, <1 = rarely borrows
 *   - max_rate_modifier: >1 = accepts higher rates, <1 = rate-sensitive
 *   - capital_aggression: -1 (hoards cash) to +1 (deploys aggressively)
 *   - collaboration_score: -1 (hostile) to +1 (very collaborative)
 *   - relation_gain_modifier: >1 = relations build fast, <1 = slow to trust
 *   - expansion_rate: >1 = rapidly acquires assets
 */
export const TRAIT_DEFINITIONS: Record<CompanyTraitId, CompanyTrait> = {

  organised: {
    id: 'organised',
    name: 'Organised',
    description: 'Tight internal processes, predictable cash flows, low operational waste.',
    effects: {
      cashflow_modifier:     1.15,
      margin_modifier:       1.10,
      base_default_modifier: 0.75,
      collateral_modifier:   1.20,
      loan_demand_modifier:  1.00,
      max_rate_modifier:     0.95,
      capital_aggression:    0.00,
      collaboration_score:   0.10,
      relation_gain_modifier:1.00,
      expansion_rate:        1.00,
    },
  },

  disorganised: {
    id: 'disorganised',
    name: 'Disorganised',
    description: 'Chaotic operations, frequent cash crunches, prone to missing repayments.',
    effects: {
      cashflow_modifier:     0.85,
      margin_modifier:       0.90,
      base_default_modifier: 1.50,
      collateral_modifier:   0.80,
      loan_demand_modifier:  1.30,
      max_rate_modifier:     1.10,
      capital_aggression:    0.20,
      collaboration_score:  -0.10,
      relation_gain_modifier:0.80,
      expansion_rate:        0.70,
    },
  },

  orderly: {
    id: 'orderly',
    name: 'Orderly',
    description: 'Rule-bound and methodical. Conservative in capital use, reliable in obligations.',
    effects: {
      cashflow_modifier:     1.10,
      margin_modifier:       1.05,
      base_default_modifier: 0.80,
      collateral_modifier:   1.10,
      loan_demand_modifier:  0.80,
      max_rate_modifier:     0.90,
      capital_aggression:   -0.30,
      collaboration_score:   0.20,
      relation_gain_modifier:1.20,
      expansion_rate:        0.80,
    },
  },

  chaotic: {
    id: 'chaotic',
    name: 'Chaotic',
    description: 'Unpredictable decisions, volatile revenues, high default risk but fast-moving.',
    effects: {
      cashflow_modifier:     0.90,
      margin_modifier:       0.85,
      base_default_modifier: 1.60,
      collateral_modifier:   0.70,
      loan_demand_modifier:  1.50,
      max_rate_modifier:     1.20,
      capital_aggression:    0.40,
      collaboration_score:  -0.30,
      relation_gain_modifier:0.60,
      expansion_rate:        1.20,
    },
  },

  hierarchical: {
    id: 'hierarchical',
    name: 'Hierarchical',
    description: 'Rigid command structure. Slow to adapt but stable and debt-averse.',
    effects: {
      cashflow_modifier:     1.05,
      margin_modifier:       1.00,
      base_default_modifier: 0.90,
      collateral_modifier:   1.10,
      loan_demand_modifier:  0.90,
      max_rate_modifier:     0.95,
      capital_aggression:   -0.20,
      collaboration_score:   0.00,
      relation_gain_modifier:0.80,
      expansion_rate:        0.90,
    },
  },

  flat: {
    id: 'flat',
    name: 'Flat',
    description: 'Decentralised structure. Fast decisions, high collaboration, adaptive.',
    effects: {
      cashflow_modifier:     1.00,
      margin_modifier:       1.05,
      base_default_modifier: 0.95,
      collateral_modifier:   1.00,
      loan_demand_modifier:  1.00,
      max_rate_modifier:     1.00,
      capital_aggression:    0.10,
      collaboration_score:   0.30,
      relation_gain_modifier:1.30,
      expansion_rate:        1.10,
    },
  },

  bureaucratic: {
    id: 'bureaucratic',
    name: 'Bureaucratic',
    description: 'Slow-moving, approval-heavy. Low risk but leaves money on the table.',
    effects: {
      cashflow_modifier:     0.95,
      margin_modifier:       0.90,
      base_default_modifier: 0.85,
      collateral_modifier:   1.10,
      loan_demand_modifier:  0.90,
      max_rate_modifier:     0.95,
      capital_aggression:   -0.40,
      collaboration_score:  -0.10,
      relation_gain_modifier:0.70,
      expansion_rate:        0.75,
    },
  },

  friendly: {
    id: 'friendly',
    name: 'Friendly',
    description: 'Open and approachable. Builds lender trust quickly, accepts fair rates.',
    effects: {
      cashflow_modifier:     1.05,
      margin_modifier:       0.95,
      base_default_modifier: 0.85,
      collateral_modifier:   1.00,
      loan_demand_modifier:  0.90,
      max_rate_modifier:     0.90,
      capital_aggression:   -0.10,
      collaboration_score:   0.50,
      relation_gain_modifier:1.50,
      expansion_rate:        0.90,
    },
  },

  hostile: {
    id: 'hostile',
    name: 'Hostile',
    description: 'Adversarial posture. Relations decay fast, terms are combative.',
    effects: {
      cashflow_modifier:     0.95,
      margin_modifier:       1.10,
      base_default_modifier: 1.20,
      collateral_modifier:   0.90,
      loan_demand_modifier:  1.20,
      max_rate_modifier:     1.10,
      capital_aggression:    0.30,
      collaboration_score:  -0.50,
      relation_gain_modifier:0.40,
      expansion_rate:        1.00,
    },
  },

  kind: {
    id: 'kind',
    name: 'Kind',
    description: 'Generous with workers and creditors. Strong honour of commitments.',
    effects: {
      cashflow_modifier:     1.00,
      margin_modifier:       0.90,
      base_default_modifier: 0.80,
      collateral_modifier:   1.15,
      loan_demand_modifier:  1.00,
      max_rate_modifier:     0.85,
      capital_aggression:   -0.20,
      collaboration_score:   0.40,
      relation_gain_modifier:1.40,
      expansion_rate:        0.85,
    },
  },

  predatory: {
    id: 'predatory',
    name: 'Predatory',
    description: 'Extracts maximum value from every deal. High margins, bad reputation over time.',
    effects: {
      cashflow_modifier:     1.20,
      margin_modifier:       1.30,
      base_default_modifier: 1.10,
      collateral_modifier:   0.85,
      loan_demand_modifier:  1.10,
      max_rate_modifier:     1.30,
      capital_aggression:    0.50,
      collaboration_score:  -0.40,
      relation_gain_modifier:0.50,
      expansion_rate:        1.40,
    },
  },

  aggressive: {
    id: 'aggressive',
    name: 'Aggressive',
    description: 'Pursues growth at all costs. Frequently leveraged, higher default exposure.',
    effects: {
      cashflow_modifier:     1.10,
      margin_modifier:       1.10,
      base_default_modifier: 1.20,
      collateral_modifier:   0.90,
      loan_demand_modifier:  1.50,
      max_rate_modifier:     1.20,
      capital_aggression:    0.70,
      collaboration_score:  -0.20,
      relation_gain_modifier:0.80,
      expansion_rate:        1.50,
    },
  },

  conservative: {
    id: 'conservative',
    name: 'Conservative',
    description: 'Debt-averse, low leverage, high collateral. Safe but slow growth.',
    effects: {
      cashflow_modifier:     1.05,
      margin_modifier:       1.00,
      base_default_modifier: 0.70,
      collateral_modifier:   1.30,
      loan_demand_modifier:  0.50,
      max_rate_modifier:     0.80,
      capital_aggression:   -0.70,
      collaboration_score:   0.10,
      relation_gain_modifier:0.90,
      expansion_rate:        0.60,
    },
  },

  toxic: {
    id: 'toxic',
    name: 'Toxic',
    description: 'Internal dysfunction poisons operations. High turnover, volatile cash, bad creditor.',
    effects: {
      cashflow_modifier:     0.80,
      margin_modifier:       0.85,
      base_default_modifier: 1.80,
      collateral_modifier:   0.70,
      loan_demand_modifier:  1.60,
      max_rate_modifier:     1.15,
      capital_aggression:    0.30,
      collaboration_score:  -0.80,
      relation_gain_modifier:0.30,
      expansion_rate:        0.90,
    },
  },

  innovative: {
    id: 'innovative',
    name: 'Innovative',
    description: 'Constantly investing in new methods. Capital-hungry but high upside.',
    effects: {
      cashflow_modifier:     1.15,
      margin_modifier:       1.15,
      base_default_modifier: 1.00,
      collateral_modifier:   0.90,
      loan_demand_modifier:  1.30,
      max_rate_modifier:     1.10,
      capital_aggression:    0.20,
      collaboration_score:   0.20,
      relation_gain_modifier:1.10,
      expansion_rate:        1.30,
    },
  },

  traditional: {
    id: 'traditional',
    name: 'Traditional',
    description: 'Time-tested methods, resistant to change. Stable, lower upside.',
    effects: {
      cashflow_modifier:     1.00,
      margin_modifier:       1.05,
      base_default_modifier: 0.85,
      collateral_modifier:   1.15,
      loan_demand_modifier:  0.80,
      max_rate_modifier:     0.90,
      capital_aggression:   -0.30,
      collaboration_score:   0.10,
      relation_gain_modifier:1.00,
      expansion_rate:        0.70,
    },
  },

  risk_tolerant: {
    id: 'risk_tolerant',
    name: 'Risk Tolerant',
    description: 'Comfortable with uncertainty. Accepts high-rate loans, moves fast.',
    effects: {
      cashflow_modifier:     1.05,
      margin_modifier:       1.10,
      base_default_modifier: 1.25,
      collateral_modifier:   0.80,
      loan_demand_modifier:  1.20,
      max_rate_modifier:     1.20,
      capital_aggression:    0.50,
      collaboration_score:   0.00,
      relation_gain_modifier:1.00,
      expansion_rate:        1.30,
    },
  },

  risk_averse: {
    id: 'risk_averse',
    name: 'Risk Averse',
    description: 'Strongly prefers certainty. Only borrows at low rates with heavy collateral.',
    effects: {
      cashflow_modifier:     1.00,
      margin_modifier:       0.95,
      base_default_modifier: 0.65,
      collateral_modifier:   1.30,
      loan_demand_modifier:  0.60,
      max_rate_modifier:     0.75,
      capital_aggression:   -0.60,
      collaboration_score:   0.10,
      relation_gain_modifier:0.90,
      expansion_rate:        0.60,
    },
  },

  well_connected: {
    id: 'well_connected',
    name: 'Well Connected',
    description: 'Deep network of allies. Information advantages, fast trust-building.',
    effects: {
      cashflow_modifier:     1.10,
      margin_modifier:       1.05,
      base_default_modifier: 0.85,
      collateral_modifier:   1.10,
      loan_demand_modifier:  0.90,
      max_rate_modifier:     0.90,
      capital_aggression:    0.00,
      collaboration_score:   0.40,
      relation_gain_modifier:1.60,
      expansion_rate:        1.10,
    },
  },

  isolated: {
    id: 'isolated',
    name: 'Isolated',
    description: 'Self-sufficient, few outside relationships. Slow to trust outsiders.',
    effects: {
      cashflow_modifier:     0.90,
      margin_modifier:       0.95,
      base_default_modifier: 1.10,
      collateral_modifier:   0.90,
      loan_demand_modifier:  1.10,
      max_rate_modifier:     1.05,
      capital_aggression:    0.00,
      collaboration_score:  -0.30,
      relation_gain_modifier:0.50,
      expansion_rate:        0.80,
    },
  },

  loyal: {
    id: 'loyal',
    name: 'Loyal',
    description: 'Honors obligations above all else. Default risk drops with existing lender relations.',
    effects: {
      cashflow_modifier:     1.05,
      margin_modifier:       1.00,
      base_default_modifier: 0.75,
      collateral_modifier:   1.20,
      loan_demand_modifier:  0.85,
      max_rate_modifier:     0.95,
      capital_aggression:   -0.10,
      collaboration_score:   0.30,
      relation_gain_modifier:1.20,
      expansion_rate:        0.90,
    },
  },

  opportunistic: {
    id: 'opportunistic',
    name: 'Opportunistic',
    description: 'Moves wherever profit is highest. Transactional relationships, high margins.',
    effects: {
      cashflow_modifier:     1.10,
      margin_modifier:       1.20,
      base_default_modifier: 1.15,
      collateral_modifier:   0.85,
      loan_demand_modifier:  1.20,
      max_rate_modifier:     1.15,
      capital_aggression:    0.40,
      collaboration_score:  -0.20,
      relation_gain_modifier:0.70,
      expansion_rate:        1.20,
    },
  },

};

/**
 * Resolve the combined effects of a set of traits.
 * Multiplicative for most fields; additive for capital_aggression and collaboration_score.
 */
export function resolveTraitEffects(traitIds: import('../types/company.js').CompanyTraitId[]): import('../types/company.js').TraitEffects {
  let cashflow_modifier     = 1.0;
  let margin_modifier       = 1.0;
  let base_default_modifier = 1.0;
  let collateral_modifier   = 1.0;
  let loan_demand_modifier  = 1.0;
  let max_rate_modifier     = 1.0;
  let capital_aggression    = 0.0;
  let collaboration_score   = 0.0;
  let relation_gain_modifier= 1.0;
  let expansion_rate        = 1.0;

  for (const id of traitIds) {
    const t = TRAIT_DEFINITIONS[id];
    if (!t) continue;
    cashflow_modifier      *= t.effects.cashflow_modifier;
    margin_modifier        *= t.effects.margin_modifier;
    base_default_modifier  *= t.effects.base_default_modifier;
    collateral_modifier    *= t.effects.collateral_modifier;
    loan_demand_modifier   *= t.effects.loan_demand_modifier;
    max_rate_modifier      *= t.effects.max_rate_modifier;
    capital_aggression     += t.effects.capital_aggression;
    collaboration_score    += t.effects.collaboration_score;
    relation_gain_modifier *= t.effects.relation_gain_modifier;
    expansion_rate         *= t.effects.expansion_rate;
  }

  // Clamp additive scores to [-1, 1]
  capital_aggression  = Math.max(-1, Math.min(1, capital_aggression));
  collaboration_score = Math.max(-1, Math.min(1, collaboration_score));

  return {
    cashflow_modifier, margin_modifier, base_default_modifier,
    collateral_modifier, loan_demand_modifier, max_rate_modifier,
    capital_aggression, collaboration_score, relation_gain_modifier,
    expansion_rate,
  };
}
