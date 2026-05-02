import type { EventBus } from '../events/bus.js';
import type { Event } from '../types.js';
import * as store from './store.js';

let currentTournamentId: string | null = null;

/** Subscribe a persistence listener to the bus. Idempotent — call once at startup. */
export function attachPersistence(bus: EventBus) {
  bus.subscribe((e: Event) => {
    // Track current tournament id from start events so we can tag generic logs.
    if (e.type === 'tournament:start') currentTournamentId = e.tournamentId;
    const tid = e.type === 'tournament:start' ? e.tournamentId : currentTournamentId;
    try {
      store.insertEvent(tid, e);
    } catch (err) {
      // Persistence must never crash the run.
      console.error('[persist] insertEvent failed:', err);
    }
    if (e.type === 'tournament:complete') currentTournamentId = null;
  });
}
