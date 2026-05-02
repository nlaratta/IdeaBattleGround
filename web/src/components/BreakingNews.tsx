import { useEffect, useState } from 'react';

export interface BreakingItem {
  id: string;
  kind: 'streak' | 'upset' | 'first-cull' | 'last-of-kind' | 'champion' | 'milestone';
  msg: string;
  detail?: string;
  ts: number;
}

interface Props {
  items: BreakingItem[]; // append-only; we display the most recent that hasn't expired
}

const LIFETIME_MS = 4500;

const KIND_BADGES: Record<BreakingItem['kind'], { label: string; color: string }> = {
  streak: { label: 'STREAK', color: '#7CC4FF' },
  upset: { label: 'UPSET', color: '#FF8A8A' },
  'first-cull': { label: 'FIRST OUT', color: '#FFC078' },
  'last-of-kind': { label: 'LAST OF KIND', color: '#B49BFF' },
  champion: { label: 'CHAMPION', color: '#FFE066' },
  milestone: { label: 'BREAKING', color: '#86E2A2' },
};

export function BreakingNews({ items }: Props) {
  const [active, setActive] = useState<BreakingItem | null>(null);

  // Watch for new items; show each for LIFETIME_MS, queue if overlapping.
  useEffect(() => {
    if (items.length === 0) return;
    const latest = items[items.length - 1];
    if (Date.now() - latest.ts > LIFETIME_MS) return;
    setActive(latest);
    const t = setTimeout(() => setActive(null), LIFETIME_MS);
    return () => clearTimeout(t);
  }, [items]);

  if (!active) return null;
  const badge = KIND_BADGES[active.kind];

  return (
    <div style={{
      position: 'absolute', bottom: 56, left: '50%', transform: 'translateX(-50%)',
      pointerEvents: 'none', zIndex: 5,
      animation: 'ibg-banner-in 380ms ease both',
    }}>
      <style>{`@keyframes ibg-banner-in { from { opacity: 0; transform: translate(-50%, 18px); } to { opacity: 1; transform: translate(-50%, 0); } }`}</style>
      <div style={{
        background: 'linear-gradient(90deg, rgba(8,10,18,0.92), rgba(20,24,38,0.92))',
        border: `1px solid ${badge.color}40`,
        borderLeft: `4px solid ${badge.color}`,
        padding: '10px 16px', borderRadius: 8,
        display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        backdropFilter: 'blur(10px)',
        maxWidth: 720,
      }}>
        <div style={{
          color: badge.color, fontSize: 10, letterSpacing: 1.5, fontWeight: 700,
          textTransform: 'uppercase', minWidth: 84,
        }}>{badge.label}</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#dfe3ee' }}>{active.msg}</div>
          {active.detail && (
            <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>{active.detail}</div>
          )}
        </div>
      </div>
    </div>
  );
}
