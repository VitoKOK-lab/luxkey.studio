import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuietSession } from '../app/meditation.js';

test('pausing preserves fractional elapsed time and excludes time until resume', () => {
  let now = 10_000;
  const session = createQuietSession(() => now);

  assert.deepEqual(session.toggle(), { minutes: 3, state: 'running', seconds: 0, remaining: 180 });
  now += 12_500;
  assert.deepEqual(session.toggle(), { minutes: 3, state: 'paused', seconds: 12.5, remaining: 168 });

  now += 300_000;
  assert.deepEqual(session.toggle(), { minutes: 3, state: 'running', seconds: 12.5, remaining: 168 });
  now += 2_500;
  assert.deepEqual(session.snapshot(), { minutes: 3, state: 'running', seconds: 15, remaining: 165 });
});

test('countdown completes at the duration boundary and can start a fresh session', () => {
  let now = 10_000;
  const session = createQuietSession(() => now);
  session.toggle();

  now += 179_999;
  assert.equal(session.snapshot().remaining, 1);
  assert.equal(session.snapshot().state, 'running');
  now += 1;
  assert.deepEqual(session.snapshot(), { minutes: 3, state: 'complete', seconds: 180, remaining: 0 });

  now += 60_000;
  assert.deepEqual(session.toggle(), { minutes: 3, state: 'running', seconds: 0, remaining: 180 });
});

test('a running session counts time without intermediate updates and clamps after expiry', () => {
  let now = 10_000;
  const session = createQuietSession(() => now);
  assert.equal(session.setMinutes(5), true);
  session.toggle();

  now += 420_000;
  assert.deepEqual(session.snapshot(), { minutes: 5, state: 'complete', seconds: 300, remaining: 0 });
  assert.equal(session.setMinutes(10), true);
  assert.deepEqual(session.snapshot(), { minutes: 10, state: 'ready', seconds: 0, remaining: 600 });
});

test('a pause click at expiry finishes the session instead of restarting it', () => {
  let now = 0;
  const session = createQuietSession(() => now);
  session.toggle();
  now = 180_010;
  assert.deepEqual(session.toggle(), { minutes: 3, state: 'complete', seconds: 180, remaining: 0 });
  assert.equal(session.toggle().state, 'running');
});

test('duration changes reject unsupported values and reset retains the chosen duration', () => {
  let now = 10_000;
  const session = createQuietSession(() => now);
  assert.deepEqual(session.snapshot(), { minutes: 3, state: 'ready', seconds: 0, remaining: 180 });
  for (const invalid of [0, 4, 11, '5', NaN]) assert.equal(session.setMinutes(invalid), false);
  assert.equal(session.snapshot().minutes, 3);

  assert.equal(session.setMinutes(10), true);
  session.toggle();
  now += 20_000;
  assert.equal(session.setMinutes(5), false);
  session.toggle();
  assert.equal(session.setMinutes(3), false);
  assert.deepEqual(session.reset(), { minutes: 10, state: 'ready', seconds: 0, remaining: 600 });

  now += 60_000;
  assert.deepEqual(session.toggle(), { minutes: 10, state: 'running', seconds: 0, remaining: 600 });
});
