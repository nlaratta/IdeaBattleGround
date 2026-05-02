import { useEffect, useMemo, useState } from 'react';
import { useTournament } from './hooks/useTournament';
import { OrbitalView3D } from './views/OrbitalView3D';
import { UniverseView } from './views/UniverseView';
import { TreeView } from './views/TreeView';
import { Leaderboard } from './components/Leaderboard';
import { Ticker } from './components/Ticker';
import { Inspector } from './components/Inspector';
import { Controls } from './components/Controls';
import { History } from './components/History';
import { PhaseChyron } from './components/PhaseChyron';
import { BreakingNews } from './components/BreakingNews';
import { ChampionReveal } from './components/ChampionReveal';

type View = 'universe' | 'orbital' | 'tree';

export function App() {
  const { state, start, loadHistorical, goLive } = useTournament();
  const [view, setView] = useState<View>('universe');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [historicalId, setHistoricalId] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [revealTrigger, setRevealTrigger] = useState(0);
  const [revealStep, setRevealStep] = useState<{ ideaId: string; phase: 'in' | 'hold' | 'out' } | null>(null);
  const selected = selectedId ? state.ideas[selectedId] ?? null : null;

  // Refresh history list whenever a tournament completes.
  useEffect(() => {
    if (state.phase === 'complete' || state.phase === 'idle') {
      setHistoryKey((k) => k + 1);
    }
  }, [state.phase]);

  // Trigger champion reveal reel when a tournament completes (and we have champions).
  const lastCompleteTs = state.completeTs;
  useEffect(() => {
    if (lastCompleteTs && state.champions.length > 0) {
      setRevealTrigger((k) => k + 1);
    }
  }, [lastCompleteTs, state.champions.length]);

  const totalIdeas = state.totalIdeas;
  const aliveCount = state.aliveCount;
  const breaking = useMemo(() => state.breakingNews, [state.breakingNews]);

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const cols = [
    leftOpen ? '300px' : '32px',
    '1fr',
    rightOpen ? '280px' : '32px',
  ].join(' ');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, height: '100vh', transition: 'grid-template-columns 180ms ease' }}>
      <aside style={panel('left')}>
        <CollapseTab side="left" open={leftOpen} onToggle={() => setLeftOpen((v) => !v)} />
        {leftOpen && (
          <>
            <Header phase={state.phase} round={state.round} count={state.totalIdeas} alive={state.aliveCount} historicalId={historicalId} />
            <Controls phase={state.phase} onStart={start} defaultCinematic={view === 'universe'} />
            <div style={{ borderTop: '1px solid #1c2030' }}>
              <Leaderboard ideas={state.ideas} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
            <div style={{ borderTop: '1px solid #1c2030', flex: 1, overflowY: 'auto' }}>
              <Inspector state={selected} />
            </div>
          </>
        )}
      </aside>

      <main style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 5, display: 'flex', gap: 4, background: 'rgba(20,22,30,0.7)', padding: 4, borderRadius: 6 }}>
          <ViewBtn label="universe" active={view === 'universe'} onClick={() => setView('universe')} />
          <ViewBtn label="orbital" active={view === 'orbital'} onClick={() => setView('orbital')} />
          <ViewBtn label="tree" active={view === 'tree'} onClick={() => setView('tree')} />
        </div>
        {view === 'universe' ? (
          <>
            <UniverseView
              ideas={state.ideas}
              pairFlashes={state.pairFlashes}
              killBursts={state.killBursts}
              champions={state.champions}
              activeDuel={state.activeDuel}
              taunts={state.taunts}
              reveal={revealStep}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <PhaseChyron phase={state.phase} round={state.round} alive={aliveCount} total={totalIdeas} cinematic={state.cinematic} />
            <BreakingNews items={breaking} />
            <ChampionReveal
              trigger={revealTrigger}
              champions={state.champions}
              ideas={state.ideas}
              onActiveChange={setRevealStep}
              onDone={() => setRevealStep(null)}
            />
          </>
        ) : view === 'orbital' ? (
          <OrbitalView3D
            ideas={state.ideas}
            pairFlashes={state.pairFlashes}
            recentEloDeltas={state.recentEloDeltas}
            killBursts={state.killBursts}
            champions={state.champions}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        ) : (
          <TreeView ideas={state.ideas} champions={state.champions} selectedId={selectedId} onSelect={setSelectedId} />
        )}
      </main>

      <aside style={panel('right')}>
        <CollapseTab side="right" open={rightOpen} onToggle={() => setRightOpen((v) => !v)} />
        {rightOpen && (
          <>
            <History
              currentId={historicalId}
              onLoad={async (id) => { setHistoricalId(id); setSelectedId(null); await loadHistorical(id); }}
              onLive={() => { setHistoricalId(null); setSelectedId(null); goLive(); }}
              reloadKey={historyKey}
            />
            <div style={{ borderTop: '1px solid #1c2030' }}>
              <Ticker items={state.ticker} />
            </div>
            {state.champions.length > 0 && (
              <div style={{ padding: 12, borderTop: '1px solid #1c2030' }}>
                <div style={{ opacity: 0.6, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1, fontSize: 12 }}>Champions</div>
                {state.champions.map((id) => {
                  const s = state.ideas[id];
                  if (!s) return null;
                  return (
                    <div key={id} style={{ marginBottom: 4, fontSize: 12, color: '#FFE066' }}>
                      🏆 {s.idea.pitch} <span style={{ opacity: 0.6 }}>({s.elo.toFixed(0)})</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function panel(side: 'left' | 'right'): React.CSSProperties {
  return {
    background: '#0d1018',
    borderRight: side === 'left' ? '1px solid #1c2030' : 'none',
    borderLeft: side === 'right' ? '1px solid #1c2030' : 'none',
    overflowY: 'auto',
    overflowX: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  };
}

function Header({ phase, round, count, alive, historicalId }: { phase: string; round: number; count: number; alive: number; historicalId: string | null }) {
  return (
    <div style={{ padding: 12, borderBottom: '1px solid #1c2030' }}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>
        Idea Battleground
        {historicalId && <span style={{ opacity: 0.5, fontWeight: 400, fontSize: 11, marginLeft: 6 }}>viewing {historicalId.slice(0, 6)}</span>}
      </div>
      <div style={{ opacity: 0.6, fontSize: 11, marginTop: 4 }}>
        phase: <span style={{ color: '#7CC4FF' }}>{phase}</span> · round {round} · {alive}/{count} alive
      </div>
    </div>
  );
}

function CollapseTab({ side, open, onToggle }: { side: 'left' | 'right'; open: boolean; onToggle: () => void }) {
  const arrow = side === 'left' ? (open ? '‹' : '›') : (open ? '›' : '‹');
  return (
    <button onClick={onToggle} style={{
      position: 'absolute',
      top: 8,
      [side === 'left' ? 'right' : 'left']: 4,
      zIndex: 10,
      width: 22, height: 22,
      background: '#1a1d28', color: '#dfe3ee',
      border: '1px solid #2a2e3a', borderRadius: 4,
      cursor: 'pointer', fontSize: 14, lineHeight: '18px', padding: 0,
    } as React.CSSProperties}>{arrow}</button>
  );
}

function ViewBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      background: active ? '#3a4f7a' : 'transparent',
      color: '#dfe3ee',
      border: 'none',
      padding: '4px 12px',
      borderRadius: 4,
      cursor: 'pointer',
      fontSize: 12,
      fontWeight: active ? 600 : 400,
    }}>{label}</button>
  );
}
