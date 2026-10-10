import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeIdeas } from '../src/judging/dedup.js';
import { makeIdea } from './helpers.js';

const base = makeIdea('1', 'Lantern Ledger', 'Local-first ledger that reconciles receipts for solo founders offline', 'solo founders');

test('keeps distinct ideas', () => {
  const other = makeIdea('2', 'Thicket Radio', 'Mesh radio that relays trail conditions between hikers', 'backcountry hikers');
  const { kept, killed } = dedupeIdeas([base, other]);
  assert.equal(kept.length, 2);
  assert.equal(killed.length, 0);
});

test('kills exact and near-duplicate ideas, keeping the first', () => {
  const exact = makeIdea('2', base.pitch, base.mechanism, base.targetUser);
  const near = makeIdea('3', 'Lantern Ledger', 'Local-first ledger that reconciles receipts for solo founders offline always', 'solo founders');
  const { kept, killed } = dedupeIdeas([base, exact, near]);
  assert.deepEqual(kept.map((i) => i.id), ['1']);
  assert.deepEqual(killed.map((i) => i.id), ['2', '3']);
});

test('threshold controls strictness', () => {
  const sibling = makeIdea('2', 'Lantern Ledger', 'Local-first ledger that reconciles invoices for freelance designers online', 'freelance designers');
  assert.equal(dedupeIdeas([base, sibling], 0.99).killed.length, 0);
  assert.equal(dedupeIdeas([base, sibling], 0.1).killed.length, 1);
});

test('empty input', () => {
  assert.deepEqual(dedupeIdeas([]), { kept: [], killed: [] });
});
