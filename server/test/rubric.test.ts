import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meanTotal, selectRubricSurvivors } from '../src/judging/rubric.js';
import { extractJson } from '../src/util/json.js';

test('meanTotal averages judge totals', () => {
  assert.equal(meanTotal([{ total: 4 }, { total: 6 }, { total: 8 }]), 6);
});

test('meanTotal is 0, not NaN, when every judge failed', () => {
  assert.equal(meanTotal([]), 0);
});

test('rubric cull keeps the top 40% by mean score', () => {
  const states = Array.from({ length: 20 }, (_, i) => ({ id: i, meanScore: i }));
  const kept = selectRubricSurvivors(states, 2);
  assert.equal(kept.length, 8);
  assert.deepEqual(kept.map((s) => s.id), [19, 18, 17, 16, 15, 14, 13, 12]);
});

test('rubric cull never drops below the finalist count', () => {
  const states = Array.from({ length: 10 }, (_, i) => ({ meanScore: i }));
  assert.equal(selectRubricSurvivors(states, 6).length, 6);
  assert.equal(selectRubricSurvivors(states, 50).length, 10);
});

test('extractJson handles fences, prose and nesting', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('```json\n{"a":{"b":[1,2]}}\n```'), { a: { b: [1, 2] } });
  assert.deepEqual(extractJson('Sure! Here you go: {"s":"has } brace"} hope that helps'), { s: 'has } brace' });
  assert.throws(() => extractJson('no json here'));
});
