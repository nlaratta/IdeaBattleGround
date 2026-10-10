import { useEffect, useState } from 'react';

export interface ModelChoice {
  generator: string;
  judge: string;
  deepJudge: string;
  taunt: string;
}

interface TemplateInfo {
  id: string;
  name: string;
  description: string;
}

interface Props {
  phase: string;
  onStart: (opts: { ideaCount: number; judgesPerIdea: number; swissRounds: number; finalists: number; cinematic?: boolean; streamMode?: boolean; mock?: boolean; duelMs?: number; lingerMs?: number; models?: ModelChoice; template?: string; extraConstraints?: string }) => void;
  defaultCinematic?: boolean;
}

const MODEL_OPTIONS = ['haiku', 'sonnet', 'opus'] as const;

export function Controls({ phase, onStart, defaultCinematic }: Props) {
  const [ideaCount, setIdeaCount] = useState(20);
  const [judgesPerIdea, setJudgesPerIdea] = useState(2);
  const [swissRounds, setSwissRounds] = useState(3);
  const [finalists, setFinalists] = useState(4);
  const [cinematic, setCinematic] = useState(defaultCinematic ?? true);
  const [streamMode, setStreamMode] = useState(false);
  const [duelMs, setDuelMs] = useState(2500);
  const [lingerMs, setLingerMs] = useState(2500);
  const [mock, setMock] = useState(true);
  const [models, setModels] = useState<ModelChoice>({ generator: 'sonnet', judge: 'sonnet', deepJudge: 'opus', taunt: 'haiku' });
  const [showModels, setShowModels] = useState(false);
  const [showStream, setShowStream] = useState(true);

  // Idea-recipe controls
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [template, setTemplate] = useState('default');
  const [extraConstraints, setExtraConstraints] = useState('');
  const [showRecipe, setShowRecipe] = useState(true);

  // Follow the server's MOCK_MODE by default so the first click never
  // silently flips a mock install into a live (billed) run.
  useEffect(() => {
    let cancel = false;
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => { if (!cancel && typeof d.mockMode === 'boolean') setMock(d.mockMode); })
      .catch(() => { /* offline-tolerant */ });
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    let cancel = false;
    fetch('/api/templates')
      .then((r) => r.json())
      .then((d) => { if (!cancel) setTemplates(d.templates ?? []); })
      .catch(() => { /* offline-tolerant */ });
    return () => { cancel = true; };
  }, []);

  const running = phase !== 'idle' && phase !== 'complete';
  const setModel = (k: keyof ModelChoice) => (v: string) => setModels((m) => ({ ...m, [k]: v }));
  const tplInfo = templates.find((t) => t.id === template);

  return (
    <div style={{ padding: 12, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Controls</div>
      <Row label="ideas" value={ideaCount} onChange={setIdeaCount} min={4} max={500} step={2} />
      <Row label="judges/idea" value={judgesPerIdea} onChange={setJudgesPerIdea} min={1} max={5} />
      <Row label="swiss rounds" value={swissRounds} onChange={setSwissRounds} min={1} max={8} />
      <Row label="finalists" value={finalists} onChange={setFinalists} min={2} max={16} />
      <ToggleRow label="mock (this run)" value={mock} onChange={setMock} />

      <div style={{ marginTop: 4, paddingTop: 6, borderTop: '1px solid #1c2030' }}>
        <button
          onClick={() => setShowRecipe((v) => !v)}
          style={{
            background: 'transparent', color: '#dfe3ee', border: 'none', cursor: 'pointer',
            padding: 0, fontSize: 11, opacity: 0.7, letterSpacing: 1, textTransform: 'uppercase',
          }}
        >
          {showRecipe ? '▾' : '▸'} Idea Recipe
        </button>
        {showRecipe && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SelectRow
              label="template"
              value={template}
              onChange={setTemplate}
              options={templates.length > 0 ? templates.map((t) => t.id) : ['default']}
              labelMap={Object.fromEntries(templates.map((t) => [t.id, t.name]))}
            />
            {tplInfo && (
              <div style={{ fontSize: 10, opacity: 0.55, marginLeft: 110, lineHeight: 1.4 }}>
                {tplInfo.description}
              </div>
            )}
            <div>
              <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>extra constraints</div>
              <textarea
                value={extraConstraints}
                onChange={(e) => setExtraConstraints(e.target.value)}
                placeholder='e.g. "must be addressable via paid search; b2b SaaS only"'
                rows={3}
                style={{
                  width: '100%', resize: 'vertical', minHeight: 56,
                  background: '#1a1d28', color: '#dfe3ee',
                  border: '1px solid #2a3550', borderRadius: 4,
                  padding: '6px 8px', fontSize: 11, fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 4, paddingTop: 6, borderTop: '1px solid #1c2030' }}>
        <button
          onClick={() => setShowStream((v) => !v)}
          style={{
            background: 'transparent', color: '#dfe3ee', border: 'none', cursor: 'pointer',
            padding: 0, fontSize: 11, opacity: 0.7, letterSpacing: 1, textTransform: 'uppercase',
          }}
        >
          {showStream ? '▾' : '▸'} Stream Settings
        </button>
        {showStream && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <ToggleRow label="cinematic" value={cinematic} onChange={setCinematic} />
            <ToggleRow label="stream mode" value={streamMode} onChange={(v) => { setStreamMode(v); if (v) setCinematic(true); }} />
            {cinematic && <Row label="duel ms" value={duelMs} onChange={setDuelMs} min={500} max={8000} step={250} />}
            {cinematic && <Row label="linger ms" value={lingerMs} onChange={setLingerMs} min={0} max={8000} step={250} />}
            <div style={{ fontSize: 10, opacity: 0.45, marginTop: 4, lineHeight: 1.4 }}>
              {streamMode
                ? 'Every duel is shown one at a time, with linger after the result. Slow but readable; the right pick when streaming.'
                : cinematic
                  ? 'Cinematic with adaptive pacing: serial below 12 alive, parallel above. Good for idea generation.'
                  : 'Fast as possible. No animation pacing.'}
            </div>
          </div>
        )}
      </div>

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
        onClick={() => onStart({ ideaCount, judgesPerIdea, swissRounds, finalists, cinematic, streamMode, mock, duelMs, lingerMs, models, template, extraConstraints })}
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

function SelectRow({ label, value, onChange, options, labelMap }: { label: string; value: string; onChange: (v: string) => void; options: readonly string[]; labelMap?: Record<string, string> }) {
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
          <option key={opt} value={opt}>{labelMap?.[opt] ?? opt}</option>
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
