import type { Event } from '../types.js';

export type EventListener = (e: Event) => void;

export class EventBus {
  private listeners = new Set<EventListener>();
  private buffer: Event[] = [];
  private bufferLimit = 5000;

  emit(e: Event) {
    this.buffer.push(e);
    if (this.buffer.length > this.bufferLimit) this.buffer.shift();
    for (const l of this.listeners) {
      try { l(e); } catch { /* swallow */ }
    }
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Replay the buffered backlog to a new subscriber (handy for late-joining clients). */
  replay(listener: EventListener) {
    for (const e of this.buffer) listener(e);
  }

  snapshot(): Event[] { return [...this.buffer]; }
  clear() { this.buffer = []; }
}

export const globalBus = new EventBus();
