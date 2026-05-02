import type { CSSProperties } from 'react';

interface Props {
  items: { msg: string; ts: number; kind: string }[];
}

const KIND_COLOR: Record<string, string> = {
  phase: '#7CC4FF',
  duel: '#FFE066',
  kill: '#FF8A8A',
  champ: '#FFE066',
  done: '#86E2A2',
};

export function Ticker({ items }: Props) {
  const recent = items.slice(-12).reverse();
  return (
    <div style={{ padding: 12, fontSize: 11, fontFamily: 'ui-monospace, monospace', overflow: 'hidden' }}>
      <div style={{ opacity: 0.6, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Ticker</div>
      {recent.map((it, i) => (
        <div key={i} style={tickerRow(it.kind, i)}>
          <span style={{ opacity: 0.4, marginRight: 6 }}>{new Date(it.ts).toLocaleTimeString().slice(0, 8)}</span>
          {it.msg}
        </div>
      ))}
    </div>
  );
}

function tickerRow(kind: string, i: number): CSSProperties {
  return {
    color: KIND_COLOR[kind] ?? '#dfe3ee',
    opacity: Math.max(0.3, 1 - i * 0.07),
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginBottom: 2,
  };
}
