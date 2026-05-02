import { useState } from 'react';

export interface ModelChoice {
  generator: string;
  judge: string;
  deepJudge: string;
  taunt: string;
}

interface Props {
  phase: string;
  onStart: (opts: { ideaCount: number; judgesPerIdea: number; swissRounds: number; finalists: number; cinematic?: boolean; mock?: boolean; duelMs?: number; models?: ModelChoice }) => void;
  defaultCinematic?: boolean;
}

const MODEL_OPTIONS = ['haiku', 'sonnet', 'opus'] as const;

export function Controls({ phase, onStart, defaultCinematic }: Props) {
  const [ideaCount, setIdeaCount] = useState(20);
  const [judgesPerIdea, setJudgesPerIdea] = useState(2);
  const [swissRounds, setSwissRounds] = useState(3);
  const [finalists, setFinalists] = useState(4);
  const [cinematic, setCinematic] = useState(defaultCinematic ?? true);
  const [duelMs, setDuelMs] = useState(2500);
  const [mock, setMock] = useState(false);
  const [models, setModels] = useState<ModelChoice>({ generator: 'sonnet', judge: 'sonnet', deepJudge: 'opus', taunt: 'haiku' });
  const [showModels, setShowModels] = useState(false);

  const running = phase !== 'idle' && phase !== 'complete';
  const setModel = (k: keyof ModelChoice) => (v: string) => setModels((m) => ({ ...m, [k]: v }));

  return (
    <div style={{ padding: 12, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Controls</div>
      <Row label="ideas" value={ideaCount} onChange={setIdeaCount} min={4} max={500} step={2} />
      <Row label="judges/idea" value={judgesPerIdea} onChange={setJudgesPerIdea} min={1} max={5} />
      <Row label="swiss rounds" value={swissRounds} onChange={setSwissRounds} min={1} max={8} />
      <Row label="finalists" value={finalists} onChange={setFinalists} min={2} max={16} />
      {cinematic && <Row label="duel ms" value={duelMs} onChange={setDuelMs} min={500} max={6000} step={250} />}
      <ToggleRow label="cinematic" value={cinematic} onChange={setCinematic} />
      <ToggleRow label="mock (this run)" value={mock} onChange={setMock} />

      <div style={{ marginTop: 4, paddingTop: 6, borderTop: '1px solid #1c2030' }}>
        <button
          onClick={() => setShowModels((v) => !v)}
          style={{
            background: 'transparent', color: '#dfe3ee', border: 'none', cursor: 'pointer',
            padding: 0, fontSize: 11, opacity: 0.7, letterSpacing: 1, textTransform: 'uppercase',
          }}
        >
          {showModels ? '▾' : '▸'} Models
        </button>
        {showModels && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <SelectRow label="generator" value={models.generator} onChange={setModel('generator')} options={MODEL_OPTIONS} />
            <SelectRow label="rubric/pair" value={models.judge} onChange={setModel('judge')} options={MODEL_OPTIONS} />
            <SelectRow label="deep judge" value={models.deepJudge} onChange={setModel('deepJudge')} options={MODEL_OPTIONS} />
            <SelectRow label="taunt" value={models.taunt} onChange={setModel('taunt')} options={MODEL_OPTIONS} />
          </div>
        )}
      </div>

      <button
        disabled={running}
        onClick={() => onStart({ ideaCount, judgesPerIdea, swissRounds, finalists, cinematic, mock, duelMs, models })}
        style={{
          marginTop: 6,
          background: running ? '#2a2e3a' : '#3a4f7a',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '8px 12px',
          cursor: running ? 'not-allowed' : 'pointer',
          fontWeight: 600,
        }}
      >{running ? `running… (${phase})` : 'start tournament'}</button>
    </div>
  );
}

function SelectRow({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 110, opacity: 0.7 }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          background: '#1a1d28',
          color: '#dfe3ee',
          border: '1px solid #2a3550',
          borderRadius: 4,
          padding: '3px 6px',
          fontSize: 11,
        }}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 110, opacity: 0.7 }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        style={{
          background: value ? '#3a4f7a' : '#1a1d28',
          color: '#dfe3ee',
          border: '1px solid #2a3550',
          borderRadius: 4,
          padding: '3px 10px',
          fontSize: 11,
          cursor: 'pointer',
        }}
      >{value ? 'on' : 'off'}</button>
    </div>
  );
}

function Row({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number; }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 90, opacity: 0.7 }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1 }} />
      <span style={{ width: 36, textAlign: 'right', fontFamily: 'ui-monospace, monospace', opacity: 0.85 }}>{value}</span>
    </div>
  );
}
