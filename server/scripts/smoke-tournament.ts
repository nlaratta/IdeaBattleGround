import { runTournament } from '../src/runner.js';
import { globalBus } from '../src/events/bus.js';

const counts: Record<string, number> = {};
globalBus.subscribe((e) => {
  counts[e.type] = (counts[e.type] ?? 0) + 1;
});

const t = await runTournament({ ideaCount: 24, judgesPerIdea: 2, swissRounds: 4, finalists: 4 }, globalBus);

const ideas = Object.values(t.ideas);
const alive = ideas.filter((i) => i.alive);
const sorted = [...ideas].sort((a, b) => b.elo - a.elo);

console.log('\n=== smoke results ===');
console.log('event counts:', counts);
console.log('phase:', t.phase, 'round:', t.round);
console.log('total ideas:', ideas.length, 'alive:', alive.length, 'champions:', t.champions.length);
console.log('top 5 by elo:');
for (const s of sorted.slice(0, 5)) {
  console.log(`  ${s.idea.pitch.padEnd(28)} elo=${s.elo.toFixed(0)} mean=${s.meanScore.toFixed(2)} ${s.alive ? '(alive)' : '(killed r' + s.killedInRound + ')'}`);
}
console.log('champions:');
for (const id of t.champions) {
  const s = t.ideas[id];
  console.log(`  -> ${s.idea.pitch} (elo ${s.elo.toFixed(0)})`);
}
