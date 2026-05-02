import { useMemo } from 'react';
import type { IdeaState } from '../types';

interface Props {
  ideas: Record<string, IdeaState>;
  champions: string[];
  selectedId?: string | null;
  onSelect: (id: string | null) => void;
}

// Simple bracket/columns view: sort survivors of each "round" into columns
// going left → right. v1 just stratifies by killedInRound (0 = alive, 1 = rubric cull, etc.)
// More elaborate lineage rendering will come once we add mutation/crossover rounds.

export function TreeView({ ideas, champions, selectedId, onSelect }: Props) {
  const columns = useMemo(() => {
    const groups: Record<string, IdeaState[]> = {};
    for (const s of Object.values(ideas)) {
      const key = s.alive ? 'alive' : `r${s.killedInRound ?? 0}`;
      (groups[key] ||= []).push(s);
    }
    const order = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'alive'];
    return order
      .filter((k) => groups[k]?.length)
      .map((k) => ({
        key: k,
        label: k === 'alive' ? 'Survivors' : k === 'r0' ? 'Duplicates' : `Round ${k.slice(1)}`,
        ideas: [...groups[k]].sort((a, b) => b.elo - a.elo),
      }));
  }, [ideas]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', overflowX: 'auto', overflowY: 'auto', padding: 16, gap: 16, background: '#0a0c14' }}>
      {columns.map((col) => (
        <div key={col.key} style={{ display: 'flex', flexDirection: 'column', minWidth: 260, gap: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1 }}>{col.label} — {col.ideas.length}</div>
          {col.ideas.map((s) => {
            const isChamp = champions.includes(s.idea.id);
            return (
              <div
                key={s.idea.id}
                onClick={() => onSelect(s.idea.id)}
                style={{
                  background: selectedId === s.idea.id ? '#1f253a' : 'rgba(20,22,30,0.7)',
                  border: `1px solid ${isChamp ? '#FFE066' : s.alive ? s.color : '#2a2e3a'}`,
                  borderRadius: 8,
                  padding: 10,
                  cursor: 'pointer',
                  opacity: s.alive ? 1 : 0.5,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontWeight: 600, color: s.color, fontSize: 13 }}>
                    {isChamp ? '🏆 ' : ''}{s.idea.pitch}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>{s.elo.toFixed(0)}</div>
                </div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>{s.idea.mechanism.slice(0, 90)}{s.idea.mechanism.length > 90 ? '…' : ''}</div>
                <div style={{ fontSize: 10, opacity: 0.5, marginTop: 6, display: 'flex', gap: 8 }}>
                  <span>μ {s.meanScore.toFixed(1)}</span>
                  <span>W {s.wins}</span>
                  <span>L {s.losses}</span>
                  <span>{s.idea.category}</span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
