import type { Idea } from '../types.js';

// Lightweight near-duplicate detection. For v1 we use bag-of-words Jaccard
// over (pitch + mechanism + targetUser). Good enough to catch literal repeats
// and obvious paraphrases. Threshold is conservative so we don't kill genuine
// variations.

const STOPWORDS = new Set([
  'the','a','an','and','or','but','of','for','to','in','on','with','by','at','from',
  'is','are','was','were','be','been','being','this','that','these','those','it','its',
  'as','if','then','than','so','not','no','yes','do','does','did','have','has','had',
  'you','your','i','we','they','their','our','his','her','can','will','would','should',
  'about','into','out','up','down','over','under','app','platform','tool','using','use',
]);

function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function fingerprintText(idea: Idea): string {
  return `${idea.pitch}\n${idea.mechanism}\n${idea.targetUser}`;
}

export function dedupeIdeas(ideas: Idea[], threshold = 0.62): { kept: Idea[]; killed: Idea[] } {
  const kept: Idea[] = [];
  const killed: Idea[] = [];
  const fps: Set<string>[] = [];
  for (const idea of ideas) {
    const fp = tokens(fingerprintText(idea));
    let dupe = false;
    for (const existing of fps) {
      if (jaccard(fp, existing) >= threshold) { dupe = true; break; }
    }
    if (dupe) killed.push(idea);
    else { kept.push(idea); fps.push(fp); }
  }
  return { kept, killed };
}
