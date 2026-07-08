// Tests for the diplomacy-session timing helpers (v176).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conveneSession, sessionActive, sessionTimeLeftMs, sessionProgress,
  formatSessionClock, sessionConvenerLabel, shouldAutoConvene, interactionSatisfied,
  DIPLOMACY_DEFAULT_MS, DIPLOMACY_MIN_MS, DIPLOMACY_MAX_MS,
} from "../src/sim/diplomacy.js";

test("conveneSession: sets until = now + duration and clamps", () => {
  const s = conveneSession(3, { durationMs: 120_000, now: 1000 });
  assert.equal(s.round, 3);
  assert.equal(s.startedAt, 1000);
  assert.equal(s.until, 1000 + 120_000);
  assert.equal(s.ended, false);
  // Below floor clamps up; above ceiling clamps down.
  assert.equal(conveneSession(1, { durationMs: 1, now: 0 }).durationMs, DIPLOMACY_MIN_MS);
  assert.equal(conveneSession(1, { durationMs: 9e9, now: 0 }).durationMs, DIPLOMACY_MAX_MS);
});

test("conveneSession: default duration", () => {
  const s = conveneSession(1, { now: 0 });
  assert.equal(s.durationMs, DIPLOMACY_DEFAULT_MS);
});

test("sessionActive: true while time remains, false when ended or elapsed", () => {
  const s = conveneSession(1, { durationMs: 60_000, now: 0 });
  assert.equal(sessionActive(s, 30_000), true);
  assert.equal(sessionActive(s, 60_001), false);
  assert.equal(sessionActive({ ...s, ended: true }, 1), false);
  assert.equal(sessionActive(null, 0), false);
});

test("sessionTimeLeftMs + clock formatting", () => {
  const s = conveneSession(1, { durationMs: 90_000, now: 0 });
  assert.equal(sessionTimeLeftMs(s, 0), 90_000);
  assert.equal(sessionTimeLeftMs(s, 30_000), 60_000);
  assert.equal(sessionTimeLeftMs(s, 999_999), 0);
  assert.equal(formatSessionClock(90_000), "1:30");
  assert.equal(formatSessionClock(5_000), "0:05");
  assert.equal(formatSessionClock(0), "0:00");
  assert.equal(formatSessionClock(-50), "0:00");
});

test("sessionProgress: 0 at start, 1 at/after end", () => {
  const s = conveneSession(1, { durationMs: 100_000, now: 0 });
  assert.equal(sessionProgress(s, 0), 0);
  assert.equal(sessionProgress(s, 50_000), 0.5);
  assert.equal(sessionProgress(s, 200_000), 1);
});

test("sessionConvenerLabel: actor vs facilitator", () => {
  const nameFor = (i) => (i === 0 ? "Artemis" : "Selene");
  assert.equal(sessionConvenerLabel(conveneSession(1, { convenedBy: 0 }), nameFor), "Artemis");
  assert.equal(sessionConvenerLabel(conveneSession(1, { convenedBy: 1 }), nameFor), "Selene");
  assert.equal(sessionConvenerLabel(conveneSession(1, { convenedBy: "facilitator" }), nameFor), "Facilitator");
  assert.equal(sessionConvenerLabel(null), "");
});

test("shouldAutoConvene: disabled at 0, skips round 1, fires every N", () => {
  assert.equal(shouldAutoConvene(3, 0), false);   // disabled
  assert.equal(shouldAutoConvene(1, 2), false);   // never round 1
  assert.equal(shouldAutoConvene(3, 2), true);    // (3-1)%2==0
  assert.equal(shouldAutoConvene(5, 2), true);    // (5-1)%2==0
  assert.equal(shouldAutoConvene(4, 2), false);   // (4-1)%2!=0
  assert.equal(shouldAutoConvene(4, 3), true);    // (4-1)%3==0
});

test("interactionSatisfied: gate only matters when required", () => {
  assert.equal(interactionSatisfied(0, false), true);  // not required
  assert.equal(interactionSatisfied(0, true), false);  // required, none held
  assert.equal(interactionSatisfied(1, true), true);   // required, one held
});
