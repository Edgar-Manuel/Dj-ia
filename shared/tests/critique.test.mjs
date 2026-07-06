import test from 'node:test';
import assert from 'node:assert/strict';
import { critiqueMix, planTransition } from '../dist/index.js';

const mk = (over) => ({
  id: 't', title: 't', artist: 'a', genre: 'techno', bpm: 128, key: '8A',
  energy: 0.7, duration: 240, popularity: 0.5, mood: 'dark', year: 2025,
  source: 'demo', sections: [], seed: 1, ...over,
});

const basePlan = (over) => ({
  type: 'smooth-blend', beats: 16, startBeforeEnd: 32, incomingOffset: 0,
  reason: 'test', ...over,
});

test('opener (no current track) is always accepted', () => {
  const c = critiqueMix(null, mk(), basePlan(), { personality: 'house' });
  assert.equal(c.verdict, 'accept');
  assert.equal(c.issues.length, 0);
});

test('rejects a BPM jump outside the sync window', () => {
  const current = mk({ bpm: 128 });
  const next = mk({ id: 'n', bpm: 150 }); // ~17% away
  const c = critiqueMix(current, next, basePlan(), { personality: 'house' });
  assert.equal(c.verdict, 'reject');
  assert.ok(c.issues.some((i) => i.code === 'tempo-far' && i.severity === 'fatal'));
});

test('accepts a clean half/double-time mix', () => {
  const current = mk({ bpm: 140 });
  const next = mk({ id: 'n', bpm: 70 }); // exact half time
  const c = critiqueMix(current, next, basePlan(), { personality: 'house' });
  assert.notEqual(c.verdict, 'reject');
  const tempoIssue = c.issues.find((i) => i.code === 'tempo-far');
  assert.ok(!tempoIssue || tempoIssue.severity === 'warn');
});

test('masks a harmonic clash by switching a clean blend to an FX transition', () => {
  const current = mk({ key: '8A' });
  const next = mk({ id: 'n', key: '3B' }); // clashing key, compat 0.1
  const c = critiqueMix(current, next, basePlan({ type: 'smooth-blend' }), { personality: 'house' });
  assert.equal(c.verdict, 'adjust');
  assert.notEqual(c.transition.type, 'smooth-blend');
  assert.ok(['reverb-tail', 'echo-out', 'filter-sweep', 'delay-throw'].includes(c.transition.type));
  assert.ok(c.issues.some((i) => i.code === 'harmonic-clash'));
});

test('a cautious personality refuses a hard tonal clash outright', () => {
  const current = mk({ key: '8A' });
  const next = mk({ id: 'n', key: '3B' });
  // commercial: risk 0.25 < 0.5 → fatal on a compat-0.1 clash.
  const c = critiqueMix(current, next, basePlan({ type: 'smooth-blend' }), { personality: 'commercial' });
  assert.equal(c.verdict, 'reject');
  assert.ok(c.issues.some((i) => i.code === 'harmonic-clash' && i.severity === 'fatal'));
});

test('warns on a loudness jump the trim cannot close', () => {
  const current = mk({ lufs: -8 });   // very loud → trims down to -14
  const next = mk({ id: 'n', lufs: -30 }); // very quiet → clamps at -21 (+9 dB)
  const c = critiqueMix(current, next, basePlan(), { personality: 'house' });
  assert.ok(c.issues.some((i) => i.code === 'loudness-jump' && i.severity === 'warn'));
});

test('a compatible, matched pair passes clean', () => {
  const current = mk({ bpm: 128, key: '8A', lufs: -14, energy: 0.6 });
  const next = mk({ id: 'n', bpm: 129, key: '9A', lufs: -14, energy: 0.62 });
  const plan = planTransition(current, next, { personality: 'techno' });
  const c = critiqueMix(current, next, plan, { personality: 'techno', targetEnergy: 0.6 });
  assert.equal(c.verdict, 'accept');
  assert.equal(c.issues.length, 0);
});
