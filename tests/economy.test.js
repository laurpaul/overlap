// Economy + scoring core tests. economy.js drives every budget, the per-round
// deltas, the composite mission score, and the debrief, and it had no direct
// test. These lock the formulas and the key invariants (notably that the score
// breakdown sums to exactly the composite score) so a future tweak can't quietly
// change scoring out from under the exercise.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcBudget, calcAssetCosts, calcCompetitiveness, padCostMultiplier,
  calcDeltaE, calcDeltaR, calcDeltaM, calcRdMineBonus, calcMilScore,
  makePlayer, activatePlayer,
  scorePlayerState, scoreBreakdown, debriefAnalysis, pickMergedGridState,
  ALLOC_PRESETS, DEFAULT_PRESET_KEY,
} from "../src/sim/economy.js";
import { ALPHA, E_INIT, STARTING_BUDGET, ASSET_POINTS, C_W1, C_W2, C_W3 } from "../src/sim/constants.js";

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test("calcBudget = ALPHA * E, with the E_INIT fallback", () => {
  assert.equal(calcBudget(E_INIT), Math.round(ALPHA * E_INIT));
  assert.equal(calcBudget(undefined), Math.round(ALPHA * E_INIT)); // null-ish → E_INIT
  assert.equal(calcBudget(0), 0);
});

test("competitiveness weights sum to 1 and a sole leader maxes out at C = 1", () => {
  assert.ok(approx(C_W1 + C_W2 + C_W3, 1), "the three weights must sum to 1");
  assert.equal(calcCompetitiveness(8, 3, 1, 8, 3, 1, 0), 1);
});

test("competitiveness clamps to [0,1] and never returns NaN on zero maxima", () => {
  assert.equal(calcCompetitiveness(8, 3, 1, 8, 3, 1, 0.9), 1);   // +mod clamps high
  assert.equal(calcCompetitiveness(0, 0, 0, 8, 3, 1, -0.5), 0);  // −mod clamps low
  const z = calcCompetitiveness(0, 0, 0, 0, 0, 0, 0);            // all maxima zero
  assert.ok(Number.isFinite(z) && z >= 0 && z <= 1, "no div-by-zero / NaN");
});

test("per-round deltas behave at the reference point C=1", () => {
  assert.ok(approx(calcDeltaE(0.5, 1, 0), 0.5));   // √1 * (1+log1p(0)) = 1
  assert.ok(approx(calcDeltaR(0.5, 1), 0.5));      // √1, penalty (1−C)²=0
  assert.ok(approx(calcDeltaM(0.3, 0), 0.3));      // I_M − ALPHA_M*0
  // negative R input is floored, not propagated as NaN
  assert.ok(Number.isFinite(calcDeltaE(0.5, 1, -5)));
});

test("R&D mine bonus and military score", () => {
  assert.ok(approx(calcRdMineBonus(0), 1));
  assert.ok(approx(calcRdMineBonus(200), 1.5));
  assert.equal(calcMilScore(1), 0.1);   // floor
  assert.equal(calcMilScore(20), 1.0);
});

test("asset costs apply the stakeholder multiplier (Halcyon lands cheaper pads)", () => {
  const base = calcAssetCosts(null);
  const halcyon = calcAssetCosts(null, "large_commercial"); // pad mod 0.7
  assert.ok(halcyon.costs.pad < base.costs.pad, "Halcyon's heavy-lift makes pads cheaper");
  assert.ok(base.costs.pad > 0 && base.maint.pad !== undefined);
});

test("makePlayer scales the starting budget by the stakeholder and seeds footprint mods", () => {
  const plain = makePlayer({ x: 10, y: 10 }, 1, "#fff");
  assert.equal(plain.budget, Math.round(STARTING_BUDGET));
  assert.equal(plain.safetyMult, 1);            // no stakeholder → neutral footprint
  assert.equal(plain.assetPts, ASSET_POINTS.rover);

  const con = makePlayer({ x: 10, y: 10 }, 1, "#fff", { stakeholderId: "concordium" }); // budgetMod 1.35
  assert.ok(con.budget > plain.budget, "consortium pools a larger starting budget");

  const halcyon = makePlayer({ x: 0, y: 0 }, 2, "#fff", { stakeholderId: "large_commercial" });
  assert.ok(halcyon.safetyMult > 1, "the emplacer projects a larger keep-out footprint");

  const ascendant = makePlayer({ x: 0, y: 0 }, 2, "#fff", { stakeholderId: "small_commercial" });
  assert.ok(ascendant.safetyMult < 1, "the light prospector projects a smaller footprint");
});

