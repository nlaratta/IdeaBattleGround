import { useEffect, useState } from 'react';

export interface TournamentSummary {
  id: string;
  startedAt: number;
  completedAt: number | null;
  phase: string;
  ideaCount: number;
  championIds: string[];
}

interface Props {
  currentId?: string | null;
  onLoad: (id: string) => void;
  onLive: () => void;
  reloadKey?: number;
}

const PHASE_COLOR: Record<string, string> = {
  complete: '#86E2A2',
  crashed: '#FF8A8A',
  generating: '#7CC4FF',
  rubric: '#7CC4FF',
  pairwise: '#FFE066',
  deep: '#B49BFF',
};

export function History({ currentId, onLoad, onLive, reloadKey }: Props) {
  const [items, setItems] = useState<TournamentSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/tournaments')
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setItems(d.tournaments ?? []); })
      .catch((e) => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  return (
    <div style={{ padding: 12, fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1 }}>History</span>
        <button onClick={onLive} style={btn(currentId === null)}>live</button>
      </div>
      {error && <div style={{ color: '#FF8A8A', fontSize: 11 }}>{error}</div>}
      {items.length === 0 && !error && <div style={{ opacity: 0.4 }}>—</div>}
      {items.map((t) => {
        const dt = new Date(t.startedAt);
        const stamp = `${dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
        return (
          <div
            key={t.id}
            onClick={() => onLoad(t.id)}
            style={{
              display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 6px',
              borderRadius: 4, cursor: 'pointer',
              background: currentId === t.id ? '#1f253a' : 'transparent',
              marginBottom: 2,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: PHASE_COLOR[t.phase] ?? '#dfe3ee', fontFamily: 'ui-monospace, monospace' }}>
                {t.id.slice(0, 6)}
              </span>
              <span style={{ opacity: 0.5 }}>{stamp}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.6, fontSize: 11 }}>
              <span>{t.phase}</span>
              <span>{t.ideaCount} ideas · {t.championIds.length} champ</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function btn(active: boolean): React.CSSProperties {
  return {
    background: active ? '#3a4f7a' : '#1a1d28',
    color: '#dfe3ee',
    border: '1px solid #2a3550',
    borderRadius: 4,
    padding: '3px 10px',
    fontSize: 11,
    cursor: 'pointer',
  };
}
