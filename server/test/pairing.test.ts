import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairSwiss, pairKey } from '../src/judging/pairwise.js';
import { makeState } from './helpers.js';

test('pairs adjacent ratings in descending Elo order', () => {
  const states = [makeState('c', 1100), makeState('a', 1300), makeState('d', 1000), makeState('b', 1200)];
  const pairs = pairSwiss(states).map(([x, y]) => [x.idea.id, y.idea.id]);
  assert.deepEqual(pairs, [['a', 'b'], ['c', 'd']]);
});

test('odd field gives the lowest-rated idea a bye', () => {
  const states = [makeState('a', 1300), makeState('b', 1200), makeState('c', 1100)];
  const pairs = pairSwiss(states);
  assert.equal(pairs.length, 1);
  assert.deepEqual([pairs[0][0].idea.id, pairs[0][1].idea.id], ['a', 'b']);
});

test('avoids rematches when an alternative exists', () => {
  const states = [makeState('a', 1300), makeState('b', 1200), makeState('c', 1100), makeState('d', 1000)];
  const played = new Set<string>();
  const r1 = pairSwiss(states, played);
  assert.deepEqual(r1.map(([x, y]) => pairKey(x.idea.id, y.idea.id)).sort(), ['a|b', 'c|d']);
  const r2 = pairSwiss(states, played);
  for (const [x, y] of r2) assert.ok(!['a|b', 'c|d'].includes(pairKey(x.idea.id, y.idea.id)));
  assert.equal(r2.length, 2);
});

test('falls back to a rematch when no fresh opponent remains', () => {
  const states = [makeState('a', 1300), makeState('b', 1200)];
  const played = new Set([pairKey('a', 'b')]);
  assert.equal(pairSwiss(states, played).length, 1);
});

test('pairKey is order independent', () => {
  assert.equal(pairKey('x', 'y'), pairKey('y', 'x'));
});
