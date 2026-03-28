'use client';
import { useEffect, useRef } from 'react';
import { getSocket } from '../lib/socket';
import { useWorldStore } from '../store/world-store';
import { usePlayerStore } from '../store/player-store';
import { useUiStore } from '../store/ui-store';
import type { TickDelta, PlayerSnapshot, LoanAuction } from '@argentum/shared';

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toFixed(0);
}

export function useSocket(): void {
  const lastTickRef = useRef<number>(-1);
  const worldStore  = useWorldStore();
  const playerStore = usePlayerStore();
  const addNotification = useUiStore(s => s.addNotification);
  const applyAuctionBid = usePlayerStore(s => s.applyAuctionBid);
  const closeAuction = usePlayerStore(s => s.closeAuction);

  useEffect(() => {
    const socket = getSocket();
    if (!socket.connected) socket.connect();

    const onSnapshot = (snapshot: PlayerSnapshot) => {
      worldStore.hydrate({
        towns:       snapshot.towns,
        regions:     snapshot.regions ?? [],
        events:      snapshot.events,
        clock:       snapshot.clock,
        tradeRoutes: snapshot.trade_routes ?? [],
      });
      playerStore.hydrate({
        player:            snapshot.player,
        balanceSheet:      snapshot.balance_sheet,
        licenses:          snapshot.licenses,
        loans:             snapshot.loans,
        deposits:          snapshot.deposits,
        proposals:         snapshot.loan_proposals,
        auctions:          snapshot.auctions ?? [],
        leaderboard:       snapshot.leaderboard,
        balanceHistory:    snapshot.balance_history ?? [],
        townTotalDeposits: snapshot.town_total_deposits ?? {},
      });
      lastTickRef.current = snapshot.clock.current_tick;
    };

    const onDelta = (delta: TickDelta) => {
      // Gap detection: if we missed more than 3 ticks, re-request snapshot
      if (lastTickRef.current > 0 && delta.tick > lastTickRef.current + 3) {
        console.warn(`[ws] Gap detected (last: ${lastTickRef.current}, received: ${delta.tick}). Re-syncing...`);
        socket.disconnect();
        socket.connect();
        return;
      }

      lastTickRef.current = delta.tick;
      worldStore.applyDelta(delta);
      playerStore.applyDelta(delta);

      // Notify on loan events for this player
      const playerId = playerStore.player?.id;
      if (playerId) {
        const update = delta.player_updates[playerId];
        if (update) {
          for (const id of update.new_loan_default_ids) {
            addNotification(`Loan defaulted (id: ${id.slice(0, 8)}...)`, 'danger');
          }
          for (const id of update.new_loan_repayment_ids) {
            addNotification(`Loan repaid (id: ${id.slice(0, 8)}...)`, 'default');
          }
        }
      }

      // Notify new auctions
      if (delta.auction_updates.new_auctions.length > 0) {
        const count = delta.auction_updates.new_auctions.length;
        addNotification(`${count} new auction${count > 1 ? 's' : ''} open — place your bids!`);
      }
    };

    const onBankrupt = ({ bank_name }: { player_id: string; bank_name: string }) => {
      addNotification(`${bank_name} has gone bankrupt!`, 'danger');
    };

    const onEvent = (event: import('@argentum/shared').WorldEvent) => {
      addNotification(`Event: ${event.event_type} in ${event.town_id}`, 'warning');
    };

    const onAuctionNew = (auction: LoanAuction) => {
      // The delta will add it to the store; just notify
      addNotification(`New auction: ${auction.borrower_name} seeks ${fmt(auction.requested_amount)}g`);
    };

    const onAuctionBid = ({ auction_id, bids }: { auction_id: string; bids: import('@argentum/shared').AuctionBid[] }) => {
      applyAuctionBid(auction_id, bids);
    };

    const onAuctionClosed = ({ auction_id, status, winning_bid }: {
      auction_id: string;
      status: import('@argentum/shared').AuctionStatus;
      winning_bid?: import('@argentum/shared').AuctionBid;
    }) => {
      closeAuction(auction_id);
      if (status === 'awarded' && winning_bid) {
        const playerId = playerStore.player?.id;
        if (winning_bid.player_id === playerId) {
          addNotification(`Auction won! ${winning_bid.bank_name} @ ${(winning_bid.offered_rate * 100).toFixed(1)}%`, 'default');
        }
      }
    };

    const onGameReset = () => {
      // Reconnect to get a fresh snapshot
      lastTickRef.current = -1;
      socket.disconnect();
      socket.connect();
    };

    socket.on('world:snapshot', onSnapshot);
    socket.on('tick:delta', onDelta);
    socket.on('player:bankrupt', onBankrupt);
    socket.on('event:occurred', onEvent);
    socket.on('auction:new', onAuctionNew);
    socket.on('auction:bid', onAuctionBid);
    socket.on('auction:closed', onAuctionClosed);
    socket.on('game:reset', onGameReset);

    return () => {
      socket.off('world:snapshot', onSnapshot);
      socket.off('tick:delta', onDelta);
      socket.off('player:bankrupt', onBankrupt);
      socket.off('event:occurred', onEvent);
      socket.off('auction:new', onAuctionNew);
      socket.off('auction:bid', onAuctionBid);
      socket.off('auction:closed', onAuctionClosed);
      socket.off('game:reset', onGameReset);
    };
  }, []);
}
