import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseDeezerTracks } from '../dist/services/trends/deezerProvider.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf-8'));

test('parses a /chart/*/tracks payload, using the explicit chart position as rank', () => {
  const { data } = fixture('deezer-chart.json');
  const tracks = parseDeezerTracks(data);
  assert.equal(tracks.length, 3);
  assert.deepEqual(tracks[0], {
    rank: 1,
    title: 'Dracula',
    artist: 'Tame Impala',
    previewUrl: data[0].preview,
  });
  assert.equal(tracks[1].artist, 'Shakira');
  assert.equal(tracks[2].rank, 3);
});

test('parses a /playlist/*/tracks payload, falling back to array order as rank', () => {
  const { data } = fixture('deezer-playlist.json');
  const tracks = parseDeezerTracks(data);
  assert.equal(tracks.length, 3);
  // Playlist tracks have no `position` field — rank must be derived from order.
  assert.deepEqual(
    tracks.map((t) => t.rank),
    [1, 2, 3],
  );
  assert.equal(tracks[1].artist, 'Quevedo');
  assert.equal(tracks[1].title, 'LA GRACIOSA');
});

test('drops entries with no title or no artist and keeps the rest', () => {
  const tracks = parseDeezerTracks([
    { title: 'Real Track', artist: { name: 'Real Artist' }, preview: 'x.mp3', position: 1 },
    { title: '', artist: { name: 'No Title' }, position: 2 },
    { title: 'No Artist', artist: {}, position: 3 },
    { title: 'Next One', artist: { name: 'Another Artist' }, position: 4 },
  ]);
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].title, 'Real Track');
  assert.equal(tracks[1].title, 'Next One');
});

test('prefers title_short over the full title (drops remix/version suffixes)', () => {
  const tracks = parseDeezerTracks([
    { title: 'Dracula (JENNIE Remix)', title_short: 'Dracula', artist: { name: 'Tame Impala' }, position: 1 },
  ]);
  assert.equal(tracks[0].title, 'Dracula');
});

test('returns an empty array for non-array input instead of throwing', () => {
  assert.deepEqual(parseDeezerTracks(undefined), []);
  assert.deepEqual(parseDeezerTracks(null), []);
  assert.deepEqual(parseDeezerTracks({ not: 'an array' }), []);
});
