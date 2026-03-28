import type { WorldState } from '../state/world-state';
import type { AuctionBid } from '@argentum/shared';
import { passesAutoBidRule } from '@argentum/shared';
import { pool } from '../db/pool';

export interface AutoBidResult {
  bidUpdates: Array<{ auction_id: string; bids: AuctionBid[] }>;
}

export function executeAutoBids(state: WorldState): AutoBidResult {
  const tick = state.clock.current_tick;
  const result: AutoBidResult = { bidUpdates: [] };

  for (const [playerId, rule] of state.autoBidRules) {
    if (!rule.enabled) continue;

    const player = state.players.get(playerId);
    if (!player || player.is_bankrupt) continue;

    const bs = state.balanceSheets.get(playerId);
    if (!bs) continue;

    const licenses = state.licenses.get(playerId) ?? [];
    const licensedTownIds = new Set(licenses.map(l => l.town_id));

    let deployedSoFar = 0;

    for (const auction of state.auctions.values()) {
      if (auction.status !== 'open') continue;
      if (auction.closes_at_tick <= tick) continue;
      if (!licensedTownIds.has(auction.town_id)) continue;
      if (auction.bids.some(b => b.player_id === playerId)) continue;

      if (!passesAutoBidRule(auction, rule, bs, deployedSoFar)) continue;

      const offeredRate = Math.max(0.02, auction.max_acceptable_rate - rule.rate_discount);
      deployedSoFar += auction.requested_amount;

      const bid: AuctionBid = {
        player_id: playerId,
        bank_name: player.bank_name,
        offered_rate: offeredRate,
        bid_tick: tick,
      };

      auction.bids.push(bid);
      result.bidUpdates.push({ auction_id: auction.id, bids: [...auction.bids] });

      pool.query(
        `INSERT INTO auction_bids (id, auction_id, player_id, offered_rate, bid_tick)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4)
         ON CONFLICT (auction_id, player_id) DO UPDATE SET
           offered_rate = EXCLUDED.offered_rate, bid_tick = EXCLUDED.bid_tick`,
        [auction.id, playerId, offeredRate, tick],
      ).catch(e => console.error(`[auto-bid] DB error: ${(e as Error).message}`));
    }
  }

  return result;
}
