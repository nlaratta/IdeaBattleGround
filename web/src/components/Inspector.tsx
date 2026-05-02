import type { IdeaState } from '../types';

interface Props {
  state: IdeaState | null;
}

export function Inspector({ state }: Props) {
  if (!state) {
    return (
      <div style={{ padding: 12, fontSize: 12, opacity: 0.5 }}>
        Click an orb or list row to inspect.
      </div>
    );
  }
  const i = state.idea;
  return (
    <div style={{ padding: 12, fontSize: 12, lineHeight: 1.45 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: state.color }}>{i.pitch}</div>
      <div style={{ opacity: 0.7, fontSize: 11, marginTop: 2 }}>
        elo {state.elo.toFixed(0)} · μ {state.meanScore.toFixed(2)} · W{state.wins} L{state.losses} {state.alive ? '' : '· eliminated'}
      </div>
      <div style={{ marginTop: 10 }}><b style={{ opacity: 0.6 }}>Mechanism. </b>{i.mechanism}</div>
      <div style={{ marginTop: 6 }}><b style={{ opacity: 0.6 }}>For. </b>{i.targetUser}</div>
      <div style={{ marginTop: 6 }}><b style={{ opacity: 0.6 }}>Why now. </b>{i.whyNow}</div>
      <div style={{ marginTop: 6 }}><b style={{ opacity: 0.6 }}>Risk. </b>{i.biggestRisk}</div>
      <div style={{ marginTop: 10, opacity: 0.6, fontSize: 11 }}>
        category {i.category} · tags [{i.tags.join(', ')}]
      </div>
      {state.scores.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ opacity: 0.6, fontSize: 11, marginBottom: 4 }}>Rubric</div>
          {state.scores.map((s, j) => (
            <div key={j} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, opacity: 0.85, marginBottom: 4 }}>
              N{s.novelty.toFixed(1)} F{s.feasibility.toFixed(1)} M{s.market.toFixed(1)} W{s.weirdness.toFixed(1)} B{s.buildability.toFixed(1)} → {s.total.toFixed(2)}
              <div style={{ opacity: 0.6, fontFamily: 'inherit', fontSize: 11, marginTop: 2 }}>{s.critique}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 12, fontSize: 10, opacity: 0.4 }}>
        cell: {i.cell.persona} / {i.cell.vibe} / {i.cell.constraint}
      </div>
    </div>
  );
}
