import { useMemo } from 'react';
import type { IdeaState } from '../types';

interface Props {
  ideas: Record<string, IdeaState>;
  selectedId?: string | null;
  onSelect: (id: string | null) => void;
}

export function Leaderboard({ ideas, selectedId, onSelect }: Props) {
  const top = useMemo(() => {
    return Object.values(ideas)
      .filter((s) => s.alive)
      .sort((a, b) => b.elo - a.elo)
      .slice(0, 10);
  }, [ideas]);

  return (
    <div style={{ padding: 12, fontSize: 12 }}>
      <div style={{ opacity: 0.6, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Leaderboard</div>
      {top.length === 0 && <div style={{ opacity: 0.4 }}>—</div>}
      {top.map((s, i) => (
        <div
          key={s.idea.id}
          onClick={() => onSelect(s.idea.id)}
          style={{
            display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 6px',
            borderRadius: 4, cursor: 'pointer',
            background: selectedId === s.idea.id ? '#1f253a' : 'transparent',
          }}
        >
          <span style={{ width: 18, opacity: 0.5 }}>{i + 1}</span>
          <span style={{ flex: 1, color: s.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.idea.pitch}
          </span>
          <span style={{ opacity: 0.7 }}>{s.elo.toFixed(0)}</span>
        </div>
      ))}
    </div>
  );
}
