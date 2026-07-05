import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectBeatgrid,
  integratedLoudness,
  loudnessTrimGain,
  nextBeatTime,
  nextDownbeatTime,
  nextPhraseTime,
  phraseFloorTime,
  nearestDownbeatTime,
} from '../dist/index.js';

const RATE = 44100;

/**
 * Synthetic club track: kick on every beat (accented on beat 1), offbeat
 * hats and an eighth-note bass — enough harmonics to tempt an octave error.
 */
function makeClickTrack({ bpm, offset, seconds, rate = RATE }) {
  const n = Math.floor(seconds * rate);
  const out = new Float32Array(n);
  const spb = 60 / bpm;

  const addBurst = (t, freq, amp, decaySec) => {
    const start = Math.floor(t * rate);
    const len = Math.floor(decaySec * rate);
    for (let i = 0; i < len && start + i < n; i++) {
      const env = Math.exp(-i / (decaySec * rate * 0.3));
      out[start + i] += amp * env * Math.sin((2 * Math.PI * freq * i) / rate);
    }
  };

  for (let beat = 0; ; beat++) {
    const t = offset + beat * spb;
    if (t >= seconds - 0.1) break;
    const isDownbeat = beat % 4 === 0;
    addBurst(t, 55, isDownbeat ? 1.0 : 0.6, 0.12); // kick, accent on beat 1
    addBurst(t + spb / 2, 6000, 0.15, 0.03); // offbeat hat
    addBurst(t + spb / 2, 110, 0.2, 0.05); // eighth-note bass ghost
  }
  return out;
}

for (const bpm of [90, 128, 174]) {
  test(`detectBeatgrid finds ${bpm} BPM without octave errors`, () => {
    const offset = 0.37;
    const audio = makeClickTrack({ bpm, offset, seconds: 40 });
    const grid = detectBeatgrid(audio, RATE);

    assert.ok(Math.abs(grid.bpm - bpm) <= 0.5, `expected ~${bpm}, got ${grid.bpm}`);

    // Phase must land on the click grid (modulo one beat).
    const spb = 60 / bpm;
    const phaseErr = Math.min(
      Math.abs(((grid.firstBeatOffset - offset) % spb + spb) % spb),
      spb - Math.abs(((grid.firstBeatOffset - offset) % spb + spb) % spb),
    );
    assert.ok(phaseErr <= 0.025, `beat phase off by ${(phaseErr * 1000).toFixed(1)} ms`);
  });
}

test('detectBeatgrid locates the accented downbeat', () => {
  const bpm = 126;
  const offset = 0.5;
  const audio = makeClickTrack({ bpm, offset, seconds: 40 });
  const grid = detectBeatgrid(audio, RATE);
  const bar = (60 / bpm) * 4;
  const err = Math.min(
    Math.abs(((grid.firstDownbeatOffset - offset) % bar + bar) % bar),
    bar - Math.abs(((grid.firstDownbeatOffset - offset) % bar + bar) % bar),
  );
  assert.ok(err <= 0.03, `downbeat off by ${(err * 1000).toFixed(1)} ms`);
});

test('integratedLoudness matches BS.1770 reference tones', () => {
  const seconds = 5;
  const sine = (amp) => {
    const x = new Float32Array(seconds * RATE);
    for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin((2 * Math.PI * 997 * i) / RATE);
    return x;
  };
  // Full-scale 997 Hz sine ≈ -3.7 LUFS at unity K-weighting gain.
  assert.ok(Math.abs(integratedLoudness([sine(1)], RATE) - -3.7) <= 0.6);
  // -20 dB lower amplitude → exactly 20 LU lower.
  const a = integratedLoudness([sine(1)], RATE);
  const b = integratedLoudness([sine(0.1)], RATE);
  assert.ok(Math.abs(a - b - 20) <= 0.2, `expected 20 LU gap, got ${(a - b).toFixed(2)}`);
});

test('loudnessTrimGain moves tracks towards the target and clamps at ±9 dB', () => {
  assert.equal(loudnessTrimGain(undefined), 1);
  // -20 LUFS track → +6 dB towards -14.
  assert.ok(Math.abs(loudnessTrimGain(-20) - 10 ** (6 / 20)) < 1e-9);
  // -40 LUFS track → clamped at +9 dB.
  assert.ok(Math.abs(loudnessTrimGain(-40) - 10 ** (9 / 20)) < 1e-9);
});

test('beatgrid quantization helpers', () => {
  const grid = { bpm: 120, firstBeatOffset: 0.25, firstDownbeatOffset: 0.75, beatsPerBar: 4 };
  // 120 BPM → 0.5 s per beat, bar = 2 s, 16-beat phrase = 8 s.
  assert.equal(nextBeatTime(grid, 1.0), 1.25);
  assert.equal(nextBeatTime(grid, 1.25), 1.25); // already on a beat
  assert.equal(nextDownbeatTime(grid, 1.0), 2.75);
  assert.equal(nextPhraseTime(grid, 1.0), 8.75);
  assert.equal(phraseFloorTime(grid, 10.0), 8.75);
  assert.equal(phraseFloorTime(grid, 0.1), 0.75); // clamps at first downbeat
  assert.equal(nearestDownbeatTime(grid, 2.9), 2.75);
});

test('planTransition quantizes the mix point to a phrase and the entry to a downbeat', async () => {
  const { planTransition } = await import('../dist/index.js');
  const mkTrack = (over) => ({
    id: 't', title: 't', artist: 'a', genre: 'techno', bpm: 128, key: '8A',
    energy: 0.7, duration: 240, popularity: 0.5, mood: 'dark', year: 2025,
    source: 'upload', sections: [], seed: 0, ...over,
  });
  const current = mkTrack({
    beatgrid: { bpm: 128, firstBeatOffset: 0.2, firstDownbeatOffset: 0.2, beatsPerBar: 4 },
  });
  const next = mkTrack({
    id: 'n',
    beatgrid: { bpm: 127.5, firstBeatOffset: 0.43, firstDownbeatOffset: 0.9, beatsPerBar: 4 },
  });

  for (let i = 0; i < 20; i++) {
    const plan = planTransition(current, next, { personality: 'techno' });
    // Mix start must sit on a 16-beat phrase boundary of the outgoing grid.
    const spb = 60 / 128;
    const mixStart = current.duration - plan.startBeforeEnd;
    const rel = (mixStart - 0.2) / (16 * spb);
    assert.ok(Math.abs(rel - Math.round(rel)) < 1e-6, `mix start ${mixStart} not on a phrase`);
    // Entry point must sit on a downbeat of the incoming grid.
    const bar = (60 / 127.5) * 4;
    const relIn = (plan.incomingOffset - 0.9) / bar;
    assert.ok(Math.abs(relIn - Math.round(relIn)) < 1e-6, `entry ${plan.incomingOffset} not on a downbeat`);
  }
});
