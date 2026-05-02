import { useEffect, useRef, useState } from 'react';

interface Props {
  phase: string;
  round: number;
  alive: number;
  total: number;
  cinematic: boolean;
}

const LABELS: Record<string, string> = {
  generating: 'PHASE I · GENERATION',
  rubric: 'PHASE II · RUBRIC SCORING',
  culling: 'PHASE III · CULL',
  pairwise: 'PHASE IV · BATTLES',
  deep: 'PHASE V · FINAL JUDGMENT',
  complete: 'COMPLETE',
};

const SUB: Record<string, string> = {
  generating: 'agents fan out across a sampling matrix',
  rubric: 'every idea scored on five axes',
  culling: 'the bottom of the field falls away',
  pairwise: 'survivors duel, head to head',
  deep: 'the strongest are interrogated',
  complete: 'a story is told',
};

export function PhaseChyron({ phase, round, alive, total, cinematic }: Props) {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState('');
  const [sub, setSub] = useState('');
  const lastPhase = useRef('');

  useEffect(() => {
    if (phase === 'idle' || phase === lastPhase.current) return;
    lastPhase.current = phase;
    const label = LABELS[phase] ?? phase.toUpperCase();
    const isPairwiseRound = phase === 'pairwise' && round > 0;
    setText(isPairwiseRound ? `${label} · ROUND ${round}` : label);
    setSub(SUB[phase] ?? '');
    setVisible(true);
    const t = setTimeout(() => setVisible(false), cinematic ? 2400 : 1200);
    return () => clearTimeout(t);
  }, [phase, round, cinematic]);

  // Bottom-left compact chyron: doesn't overlap the duel card, doesn't
  // cover the whole canvas mid-action. Reads like a sports-broadcast
  // lower-third on the opposite corner from the breaking-news ticker.
  return (
    <div style={{
      position: 'absolute', bottom: 56, left: 18,
      pointerEvents: 'none',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateX(0)' : 'translateX(-14px)',
      transition: 'opacity 380ms ease, transform 380ms ease',
      zIndex: 6,
      maxWidth: 'min(420px, 40vw)',
    }}>
      <div style={{
        background: 'rgba(8,10,18,0.86)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(124,196,255,0.22)',
        borderLeft: '3px solid #7CC4FF',
        padding: '10px 16px', borderRadius: 8,
        color: '#dfe3ee',
      }}>
        <div style={{
          fontSize: 13, letterSpacing: 3, fontWeight: 700,
          textShadow: '0 0 20px rgba(124,196,255,0.4)',
        }}>{text}</div>
        {sub && (
          <div style={{ fontSize: 11, letterSpacing: 0.5, opacity: 0.6, marginTop: 4, fontStyle: 'italic' }}>
            {sub}
          </div>
        )}
        <div style={{ fontSize: 10, letterSpacing: 1, opacity: 0.5, marginTop: 4 }}>
          {alive}/{total} alive {cinematic ? '· cinematic mode' : ''}
        </div>
      </div>
    </div>
  );
}
