import type { IdeaState } from '../types';
import type { ActiveDuel } from '../hooks/useTournament';

interface Props {
  duel: ActiveDuel;
  ideas: Record<string, IdeaState>;
  taunt?: string;
}

// DOM-anchored duel card. Positioned at the top-center of the canvas with a
// safe top margin so it can't clip off-screen at any camera angle.
export function DuelCard({ duel, ideas, taunt }: Props) {
  const a = ideas[duel.aId];
  const b = ideas[duel.bId];
  if (!a || !b) return null;

  const resolved = !!duel.winnerId;
  const winner = duel.winnerId === a.idea.id ? a : duel.winnerId === b.idea.id ? b : null;

  return (
    <div style={{
      position: 'absolute', top: 56, left: '50%', transform: 'translateX(-50%)',
      pointerEvents: 'none', zIndex: 6,
      maxWidth: 'min(720px, 92vw)', width: 'min(720px, 92vw)',
    }}>
      <div style={{
        background: 'rgba(8,10,18,0.88)',
        backdropFilter: 'blur(14px)',
        border: `1px solid rgba(255,224,102,${resolved ? 0.55 : 0.3})`,
        borderRadius: 12,
        padding: '12px 16px',
        boxShadow: '0 12px 48px rgba(0,0,0,0.45)',
        textAlign: 'center',
        transition: 'border-color 380ms ease',
      }}>
        <div style={{ fontSize: 11, letterSpacing: 4, fontWeight: 700, opacity: 0.65 }}>
          {resolved ? 'RESULT · ROUND ' : 'DUEL · ROUND '}{duel.round}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'start', marginTop: 8 }}>
          <Side state={a} resolved={resolved} winner={winner === a} />
          <div style={{
            alignSelf: 'center', fontSize: 16, fontWeight: 700,
            color: resolved ? '#FFE066' : '#dfe3ee',
            opacity: resolved ? 1 : 0.55,
          }}>{resolved ? 'def.' : 'vs'}</div>
          <Side state={b} resolved={resolved} winner={winner === b} />
        </div>

        <div style={{ marginTop: 8, opacity: 0.5, fontSize: 10 }}>
          elo {a.elo.toFixed(0)} {duel.eloDelta && winner === a ? `(+${duel.eloDelta.toFixed(0)})` : duel.eloDelta && winner === b ? `(-${duel.eloDelta.toFixed(0)})` : ''}
          {' · '}
          elo {b.elo.toFixed(0)} {duel.eloDelta && winner === b ? `(+${duel.eloDelta.toFixed(0)})` : duel.eloDelta && winner === a ? `(-${duel.eloDelta.toFixed(0)})` : ''}
        </div>

        {resolved && duel.reason && (
          <div style={{
            marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.07)',
            fontSize: 12, opacity: 0.85,
          }}>
            <span style={{ opacity: 0.6 }}>judge: </span>{duel.reason}
          </div>
        )}

        {!resolved && taunt && (
          <div style={{
            marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.07)',
            fontSize: 12, fontStyle: 'italic', color: '#FFE066', opacity: 0.92,
          }}>
            "{taunt}"
          </div>
        )}
      </div>
    </div>
  );
}

function Side({ state, resolved, winner }: { state: IdeaState; resolved: boolean; winner: boolean }) {
  const dimmed = resolved && !winner;
  return (
    <div style={{ opacity: dimmed ? 0.45 : 1, transition: 'opacity 360ms ease', position: 'relative' }}>
      {resolved && winner && (
        <div style={{
          position: 'absolute', top: -8, right: 0,
          fontSize: 9, letterSpacing: 1.5, fontWeight: 800,
          color: '#FFE066', textShadow: '0 0 12px rgba(255,224,102,0.7)',
        }}>★ WINNER</div>
      )}
      <div style={{ color: state.color, fontWeight: 700, fontSize: 14, lineHeight: 1.25 }}>
        {state.idea.pitch}
      </div>
      <div style={{ opacity: 0.7, fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
        {state.idea.mechanism.length > 140 ? state.idea.mechanism.slice(0, 137) + '…' : state.idea.mechanism}
      </div>
    </div>
  );
}
