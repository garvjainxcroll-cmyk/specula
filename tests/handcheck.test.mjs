import test from 'node:test';
import assert from 'node:assert/strict';
import { runHandCheck } from '../scripts/handcheck.mjs';

test('hand check: three rounds of one fund recomputed from first principles match to the paisa', () => {
  const out = runHandCheck();
  for (const c of out.checks) assert.deepEqual(c.diffs, [], `Round ${c.q}`);
  assert.equal(out.score.ok, true, JSON.stringify(out.score));
  assert.equal(out.ok, true);
});