test("inactive players hold no asset points until activated", () => {
  const dormant = makePlayer({ x: 0, y: 0 }, 2, "#fff", { active: false });
  assert.equal(dormant.assetPts, 0);
  const live = activatePlayer(dormant);
  assert.equal(live.active, true);
  assert.equal(live.assetPts, ASSET_POINTS.rover);
  // activating an already-active player is a no-op (same reference)
  assert.equal(activatePlayer(live), live);
});

test("composite score sums banked + carried(½) + assets(×15) + policy − violations(×25)", () => {
  const p = { iceDeposited: 100, ice: 10, extraRovers: [{ ice: 5 }], assetPts: 4, scoreAdjustments: 20, safetyViolations: 2 };
  // 100 + (10+5)*0.5 + 4*15 + 20 − 2*25 = 100 + 7.5 + 60 + 20 − 50 = 137.5
  assert.ok(approx(scorePlayerState(p), 137.5));
  assert.equal(scorePlayerState(null), 0);
});

test("INVARIANT: scoreBreakdown total equals scorePlayerState, and the five terms sum to it", () => {
  const players = [
    { iceDeposited: 100, ice: 10, extraRovers: [{ ice: 5 }], assetPts: 4, scoreAdjustments: 20, safetyViolations: 2 },
    { iceDeposited: 0, ice: 0, extraRovers: [], assetPts: 0, scoreAdjustments: -8, safetyViolations: 0 },
    { iceDeposited: 250, ice: 0, extraRovers: [{ ice: 12 }, { ice: 3 }], assetPts: 9, scoreAdjustments: 0, safetyViolations: 5 },
  ];
  for (const p of players) {
    const bd = scoreBreakdown(p);
    assert.ok(approx(bd.total, scorePlayerState(p)), "breakdown total must equal the composite score");
    assert.equal(bd.terms.length, 6); // v183: added zone-overreach term
    assert.ok(approx(bd.terms.reduce((s, t) => s + t.value, 0), bd.total), "terms must sum to total");
  }
});

test("debriefAnalysis names the winner, the margin, and the safety story", () => {
  const winnerP = { iceDeposited: 300, assetPts: 5, safetyViolations: 0, scoreAdjustments: 0 };
  const loserP  = { iceDeposited: 100, assetPts: 2, safetyViolations: 0, scoreAdjustments: 0 };
  const r = debriefAnalysis(winnerP, loserP);
  assert.equal(r.winner, 1);
  assert.ok(r.margin > 0);
  assert.ok(r.findings.length >= 2);
  // both clean → a positive safety finding
  assert.ok(r.findings.some((f) => f.tone === "good" && /safety zone/i.test(f.text)));

  // a violation-heavy player gets a "bad" safety finding
  const dirty = debriefAnalysis({ iceDeposited: 300, safetyViolations: 6 }, { iceDeposited: 290, safetyViolations: 0 });
  assert.ok(dirty.findings.some((f) => f.tone === "bad" && /violation/i.test(f.text)));

  // dead heat
  const tie = debriefAnalysis({ iceDeposited: 100 }, { iceDeposited: 100 });
  assert.equal(tie.winner, 0);
});

test("pickMergedGridState prefers the more-active grid mode when both changed", () => {
  const presim = { mode: "independent" };
  assert.equal(pickMergedGridState(presim, presim, presim), presim);          // no change
  const shared = { mode: "shared" };
  assert.equal(pickMergedGridState(presim, shared, presim), shared);          // one change wins
  const offered = { mode: "offered" };
  assert.equal(pickMergedGridState(presim, offered, shared), shared);         // shared > offered
});

