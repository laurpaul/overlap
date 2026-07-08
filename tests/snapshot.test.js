import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSnapshot, getUndoSegmentKey } from "../src/sim/snapshot.js";
import { PHASE } from "../src/sim/constants.js";

test("buildSnapshot: deep-clones players and copies arrays", () => {
  const p1 = { x: 1, comsats: [{ x: 9, y: 9 }] };
  const craterHealth = new Float32Array([0.5, 0.6]);
  const claimR = [80, 80];
  const snap = buildSnapshot({
    round: 2, day: 3, globalDay: 10,
    claimR, powerGridState: { mode: "shared", offeredBy: 1, offeredTo: 2 },
    p1, p2: null,
    craterHealth, history: [{ e: 1 }],
    missionLogLength: 7, phase: PHASE.PLAYING,
  });
  // scalars carried
  assert.equal(snap.round, 2);
  assert.equal(snap.day, 3);
  assert.equal(snap.globalDay, 10);
  assert.equal(snap.logLength, 7);
  assert.equal(snap.phase, PHASE.PLAYING);
  // player deep-cloned (mutating snapshot doesn't touch original)
  snap.p1.comsats[0].x = 999;
  assert.equal(p1.comsats[0].x, 9);
  // arrays copied, not shared
  snap.claimR[0] = 1;
  assert.equal(claimR[0], 80);
  assert.notEqual(snap.craterHealth, craterHealth);
  const ch = Array.from(snap.craterHealth);
  assert.ok(Math.abs(ch[0] - 0.5) < 1e-6 && Math.abs(ch[1] - 0.6) < 1e-6);
  // powerGridState copied
  assert.deepEqual(snap.powerGridState, { mode: "shared", offeredBy: 1, offeredTo: 2 });
  // null player stays null
  assert.equal(snap.p2, null);
});

test("buildSnapshot: defaults phase to PLAYING and tolerates missing arrays", () => {
  const snap = buildSnapshot({ round: 1, day: 1, globalDay: 1, p1: null, p2: null });
  assert.equal(snap.phase, PHASE.PLAYING);
  assert.deepEqual(snap.claimR, []);
  assert.deepEqual(Array.from(snap.craterHealth), []);
  assert.deepEqual(snap.history, []);
});

test("getUndoSegmentKey: PLAYING and DONE use the play| key with turn detail", () => {
  const playing = getUndoSegmentKey({ phase: PHASE.PLAYING, round: 1, day: 2, globalDay: 3, activeTurn: 0, p1Done: true, p2Done: false });
  assert.equal(playing, "play|1|2|3|0|1|0");
  const done = getUndoSegmentKey({ phase: PHASE.DONE, round: 5, day: 1, globalDay: 20, activeTurn: 1, p1Done: false, p2Done: true });
  assert.equal(done, "play|5|1|20|1|0|1");
});

test("getUndoSegmentKey: non-play phases use the phase| key", () => {
  const setup = getUndoSegmentKey({ phase: PHASE.SETUP1, round: 0, day: 0, globalDay: 0 });
  assert.equal(setup, `phase|${PHASE.SETUP1}|0|0|0`);
  const settings = getUndoSegmentKey({ phase: PHASE.SETTINGS, round: 1, day: 1, globalDay: 1 });
  assert.equal(settings, `phase|${PHASE.SETTINGS}|1|1|1`);
});

test("getUndoSegmentKey: different turns/done-flags produce different keys", () => {
  const base = { phase: PHASE.PLAYING, round: 1, day: 1, globalDay: 1, activeTurn: 0, p1Done: false, p2Done: false };
  const a = getUndoSegmentKey(base);
  const b = getUndoSegmentKey({ ...base, activeTurn: 1 });
  const c = getUndoSegmentKey({ ...base, p1Done: true });
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  // same inputs -> same key (collapses within a step)
  assert.equal(a, getUndoSegmentKey({ ...base }));
});
