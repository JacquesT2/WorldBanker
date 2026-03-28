import { v4 as uuidv4 } from 'uuid';
import type { LoanAuction, AuctionBid, Loan } from '@argentum/shared';
import type { WorldState } from '../state/world-state';
import { pool } from '../db/pool';

export interface ClosedAuctionInfo {
  auction_id: string;
  status: 'awarded' | 'no_bids';
  winning_bid?: AuctionBid;
  loan_id?: string;
}

export interface AuctionProcessorResult {
  newAuctions: LoanAuction[];
  closedAuctionIds: string[];
  closedAuctions: ClosedAuctionInfo[];
  bidUpdates: Array<{ auction_id: string; bids: AuctionBid[] }>;
  newLoansByPlayer: Map<string, Loan[]>;    // player_id -> loans created this tick
}

/**
 * Step: Process loan auctions.
 * - Collect newly opened auctions (created this tick by company-processor)
 * - Close auctions whose bidding window has ended:
 *   - If bids exist → award to lowest bidder → create loan
 *   - If no bids → mark as no_bids
 */
export function processAuctions(
  state: WorldState,
  prevAuctionIds: Set<string>,
): AuctionProcessorResult {
  const tick = state.clock.current_tick;
  const result: AuctionProcessorResult = {
    newAuctions: [],
    closedAuctionIds: [],
    closedAuctions: [],
    bidUpdates: [],
    newLoansByPlayer: new Map(),
  };

  // Collect new auctions (appeared this tick) and persist them
  for (const auction of state.auctions.values()) {
    if (!prevAuctionIds.has(auction.id) && auction.status === 'open') {
      result.newAuctions.push(auction);

      pool.query(
        `INSERT INTO loan_auctions
           (id, world_id, town_id, company_id, borrower_name, company_type,
            requested_amount, max_acceptable_rate, term_ticks, base_default_probability,
            collateral_value, partial_recovery_rate, created_at_tick, closes_at_tick, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'open')`,
        [
          auction.id, auction.world_id, auction.town_id,
          auction.company_id, auction.borrower_name, auction.company_type,
          auction.requested_amount, auction.max_acceptable_rate,
          auction.term_ticks, auction.base_default_probability, auction.collateral_value,
          auction.partial_recovery_rate, auction.created_at_tick, auction.closes_at_tick,
        ],
      ).catch(e => console.error(`[auction] insert: ${e.message}`));
    }
  }

  // Close expired auctions
  for (const [id, auction] of state.auctions) {
    if (auction.status !== 'open') continue;
    if (auction.closes_at_tick > tick) continue;

    if (auction.bids.length === 0) {
      auction.status = 'no_bids';
      result.closedAuctionIds.push(id);
      result.closedAuctions.push({ auction_id: id, status: 'no_bids' });
      state.auctions.delete(id);

      pool.query(
        `UPDATE loan_auctions SET status = 'no_bids' WHERE id = $1`, [id],
      ).catch(e => console.error(`[auction] no_bids update: ${e.message}`));
      continue;
    }

    // Pick winning bid: lowest offered_rate, tie-break by earliest bid_tick
    const winner = auction.bids.reduce((best, bid) => {
      if (bid.offered_rate < best.offered_rate) return bid;
      if (bid.offered_rate === best.offered_rate && bid.bid_tick < best.bid_tick) return bid;
      return best;
    });

    auction.status = 'awarded';
    auction.winning_bid = winner;
    result.closedAuctionIds.push(id);

    const bs = state.balanceSheets.get(winner.player_id);
    if (!bs || bs.cash < auction.requested_amount) {
      auction.status = 'no_bids';
      result.closedAuctions.push({ auction_id: id, status: 'no_bids' });
      state.auctions.delete(id);
      pool.query(
        `UPDATE loan_auctions SET status = 'no_bids' WHERE id = $1`, [id]
      ).catch(e => console.error(`[auction] insufficient cash: ${e.message}`));
      continue;
    }

    const company = state.companies.get(auction.company_id);
    const loanId = uuidv4();

    const loanData: Loan = {
      id: loanId,
      player_id: winner.player_id,
      town_id: auction.town_id,
      company_id: auction.company_id,
      borrower_name: auction.borrower_name,
      company_type: auction.company_type,
      principal: auction.requested_amount,
      outstanding_balance: auction.requested_amount,
      interest_rate: winner.offered_rate,
      term_ticks: auction.term_ticks,
      ticks_elapsed: 0,
      status: 'active',
      default_probability_per_tick: company?.base_default_probability ?? 0.001,
      collateral_value: auction.collateral_value,
      partial_recovery_rate: auction.partial_recovery_rate,
      created_at_tick: tick,
    };

    bs.cash -= auction.requested_amount;

    // Track company debt
    if (company) {
      company.total_debt += auction.requested_amount;
    }

    // Initial relation entry for this lender if not already set
    if (company) {
      const existing = state.getRelation(company.id, winner.player_id);
      if (existing.score === 0 && existing.last_interaction_tick === 0) {
        state.setRelation({ ...existing, score: 5, last_interaction_tick: tick });
      } else {
        state.setRelation({ ...existing, score: Math.min(100, existing.score + 3), last_interaction_tick: tick });
      }
    }

    state.addLoan(loanData);
    state.auctions.delete(id);
    result.closedAuctions.push({ auction_id: id, status: 'awarded', winning_bid: winner, loan_id: loanId });

    const existing = result.newLoansByPlayer.get(winner.player_id) ?? [];
    existing.push(loanData);
    result.newLoansByPlayer.set(winner.player_id, existing);

    pool.query(
      `INSERT INTO loans
         (id, player_id, town_id, company_id, borrower_name, company_type, principal,
          outstanding_balance, interest_rate, term_ticks, ticks_elapsed, status,
          default_probability_per_tick, collateral_value, partial_recovery_rate, created_at_tick)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        loanId, winner.player_id, auction.town_id,
        auction.company_id, auction.borrower_name, auction.company_type,
        auction.requested_amount, auction.requested_amount, winner.offered_rate, auction.term_ticks,
        0, 'active', loanData.default_probability_per_tick,
        auction.collateral_value, auction.partial_recovery_rate, tick,
      ],
    ).catch(e => console.error(`[auction] loan insert: ${e.message}`));

    pool.query(
      `UPDATE loan_auctions SET status = 'awarded', winning_player_id = $1, winning_rate = $2 WHERE id = $3`,
      [winner.player_id, winner.offered_rate, id],
    ).catch(e => console.error(`[auction] awarded update: ${e.message}`));

    console.log(
      `[auction] ${auction.borrower_name} awarded to ${winner.bank_name} @ ${(winner.offered_rate * 100).toFixed(1)}% (${auction.bids.length} bids)`,
    );
  }

  return result;
}
