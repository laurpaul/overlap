import { test } from "node:test";
import assert from "node:assert/strict";
import {
  erodeTreatyFloor, treatyStage, treatyFloorEffects, treatyTrajectory,
  TREATY_FLOOR_INIT, FLOOR_MIN, DEFAULT_EROSION,
} from "../src/sim/treatyErosion.js";
import { INJECT_DECK } from "../src/sim/injects.js";

test("pressure erodes the floor; a cooperative round restores it; both clamp", () => {
  const f0 = TREATY_FLOOR_INIT;
  const eroded = erodeTreatyFloor(f0, 1);
  assert.ok(eroded < f0, "positive pressure lowers the floor");
  assert.ok(eroded >= FLOOR_MIN);
  // negative pressure (cooperative/norm-reinforcing) raises it, capped at 1
  assert.ok(erodeTreatyFloor(0.7, -1) > 0.7);
  assert.equal(erodeTreatyFloor(1, -5), 1, "cannot exceed a fully-intact floor");
  assert.equal(erodeTreatyFloor(FLOOR_MIN, 50), FLOOR_MIN, "cannot fall below the minimum");
});

test("no single round can cliff the floor, the walk-back is gradual by construction", () => {
  // one enormous-pressure round only steps down by maxStepDown, not to the floor
  const after = erodeTreatyFloor(1, 1000);
  assert.ok(approx(after, 1 - DEFAULT_EROSION.maxStepDown), `capped step, got ${after}`);
  assert.ok(after > 0.8, "still intact after a single bad round");
});

test("stages band the floor", () => {
  assert.equal(treatyStage(1.0), "intact");
  assert.equal(treatyStage(0.7), "fraying");
  assert.equal(treatyStage(0.4), "eroded");
  assert.equal(treatyStage(0.2), "collapsed");
});

test("floor effects: a lower floor weakens the violation penalty and rewards appropriation", () => {
  const full = treatyFloorEffects(1.0);
  const low = treatyFloorEffects(FLOOR_MIN);
  assert.ok(approx(full.violationPenaltyMult, 1.0));
  assert.equal(full.appropriationReward, 0);
  assert.ok(full.normIntact);
  assert.ok(low.violationPenaltyMult < 0.5, "penalty hollows out as the norm erodes");
  assert.ok(low.appropriationReward > 0, "appropriation starts paying");
  assert.ok(!low.normIntact);
  // monotonic: more erosion => weaker penalty
  assert.ok(treatyFloorEffects(0.9).violationPenaltyMult > treatyFloorEffects(0.5).violationPenaltyMult);
});

test("sustained moderate pressure erodes gradually and monotonically over several rounds", () => {
  const pressures = Array(12).fill(1); // one over-reach per round for 12 rounds
  const t = treatyTrajectory(pressures);
  // monotonically non-increasing
  for (let i = 1; i < t.floors.length; i++) assert.ok(t.floors[i] <= t.floors[i - 1] + 1e-9);
  assert.ok(t.finalFloor < 0.55, "the floor is well eroded after sustained pressure");
  // collapse is reached, but only after MULTIPLE rounds, not in round 1
  if (t.stageFirstReached.collapsed !== undefined) {
    assert.ok(t.stageFirstReached.collapsed > 1, "collapse is a slow walk-back, not a cliff");
  }
  // and a cooperative stretch can arrest / reverse it
  const recovered = treatyTrajectory([1, 1, 1, -1, -1, -1], 1.0);
  assert.ok(recovered.floors[6] > recovered.floors[3], "norm-reinforcing rounds claw the floor back");
});

test("the ost_walkback inject is in the deck and is well-formed", () => {
  const inj = INJECT_DECK.find((i) => i.id === "ost_walkback");
  assert.ok(inj, "ost_walkback inject exists");
  assert.equal(inj.choices.length, 3);
  const reinforce = inj.choices.find((c) => c.deltas.treatyErosion < 0);
  const exploit = inj.choices.find((c) => c.deltas.treatyErosion >= 2);
  assert.ok(reinforce, "a choice reinforces (recovers) the floor");
  assert.ok(exploit, "a choice erodes it further");
});

function approx(a, b, eps = 1e-9) { return Math.abs(a - b) < eps; }
