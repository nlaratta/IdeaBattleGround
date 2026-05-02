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

  return (
    <div style={{
      position: 'absolute', top: '38%', left: 0, right: 0,
      pointerEvents: 'none', textAlign: 'center',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0) scale(1)' : 'translateY(-14px) scale(0.96)',
      transition: 'opacity 380ms ease, transform 380ms ease',
      zIndex: 6,
    }}>
      <div style={{
        display: 'inline-block',
        background: 'rgba(8,10,18,0.78)',
        backdropFilter: 'blur(14px)',
        border: '1px solid rgba(255,255,255,0.09)',
        padding: '16px 36px', borderRadius: 12,
        fontSize: 26, letterSpacing: 5, fontWeight: 700,
        color: '#dfe3ee',
        textShadow: '0 0 30px rgba(124,196,255,0.55)',
      }}>
        {text}
        {sub && (
          <div style={{ fontSize: 12, letterSpacing: 1, opacity: 0.55, marginTop: 8, fontWeight: 400, fontStyle: 'italic' }}>
            {sub}
          </div>
        )}
        <div style={{ fontSize: 11, letterSpacing: 1.5, opacity: 0.45, marginTop: 8, fontWeight: 400 }}>
          {alive}/{total} alive {cinematic ? '· cinematic mode' : ''}
        </div>
      </div>
    </div>
  );
}
