import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedScore, updateElo, INITIAL_ELO } from '../src/judging/elo.js';

test('expectedScore is 0.5 for equal ratings and symmetric', () => {
  assert.equal(expectedScore(1200, 1200), 0.5);
  assert.ok(Math.abs(expectedScore(1400, 1200) + expectedScore(1200, 1400) - 1) < 1e-12);
  assert.ok(expectedScore(1400, 1200) > 0.75);
});

test('equal-rated win moves each side by K/2 and is zero-sum', () => {
  const { newA, newB, delta } = updateElo(INITIAL_ELO, INITIAL_ELO, 1);
  assert.equal(delta, 16);
  assert.equal(newA, 1216);
  assert.equal(newB, 1184);
  assert.ok(Math.abs(newA + newB - 2 * INITIAL_ELO) < 1e-9);
});

test('an upset pays more than an expected win', () => {
  const upset = updateElo(1000, 1400, 1).delta;
  const expected = updateElo(1400, 1000, 1).delta;
  assert.ok(upset > expected);
  assert.ok(expected > 0 && upset < 32);
});

test('a loss lowers the rating', () => {
  assert.ok(updateElo(1200, 1200, 0).newA < 1200);
});