test("alloc presets are well-formed (slices present, default exists)", () => {
  assert.ok(ALLOC_PRESETS[DEFAULT_PRESET_KEY]);
  for (const k of Object.keys(ALLOC_PRESETS)) {
    const a = ALLOC_PRESETS[k].alloc;
    for (const slice of ["mil", "rd", "econ", "budget"]) {
      assert.equal(typeof a[slice], "number", `${k}.${slice} is numeric`);
    }
  }
});

// ── landing-pad benefits (v164) ─────────────────────────────────────────────

test("padCostMultiplier: 10% off per pad, capped at 35%", () => {
  assert.equal(padCostMultiplier(0), 1);
  assert.ok(Math.abs(padCostMultiplier(1) - 0.90) < 1e-9);
  assert.ok(Math.abs(padCostMultiplier(2) - 0.80) < 1e-9);
  assert.ok(Math.abs(padCostMultiplier(3) - 0.70) < 1e-9);
  assert.ok(Math.abs(padCostMultiplier(4) - 0.65) < 1e-9, "capped");
  assert.ok(Math.abs(padCostMultiplier(99) - 0.65) < 1e-9, "stays capped");
  assert.equal(padCostMultiplier(undefined), 1, "missing -> full price");
});

test("calcAssetCosts: pads discount equipment but never themselves", () => {
  const base = calcAssetCosts(null);
  const withPads = calcAssetCosts(null, null, { padCount: 2 }); // 20% off equipment
  // equipment is cheaper
  assert.ok(withPads.costs.solar < base.costs.solar);
  assert.ok(withPads.costs.habitat < base.costs.habitat);
  assert.ok(withPads.costs.reactor < base.costs.reactor);
  assert.equal(withPads.costs.solar, Math.round(base.costs.solar * 0.8));
  // a pad still costs full price (no discounting pads with pads)
  assert.equal(withPads.costs.pad, base.costs.pad);
});

test("calcAssetCosts: pad discount stacks with a stakeholder cost mod", () => {
  const halcyon = calcAssetCosts(null, "large_commercial"); // has assetCostMod
  const halcyonPads = calcAssetCosts(null, "large_commercial", { padCount: 1 });
  // same stakeholder, one pad -> 10% cheaper equipment than no pad
  assert.equal(halcyonPads.costs.solar, Math.round(halcyon.costs.solar * 0.9));
});

// ── v174: unpowered-habitat penalty ─────────────────────────────────────────
import { applyUnpoweredHabitatPenalty } from "../src/sim/economy.js";
import {
  UNPOWERED_HAB_DECAY, UNPOWERED_HAB_PENALTY, UNPOWERED_HAB_THRESHOLD,
  HABITAT_POWER_CAP,
} from "../src/sim/constants.js";

test("applyUnpoweredHabitatPenalty: a powered hab is untouched", () => {
  const p = {
    active: true,
    habitats: [{ x: 1, y: 1 }],
    habitatPower: [HABITAT_POWER_CAP],
    structureHealth: { habitats: [1.0] },
    scoreAdjustments: 0,
  };
  const { player, count, events } = applyUnpoweredHabitatPenalty(p);
  assert.equal(count, 0);
  assert.equal(events.length, 0);
  assert.equal(player.structureHealth.habitats[0], 1.0);
  assert.equal(player.scoreAdjustments, 0);
});

test("applyUnpoweredHabitatPenalty: an unpowered hab decays and dings the score", () => {
  const p = {
    active: true,
    habitats: [{ x: 1, y: 1 }],
    habitatPower: [0],
    structureHealth: { habitats: [1.0] },
    scoreAdjustments: 10,
  };
  const { player, count, events } = applyUnpoweredHabitatPenalty(p);
  assert.equal(count, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "unpowered_hab");
  assert.equal(events[0].habIdx, 0);
  assert.ok(approx(player.structureHealth.habitats[0], 1.0 - UNPOWERED_HAB_DECAY));
  assert.equal(player.scoreAdjustments, 10 - UNPOWERED_HAB_PENALTY);
});

