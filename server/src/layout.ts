import type { Idea } from './types.js';

// Cluster layout: each category gets a stable polar position; ideas within
// a category are jittered around that centroid. Good enough until we hook in
// real embeddings.

const CATEGORY_PALETTE: Record<string, string> = {
  productivity: '#7CC4FF',
  health:       '#86E2A2',
  food:         '#FFC078',
  edu:          '#B49BFF',
  social:       '#FF9CC2',
  finance:      '#FFE066',
  creative:     '#FF9F8A',
  travel:       '#7BE3D3',
  home:         '#C4B7A6',
  media:        '#E89BFF',
  devtools:     '#83D4FF',
  science:      '#9DEFE8',
  civic:        '#FFB199',
  climate:      '#7AD79C',
  safety:       '#FF8A8A',
  pets:         '#F5C77E',
  fitness:      '#A8E892',
  fashion:      '#F198C9',
  hardware:     '#9FB1FF',
  ai:           '#C19CFF',
  default:      '#B0B0B0',
};

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function categoryAngle(cat: string): number {
  const h = hashStr(cat);
  return (h % 1000) / 1000 * Math.PI * 2;
}

// Annular layout: each idea sits in its category's pie-slice but with a wide
// radial range so 100+ ideas don't pack into a single ring. Cluster appearance
// preserved (similar ideas spatial-clump) but density is readable.
const ANGULAR_HALF_WIDTH = 0.42;        // ~24° per category cluster (wider for visibility)
const RADIUS_INNER = 220;
const RADIUS_OUTER = 760;

export function categoryColor(cat: string): string {
  const key = cat.toLowerCase().trim();
  if (CATEGORY_PALETTE[key]) return CATEGORY_PALETTE[key];
  // Stable hash → HSL fallback so unfamiliar categories get distinct colors.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = ((h % 360) + 360) % 360;
  return `hsl(${hue}, 60%, 70%)`;
}

export function layoutIdea(idea: Idea): { x: number; y: number } {
  const baseAngle = categoryAngle(idea.category);
  const localA = hashStr(idea.id) / 0xffffffff;
  const localR = hashStr(idea.id + ':r') / 0xffffffff;
  const angle = baseAngle + (localA - 0.5) * (ANGULAR_HALF_WIDTH * 2);
  // sqrt to avoid clumping at the inner radius (uniform area distribution).
  const radius = RADIUS_INNER + Math.sqrt(localR) * (RADIUS_OUTER - RADIUS_INNER);
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}
