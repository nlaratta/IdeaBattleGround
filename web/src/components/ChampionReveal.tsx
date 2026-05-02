import { useEffect, useState } from 'react';
import type { IdeaState } from '../types';

export interface RevealStep {
  ideaId: string;
  phase: 'in' | 'hold' | 'out';
}

interface Props {
  champions: string[];
  ideas: Record<string, IdeaState>;
  trigger: number; // change this to (re)start; 0 = inactive
  onActiveChange: (step: RevealStep | null) => void;
  onDone: () => void;
}

const HOLD_MS = 5400;
const FADE_MS = 600;

// Sequenced reveal: for each champion, fade in card → hold → fade out → next.
export function ChampionReveal({ champions, ideas, trigger, onActiveChange, onDone }: Props) {
  const [idx, setIdx] = useState(-1);
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');

  useEffect(() => {
    if (!trigger) return;
    if (champions.length === 0) { onDone(); return; }
    setIdx(0);
    setPhase('in');
  }, [trigger, champions.length]);

  useEffect(() => {
    if (idx < 0 || idx >= champions.length) return;
    onActiveChange({ ideaId: champions[idx], phase });
    let timer: ReturnType<typeof setTimeout>;
    if (phase === 'in') {
      timer = setTimeout(() => setPhase('hold'), FADE_MS);
    } else if (phase === 'hold') {
      timer = setTimeout(() => setPhase('out'), HOLD_MS);
    } else {
      timer = setTimeout(() => {
        if (idx + 1 < champions.length) {
          setIdx(idx + 1);
          setPhase('in');
        } else {
          onActiveChange(null);
          setIdx(-1);
          onDone();
        }
      }, FADE_MS);
    }
    return () => clearTimeout(timer);
  }, [idx, phase, champions, onActiveChange, onDone]);

  if (idx < 0 || idx >= champions.length) return null;
  const s = ideas[champions[idx]];
  if (!s) return null;
  const visible = phase !== 'out';

  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 7,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.97)',
        transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
        background: 'linear-gradient(180deg, rgba(15,18,28,0.94), rgba(8,10,18,0.94))',
        border: `1px solid ${s.color}50`,
        borderTop: `3px solid ${s.color}`,
        borderRadius: 14,
        padding: '24px 32px 22px',
        maxWidth: 600,
        boxShadow: `0 16px 64px ${s.color}30, 0 0 80px rgba(255,224,102,0.2)`,
        backdropFilter: 'blur(14px)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 11, letterSpacing: 4, opacity: 0.55, fontWeight: 700, color: '#FFE066' }}>
          🏆 CHAMPION {idx + 1} OF {champions.length}
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: s.color, marginTop: 8, letterSpacing: 0.5 }}>
          {s.idea.pitch}
        </div>
        <div style={{ fontSize: 13, opacity: 0.85, marginTop: 14, lineHeight: 1.5 }}>
          {s.idea.mechanism}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16, fontSize: 11, opacity: 0.75, textAlign: 'left' }}>
          <div><b style={{ opacity: 0.6 }}>For. </b>{s.idea.targetUser}</div>
          <div><b style={{ opacity: 0.6 }}>Why now. </b>{s.idea.whyNow}</div>
          <div style={{ gridColumn: '1 / -1' }}><b style={{ opacity: 0.6 }}>Risk. </b>{s.idea.biggestRisk}</div>
        </div>
        <div style={{ marginTop: 14, fontSize: 11, opacity: 0.55 }}>
          elo {s.elo.toFixed(0)} · μ {s.meanScore.toFixed(2)} · W{s.wins} L{s.losses} · {s.idea.category}
        </div>
      </div>
    </div>
  );
}