test("applyUnpoweredHabitatPenalty: power above threshold is fine, at/below is not", () => {
  const mk = (pwr) => ({
    active: true,
    habitats: [{ x: 1, y: 1 }],
    habitatPower: [pwr],
    structureHealth: { habitats: [1.0] },
    scoreAdjustments: 0,
  });
  assert.equal(applyUnpoweredHabitatPenalty(mk(UNPOWERED_HAB_THRESHOLD + 0.01)).count, 0);
  assert.equal(applyUnpoweredHabitatPenalty(mk(UNPOWERED_HAB_THRESHOLD)).count, 1);
});

test("applyUnpoweredHabitatPenalty: flags destruction when health crosses zero", () => {
  const p = {
    active: true,
    habitats: [{ x: 1, y: 1 }],
    habitatPower: [0],
    structureHealth: { habitats: [UNPOWERED_HAB_DECAY * 0.5] }, // will cross 0
    scoreAdjustments: 0,
  };
  const { player, events } = applyUnpoweredHabitatPenalty(p);
  assert.equal(player.structureHealth.habitats[0], 0);
  assert.equal(events[0].destroyed, true);
});

test("applyUnpoweredHabitatPenalty: already-destroyed habs are skipped", () => {
  const p = {
    active: true,
    habitats: [{ x: 1, y: 1 }],
    habitatPower: [0],
    structureHealth: { habitats: [0] },
    scoreAdjustments: 0,
  };
  const { count } = applyUnpoweredHabitatPenalty(p);
  assert.equal(count, 0);
});

test("applyUnpoweredHabitatPenalty: multiple unpowered habs stack the ding", () => {
  const p = {
    active: true,
    habitats: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }],
    habitatPower: [0, HABITAT_POWER_CAP, 0],
    structureHealth: { habitats: [1.0, 1.0, 1.0] },
    scoreAdjustments: 0,
  };
  const { count, player } = applyUnpoweredHabitatPenalty(p);
  assert.equal(count, 2);
  assert.equal(player.scoreAdjustments, -2 * UNPOWERED_HAB_PENALTY);
  // The powered middle hab is untouched.
  assert.equal(player.structureHealth.habitats[1], 1.0);
});

// ── v175: hidden-score proxy ────────────────────────────────────────────────
import { scoreProxyLabel } from "../src/sim/economy.js";

test("scoreProxyLabel: nothing banked yet reads as too-early", () => {
  const r = scoreProxyLabel(0, 0);
  assert.equal(r.tier, "even");
  assert.equal(r.leader, null);
  assert.match(r.text, /too early/i);
});

test("scoreProxyLabel: near-equal scores read as neck-and-neck", () => {
  const r = scoreProxyLabel(100, 101);
  assert.equal(r.tier, "even");
  assert.equal(r.leader, null);
});

test("scoreProxyLabel: tiers escalate with relative margin", () => {
  assert.equal(scoreProxyLabel(100, 108).tier, "slight");     // 8%
  assert.equal(scoreProxyLabel(100, 80).tier, "clear");       // 20%
  assert.equal(scoreProxyLabel(100, 40).tier, "dominating");  // 60%
});

test("scoreProxyLabel: identifies the leader and uses the name resolver", () => {
  const nameFor = (i) => (i === 0 ? "Artemis" : "Selene");
  const r1 = scoreProxyLabel(500, 200, nameFor);
  assert.equal(r1.leader, 0);
  assert.match(r1.text, /Artemis/);
  const r2 = scoreProxyLabel(200, 500, nameFor);
  assert.equal(r2.leader, 1);
  assert.match(r2.text, /Selene/);
});

test("scoreProxyLabel: relative margin scales across magnitudes", () => {
  // Same 20% relative gap reads as the same tier whether scores are tens or
  // thousands -- so the proxy is meaningful regardless of how much ice flowed.
  assert.equal(scoreProxyLabel(10, 8).tier, scoreProxyLabel(10000, 8000).tier);
});

