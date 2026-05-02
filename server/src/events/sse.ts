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

    // Keepalive comment every 15s to defeat proxies
    const keepalive = setInterval(() => res.write(': keepalive\n\n'), 15000);

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
