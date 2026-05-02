import type { Request, Response } from 'express';
import type { EventBus } from './bus.js';

export function attachSse(bus: EventBus) {
  return (_req: Request, res: Response) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    const send = (e: object) => {
      res.write(`data: ${JSON.stringify(e)}\n\n`);
    };

    // Real ping event every 10s — observable client-side as an onmessage,
    // so the client's stale-stream watchdog can tell the difference between
    // a healthy quiet connection and a zombie one held open by a proxy.
    const keepalive = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: 'ping', ts: Date.now() })}\n\n`);
    }, 10000);

    bus.replay(send);
    const off = bus.subscribe(send);

    const close = () => {
      clearInterval(keepalive);
      off();
      try { res.end(); } catch { /* ignore */ }
    };

    res.req.on('close', close);
    res.req.on('aborted', close);
  };
}