// ── v183: zone-expansion (overreach) penalty ─────────────────────────────────
import { zoneOverreach, zoneAssetCount, overreachPenalty, effectiveTierScales, SCORE_OVERREACH_PENALTY } from "../src/sim/economy.js";
import { TIER_OVERREACH_WEIGHT } from "../src/sim/constants.js";

// v186: overreach is now PER-TIER and inner-weighted. A legacy zoneScale (and
// safetyMult) multiplies ALL three tiers, so an over-expansion of `d` on every
// tier contributes d*(wCore + wHarm + wCoord).
const WSUM = TIER_OVERREACH_WEIGHT.core + TIER_OVERREACH_WEIGHT.harmonization + TIER_OVERREACH_WEIGHT.coordination;

test("zoneOverreach: 0 at/below baseline, positive above (inner-weighted)", () => {
  assert.equal(zoneOverreach({ zoneScale: 1 }), 0);
  assert.equal(zoneOverreach({ zoneScale: 0.5 }), 0);
  // zoneScale 2 → every tier at 2× → each 1.0 over baseline → 1.0 * WSUM
  assert.ok(Math.abs(zoneOverreach({ zoneScale: 2 }) - WSUM) < 1e-9);
  // safetyMult and zoneScale compound: effective 3× → 2.0 over on each tier
  assert.ok(Math.abs(zoneOverreach({ zoneScale: 1.5, safetyMult: 2 }) - 2 * WSUM) < 1e-9);
});

test("zoneOverreach: inner rings dominate the penalty", () => {
  // Expanding ONLY the core costs far more than expanding ONLY the coordination
  // buffer by the same amount, Christine's rule that the inner exclusion is the
  // anti-social one.
  const coreOnly  = zoneOverreach({ tierScale: { core: 2, harmonization: 1, coordination: 1 } });
  const coordOnly = zoneOverreach({ tierScale: { core: 1, harmonization: 1, coordination: 2 } });
  assert.ok(Math.abs(coreOnly  - TIER_OVERREACH_WEIGHT.core)         < 1e-9);
  assert.ok(Math.abs(coordOnly - TIER_OVERREACH_WEIGHT.coordination) < 1e-9);
  assert.ok(coreOnly > coordOnly);
});

test("effectiveTierScales: folds legacy zoneScale/safetyMult into every tier", () => {
  const ts = effectiveTierScales({ zoneScale: 2, tierScale: { core: 1, harmonization: 1, coordination: 1 } });
  assert.ok(Math.abs(ts.core - 2) < 1e-9);
  assert.ok(Math.abs(ts.harmonization - 2) < 1e-9);
  assert.ok(Math.abs(ts.coordination - 2) < 1e-9);
});

test("zoneAssetCount: counts every zone-projecting asset incl. primary rover", () => {
  const p = { panels: [{}, {}], reactors: [{}], habitats: [{}], landingPads: [], x: 5, y: 5, extraRovers: [{}] };
  // 2 panels + 1 reactor + 1 habitat + 0 pads + 1 primary rover + 1 extra = 6
  assert.equal(zoneAssetCount(p), 6);
});

test("overreachPenalty: scales with inflation and asset count, negative", () => {
  const p = { zoneScale: 2, panels: [{}, {}], x: 0, y: 0 }; // over 1.0 on each tier, 3 zones
  // -(1.0*WSUM) * 3 * SCORE_OVERREACH_PENALTY
  assert.equal(overreachPenalty(p), -WSUM * 3 * SCORE_OVERREACH_PENALTY);
  // baseline actors pay nothing
  assert.equal(overreachPenalty({ zoneScale: 1, panels: [{}], x: 0, y: 0 }), 0);
});

test("overreach penalty flows into the composite score", () => {
  const base = { iceDeposited: 100, panels: [{}], x: 0, y: 0, zoneScale: 1 };
  const infl = { ...base, zoneScale: 2 }; // 2 zones (panel + rover), overreach 1.0
  assert.ok(scorePlayerState(infl) < scorePlayerState(base),
    "inflating declared zones must lower the score");
});
