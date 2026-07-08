// Debrief tests. scoreBreakdown must decompose into terms that sum to the
// same total scorePlayerState produces, and debriefAnalysis must read the
// governance story (margin, driver, safety penalties) off real numbers.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  scoreBreakdown, debriefAnalysis, scorePlayerState,
  SCORE_PENALTY_VIO,
} from "../src/sim/economy.js";

function player(over = {}) {
  return {
    iceDeposited: 0, ice: 0, volatiles: 0, extraRovers: [],
    assetPts: 0, scoreAdjustments: 0, safetyViolations: 0, ...over,
  };
}

test("scoreBreakdown terms sum to scorePlayerState total", () => {
  const p = player({ iceDeposited: 120, ice: 40, assetPts: 6, scoreAdjustments: 12, safetyViolations: 2 });
  const b = scoreBreakdown(p);
  const sum = b.terms.reduce((s, t) => s + t.value, 0);
  assert.ok(Math.abs(sum - b.total) < 1e-9, "terms should sum to total");
  assert.ok(Math.abs(b.total - scorePlayerState(p)) < 1e-9, "breakdown total matches scorePlayerState");
});

test("scoreBreakdown labels the five terms with correct signs", () => {
  const b = scoreBreakdown(player({ iceDeposited: 100, assetPts: 4, safetyViolations: 1 }));
  const t = Object.fromEntries(b.terms.map(x => [x.key, x.value]));
  assert.equal(t.banked, 100);
  assert.equal(t.assets, 60);          // 4 * 15
  assert.equal(t.penalty, -SCORE_PENALTY_VIO); // 1 violation
  assert.ok(t.penalty < 0, "penalty is negative");
});

test("debrief: clean safety record is praised as the cooperative outcome", () => {
  const a = debriefAnalysis(player({ iceDeposited: 200 }), player({ iceDeposited: 150 }));
  assert.equal(a.winner, 1);
  assert.ok(a.findings.some(f => f.tone === "good" && /safety zone/i.test(f.text)),
    "should note neither violated a safety zone");
});

test("debrief: violations are flagged and tied to the margin", () => {
  // Actor II loses largely due to violations; penalty should exceed the margin.
  const p1 = player({ iceDeposited: 200 });
  const p2 = player({ iceDeposited: 210, safetyViolations: 1 }); // -25 -> 185 net
  const a = debriefAnalysis(p1, p2);
  assert.equal(a.winner, 1, "Actor I wins after II's penalty");
  assert.ok(a.findings.some(f => f.tone === "bad" && /violation/i.test(f.text)));
  assert.ok(a.findings.some(f => /part of why they lost|exceeds/i.test(f.text)),
    "ties the penalty to the loss");
});

test("debrief: identifies the winner's main score driver", () => {
  const p1 = player({ iceDeposited: 300 });   // banked dominates
  const p2 = player({ iceDeposited: 50 });
  const a = debriefAnalysis(p1, p2);
  assert.ok(a.findings.some(f => f.tone === "good" && /ice delivery|banked/i.test(f.text)));
});

test("debrief: a tie is reported as a dead heat", () => {
  const a = debriefAnalysis(player({ iceDeposited: 100 }), player({ iceDeposited: 100 }));
  assert.equal(a.winner, 0);
  assert.ok(a.findings.some(f => /dead heat/i.test(f.text)));
});

test("debrief: positive inject choices on both sides are noted", () => {
  const a = debriefAnalysis(
    player({ iceDeposited: 100, scoreAdjustments: 14 }),
    player({ iceDeposited: 90, scoreAdjustments: 10 }),
  );
  assert.ok(a.findings.some(f => f.tone === "good" && /inject/i.test(f.text)));
});
