import { useEffect, useMemo, useRef, useState } from 'react';
import type { IdeaState } from '../types';

interface Props {
  ideas: Record<string, IdeaState>;
  pairFlashes: { winnerId: string; loserId: string; ts: number }[];
  recentEloDeltas: { ideaId: string; delta: number; ts: number }[];
  selectedId?: string | null;
  onSelect: (id: string | null) => void;
}

const FLASH_MS = 900;

interface Camera { x: number; y: number; zoom: number; }

export function OrbitalView({ ideas, pairFlashes, recentEloDeltas, selectedId, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 0.8 });
  const [autoFollow, setAutoFollow] = useState(true);
  const dragging = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  // Resize observer
  useEffect(() => {
    const el = canvasRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-follow camera: aim at the centroid of the top N ideas by Elo.
  useEffect(() => {
    if (!autoFollow) return;
    const ids = Object.values(ideas).filter((s) => s.alive);
    if (ids.length === 0) return;
    const top = [...ids].sort((a, b) => b.elo - a.elo).slice(0, Math.max(3, Math.ceil(ids.length * 0.2)));
    const cx = top.reduce((s, i) => s + i.position.x, 0) / top.length;
    const cy = top.reduce((s, i) => s + i.position.y, 0) / top.length;
    setCamera((prev) => {
      const lerp = 0.06;
      const aliveCount = ids.length;
      const targetZoom = aliveCount > 80 ? 0.5 : aliveCount > 30 ? 0.85 : aliveCount > 10 ? 1.2 : 1.7;
      return {
        x: prev.x + (cx - prev.x) * lerp,
        y: prev.y + (cy - prev.y) * lerp,
        zoom: prev.zoom + (targetZoom - prev.zoom) * lerp,
      };
    });
  }, [autoFollow, ideas]);

  // Render loop
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size.w * dpr;
    cv.height = size.h * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let last = Date.now();

    const flashLookup: Map<string, number> = new Map();
    for (const f of pairFlashes) {
      const ts = f.ts;
      flashLookup.set(f.winnerId, Math.max(flashLookup.get(f.winnerId) ?? 0, ts));
      flashLookup.set(f.loserId, Math.max(flashLookup.get(f.loserId) ?? 0, ts));
    }

    const draw = () => {
      const now = Date.now();
      const dt = now - last;
      last = now;
      void dt;

      // Background
      ctx.fillStyle = '#0a0c14';
      ctx.fillRect(0, 0, size.w, size.h);

      // Subtle grid for orientation
      ctx.save();
      ctx.translate(size.w / 2, size.h / 2);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);

      // Concentric category ring guide
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1 / camera.zoom;
      for (const r of [200, 380, 560]) {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      }

      // Pair connection flashes
      for (const f of pairFlashes) {
        const age = now - f.ts;
        if (age > FLASH_MS) continue;
        const a = ideas[f.winnerId];
        const b = ideas[f.loserId];
        if (!a || !b) continue;
        const alpha = 1 - age / FLASH_MS;
        ctx.strokeStyle = `rgba(255, 240, 180, ${0.6 * alpha})`;
        ctx.lineWidth = 2 / camera.zoom;
        ctx.beginPath();
        ctx.moveTo(a.position.x, a.position.y);
        ctx.lineTo(b.position.x, b.position.y);
        ctx.stroke();
      }

      // Ideas as orbs
      const list = Object.values(ideas);
      // Draw dead first (so alive are on top)
      list.sort((a, b) => Number(a.alive) - Number(b.alive));
      for (const s of list) {
        const ratingNorm = Math.max(0, Math.min(1, (s.elo - 1100) / 400));
        const r = 6 + ratingNorm * 14;

        // Halo for selected
        if (s.idea.id === selectedId) {
          ctx.beginPath();
          ctx.arc(s.position.x, s.position.y, r + 8, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.1)';
          ctx.fill();
        }

        // Recent flash glow
        const lastDuel = flashLookup.get(s.idea.id);
        if (lastDuel) {
          const age = now - lastDuel;
          if (age < FLASH_MS) {
            const a = 1 - age / FLASH_MS;
            ctx.beginPath();
            ctx.arc(s.position.x, s.position.y, r + 6, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 240, 180, ${0.35 * a})`;
            ctx.fill();
          }
        }

        ctx.beginPath();
        ctx.arc(s.position.x, s.position.y, r, 0, Math.PI * 2);
        if (s.alive) {
          ctx.fillStyle = s.color;
          ctx.globalAlpha = 0.95;
        } else {
          ctx.fillStyle = '#444';
          ctx.globalAlpha = 0.35;
        }
        ctx.fill();
        ctx.globalAlpha = 1;

        // Label only for big-enough or selected
        if (camera.zoom > 1.0 || s.idea.id === selectedId || ratingNorm > 0.7) {
          ctx.fillStyle = s.alive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)';
          ctx.font = `${12 / camera.zoom}px -apple-system, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(s.idea.pitch.slice(0, 30), s.position.x, s.position.y - r - 6 / camera.zoom);
        }
      }

      ctx.restore();

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [ideas, pairFlashes, size, camera, selectedId]);

  // Pan / zoom / click handlers
  const screenToWorld = (sx: number, sy: number) => ({
    x: (sx - size.w / 2) / camera.zoom + camera.x,
    y: (sy - size.h / 2) / camera.zoom + camera.y,
  });

  const onMouseDown = (e: React.MouseEvent) => {
    setAutoFollow(false);
    dragging.current = { x: e.clientX, y: e.clientY, cx: camera.x, cy: camera.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const d = dragging.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / camera.zoom;
    const dy = (e.clientY - d.y) / camera.zoom;
    setCamera((c) => ({ ...c, x: d.cx - dx, y: d.cy - dy }));
  };
  const onMouseUp = (e: React.MouseEvent) => {
    if (dragging.current) {
      const moved = Math.hypot(e.clientX - dragging.current.x, e.clientY - dragging.current.y);
      if (moved < 4) {
        // treat as click
        const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
        const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        let best: { id: string; d: number } | null = null;
        for (const s of Object.values(ideas)) {
          const dd = Math.hypot(s.position.x - w.x, s.position.y - w.y);
          if (best === null || dd < best.d) best = { id: s.idea.id, d: dd };
        }
        if (best && best.d < 30) onSelect(best.id);
        else onSelect(null);
      }
    }
    dragging.current = null;
  };
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setAutoFollow(false);
    const factor = Math.exp(-e.deltaY * 0.001);
    setCamera((c) => ({ ...c, zoom: Math.min(4, Math.max(0.2, c.zoom * factor)) }));
  };

  const stats = useMemo(() => {
    const all = Object.values(ideas);
    return {
      total: all.length,
      alive: all.filter((i) => i.alive).length,
      avgElo: all.length === 0 ? 1200 : all.reduce((s, i) => s + i.elo, 0) / all.length,
    };
  }, [ideas]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', cursor: dragging.current ? 'grabbing' : 'grab' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { dragging.current = null; }}
        onWheel={onWheel}
      />
      <div style={{
        position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8, alignItems: 'center',
        background: 'rgba(20,22,30,0.7)', padding: '6px 10px', borderRadius: 6, fontSize: 12,
      }}>
        <span style={{ opacity: 0.6 }}>cam {camera.zoom.toFixed(2)}x</span>
        <button onClick={() => setAutoFollow((v) => !v)} style={btnStyle(autoFollow)}>
          {autoFollow ? 'auto-follow on' : 'auto-follow off'}
        </button>
        <button onClick={() => { setCamera({ x: 0, y: 0, zoom: 0.8 }); }} style={btnStyle(false)}>reset</button>
      </div>
      <div style={{
        position: 'absolute', bottom: 10, left: 12,
        background: 'rgba(20,22,30,0.7)', padding: '6px 10px', borderRadius: 6, fontSize: 12,
        display: 'flex', gap: 14,
      }}>
        <span>{stats.alive}/{stats.total} alive</span>
        <span>avg elo {stats.avgElo.toFixed(0)}</span>
        <span>{recentEloDeltas[0] ? `Δ${recentEloDeltas[0].delta > 0 ? '+' : ''}${recentEloDeltas[0].delta.toFixed(0)}` : ''}</span>
      </div>
    </div>
  );
}

function btnStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? '#2a3550' : '#1a1d28',
    color: '#dfe3ee',
    border: '1px solid #2a3550',
    borderRadius: 4,
    padding: '3px 8px',
    fontSize: 11,
    cursor: 'pointer',
  };
}
