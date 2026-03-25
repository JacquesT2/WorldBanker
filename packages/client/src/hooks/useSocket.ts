'use client';
import { useEffect, useRef } from 'react';
import { getSocket } from '../lib/socket';
import { useWorldStore } from '../store/world-store';
import { usePlayerStore } from '../store/player-store';
import { useUiStore } from '../store/ui-store';
import type { TickDelta, PlayerSnapshot } from '@argentum/shared';

export function useSocket(): void {
  const lastTickRef = useRef<number>(-1);
  const worldStore  = useWorldStore();
  const playerStore = usePlayerStore();
  const addNotification = useUiStore(s => s.addNotification);

  useEffect(() => {
    const socket = getSocket();
    if (!socket.connected) socket.connect();

    const onSnapshot = (snapshot: PlayerSnapshot) => {
      worldStore.hydrate({
        towns:   snapshot.towns,
        regions: snapshot.regions ?? [],
        events:  snapshot.events,
        clock:   snapshot.clock,
      });
      playerStore.hydrate({
        player:       snapshot.player,
        balanceSheet: snapshot.balance_sheet,
        licenses:     snapshot.licenses,
        loans:        snapshot.loans,
        deposits:     snapshot.deposits,
        proposals:    snapshot.loan_proposals,
        leaderboard:  snapshot.leaderboard,
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

      // Notify new proposals
      if (delta.loan_proposal_updates.new_proposals.length > 0) {
        const count = delta.loan_proposal_updates.new_proposals.length;
        addNotification(`${count} new loan proposal${count > 1 ? 's' : ''} available`);
      }
    };

    const onBankrupt = ({ bank_name }: { player_id: string; bank_name: string }) => {
      addNotification(`${bank_name} has gone bankrupt!`, 'danger');
    };

    const onEvent = (event: import('@argentum/shared').WorldEvent) => {
      addNotification(`Event: ${event.event_type} in ${event.town_id}`, 'warning');
    };

    socket.on('world:snapshot', onSnapshot);
    socket.on('tick:delta', onDelta);
    socket.on('player:bankrupt', onBankrupt);
    socket.on('event:occurred', onEvent);

    return () => {
      socket.off('world:snapshot', onSnapshot);
      socket.off('tick:delta', onDelta);
      socket.off('player:bankrupt', onBankrupt);
      socket.off('event:occurred', onEvent);
    };
  }, []);
}
