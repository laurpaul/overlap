// v154: an eroded OST treaty floor weakens the safety-violation penalty, so
// crowding gets cheaper as the non-appropriation norm is walked back. These
// tests pin the two properties that make it safe to ship before a playtest:
// (1) it is a perfect no-op at the intact floor, and (2) the scoreBreakdown
// decomposition still sums to scorePlayerState once the floor erodes.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scorePlayerState, scoreBreakdown, makePlayer, SCORE_PENALTY_VIO,
} from "../src/sim/economy.js";
import { treatyFloorEffects } from "../src/sim/treatyErosion.js";

const withViolations = (treatyFloor) => {
  const p = makePlayer({ x: 600, y: 600 }, 1, "#fff");
  p.safetyViolations = 4;
  if (treatyFloor !== undefined) p.treatyFloor = treatyFloor;
  return p;
};

test("intact floor is a perfect no-op (no treatyFloor == floor 1.0)", () => {
  const none = withViolations(undefined);
  const full = withViolations(1.0);
  assert.equal(scorePlayerState(full), scorePlayerState(none));
  // And the penalty term is the full unscaled penalty.
  const pen = scoreBreakdown(none).terms.find(t => t.key === "penalty").value;
  assert.equal(pen, -4 * SCORE_PENALTY_VIO);
});

test("scoreBreakdown total still equals scorePlayerState once the floor erodes", () => {
  for (const f of [1.0, 0.8, 0.55, 0.3, 0.1]) {
    const p = withViolations(f);
    assert.ok(Math.abs(scoreBreakdown(p).total - scorePlayerState(p)) < 1e-9, `mismatch at floor ${f}`);
  }
});

test("eroding the floor weakens the penalty by exactly violationPenaltyMult", () => {
  for (const f of [0.8, 0.5, 0.2]) {
    const p = withViolations(f);
    const expected = -4 * SCORE_PENALTY_VIO * treatyFloorEffects(f).violationPenaltyMult;
    const pen = scoreBreakdown(p).terms.find(t => t.key === "penalty").value;
    assert.ok(Math.abs(pen - expected) < 1e-9, `penalty wrong at floor ${f}`);
  }
});

test("a more eroded floor strictly raises the score (crowding gets cheaper)", () => {
  const intact = scorePlayerState(withViolations(1.0));
  const fraying = scorePlayerState(withViolations(0.6));
  const collapsed = scorePlayerState(withViolations(0.1));
  assert.ok(fraying > intact, "fraying norm should cost less than intact");
  assert.ok(collapsed > fraying, "collapsed norm should cost least");
});

test("with no violations the floor has no effect at all", () => {
  const clean = (f) => { const p = makePlayer({ x: 600, y: 600 }, 1, "#fff"); p.safetyViolations = 0; p.treatyFloor = f; return p; };
  assert.equal(scorePlayerState(clean(1.0)), scorePlayerState(clean(0.1)));
});
