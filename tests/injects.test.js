// Inject → score tests. The whole point of v90: a facilitator inject, and the
// actor's choice of how to respond, must move the scoreboard. These assert
// that applyInjectDeltas feeds scoreAdjustments, that scorePlayerState picks it
// up, and that every choice in the deck carries an explicit scored stake.

import { test } from "node:test";
import assert from "node:assert/strict";

import { INJECT_DECK, applyInjectDeltas } from "../src/sim/injects.js";
import { scorePlayerState, makePlayer } from "../src/sim/economy.js";

test("applyInjectDeltas: scoreAdj accumulates into scoreAdjustments", () => {
  const p0 = makePlayer({ x: 600, y: 600 }, 1, "#fff");
  const p1 = applyInjectDeltas(p0, { scoreAdj: +12 });
  assert.equal(p1.scoreAdjustments, (p0.scoreAdjustments ?? 0) + 12);
  // Stacks additively across responses.
  const p2 = applyInjectDeltas(p1, { scoreAdj: -5 });
  assert.equal(p2.scoreAdjustments, (p0.scoreAdjustments ?? 0) + 7);
});

test("an inject choice actually changes the composite score", () => {
  const p0 = makePlayer({ x: 600, y: 600 }, 1, "#fff");
  const before = scorePlayerState(p0);
  // Pick the cooperative joint-survey choice from the discovery inject.
  const discovery = INJECT_DECK.find((d) => d.id === "discovery");
  const coop = discovery.choices.find((c) => /joint survey/i.test(c.label));
  assert.ok(coop.deltas.scoreAdj > 0, "cooperative survey should reward score");
  const after = scorePlayerState(applyInjectDeltas(p0, coop.deltas));
  assert.equal(after - before, coop.deltas.scoreAdj);
});

test("risky/escalatory choices carry a score penalty", () => {
  // Running a reactor hot after a cooling anomaly, and escalating geopolitically.
  const eq = INJECT_DECK.find((d) => d.id === "equipment_fail");
  const runHot = eq.choices.find((c) => /run hot/i.test(c.label));
  assert.ok(runHot.deltas.scoreAdj < 0, "running the reactor hot should cost score");

  const geo = INJECT_DECK.find((d) => d.id === "geopolitical");
  const assert_ = geo.choices.find((c) => /assert position|accelerate/i.test(c.label));
  assert.ok(assert_.deltas.scoreAdj < 0, "escalation should cost score");
});

test("every inject choice carries an explicit scored stake", () => {
  for (const inj of INJECT_DECK) {
    for (const c of inj.choices) {
      assert.ok(
        Number.isFinite(c.deltas?.scoreAdj),
        `inject ${inj.id} choice "${c.label}" is missing scoreAdj`,
      );
    }
  }
});

test("deck is well-formed: 3 choices each, with a blurb", () => {
  assert.ok(INJECT_DECK.length >= 8);
  for (const inj of INJECT_DECK) {
    assert.equal(inj.choices.length, 3, `${inj.id} should have 3 choices`);
    assert.ok(inj.blurb && inj.label && inj.summary);
  }
});

// ── v101: forced-state injects (restrictions) ───────────────────────────────
import {
  RESTRICTION, addRestriction, tickRestrictions, hasRestriction,
  canNegotiateWith, restrictionStatus,
} from "../src/sim/injects.js";

test("three new injects exist with 3 choices and scored stakes", () => {
  for (const id of ["political_directive", "dual_use_surveillance", "earthside_crisis"]) {
    const inj = INJECT_DECK.find(d => d.id === id);
    assert.ok(inj, `${id} should exist`);
    assert.equal(inj.choices.length, 3);
    for (const c of inj.choices) assert.ok(Number.isFinite(c.deltas?.scoreAdj));
  }
});

test("political directive imposes a NO_NEGOTIATE restriction via applyInjectDeltas", () => {
  const inj = INJECT_DECK.find(d => d.id === "political_directive");
  const comply = inj.choices[0];
  const p = applyInjectDeltas({ scoreAdjustments: 0 }, comply.deltas);
  assert.ok(hasRestriction(p, RESTRICTION.NO_NEGOTIATE));
  assert.equal(canNegotiateWith(p, 1), false, "cannot negotiate while directed");
});

test("addRestriction refreshes rather than stacks duplicates", () => {
  let list = addRestriction([], { type: RESTRICTION.NO_NEGOTIATE, turns: 2 });
  list = addRestriction(list, { type: RESTRICTION.NO_NEGOTIATE, turns: 3 });
  assert.equal(list.length, 1, "same type does not stack");
  assert.equal(list[0].turns, 3, "keeps the longer countdown");
});

test("FROZEN_WITH is specific to a counterpart index", () => {
  const p = { restrictions: [{ type: RESTRICTION.FROZEN_WITH, turns: 2, with: 1 }] };
  assert.equal(canNegotiateWith(p, 1), false, "frozen with actor 1");
  assert.equal(canNegotiateWith(p, 0), true, "but free with actor 0");
});

test("tickRestrictions decrements and drops expired", () => {
  let list = [
    { type: RESTRICTION.NO_NEGOTIATE, turns: 1 },
    { type: RESTRICTION.FROZEN_WITH, turns: 3, with: 0 },
  ];
  list = tickRestrictions(list);
  assert.equal(list.length, 1, "the 1-turn restriction expired");
  assert.equal(list[0].type, RESTRICTION.FROZEN_WITH);
  assert.equal(list[0].turns, 2);
  assert.deepEqual(tickRestrictions([]), []);
});

test("restrictionStatus is null when clear, descriptive when set", () => {
  assert.equal(restrictionStatus({ restrictions: [] }), null);
  const s = restrictionStatus({ restrictions: [{ type: RESTRICTION.NO_NEGOTIATE, turns: 2 }] });
  assert.match(s, /no negotiation/i);
  assert.match(s, /2 turns/);
});

test("dual-use inject carries a debrief reveal teaching restraint", () => {
  const inj = INJECT_DECK.find(d => d.id === "dual_use_surveillance");
  assert.match(inj.debriefReveal, /benign/i);
  // holding/observing should score best; defensive repositioning worst
  const hold = inj.choices[0].deltas.scoreAdj;
  const defensive = inj.choices[2].deltas.scoreAdj;
  assert.ok(hold > defensive, "restraint should beat escalation");
});

// v127 (roadmap): national-security inject + safetyMult delta.
test("national-security inject exists with full-buffer / modest / decline choices", () => {
  const ns = INJECT_DECK.find(i => i.id === "natsec_designation");
  assert.ok(ns, "natsec_designation inject present");
  assert.equal(ns.choices.length, 3);
  const mults = ns.choices.map(c => c.deltas.safetyMult);
  assert.ok(mults.includes(2.2), "full-buffer choice inflates to 2.2x");
  assert.ok(mults.includes(1.4), "modest-buffer choice is 1.4x");
  assert.ok(mults.includes(1.0), "decline choice keeps 1.0x");
  // Invoking the full buffer should carry a legitimacy cost; declining a credit.
  const full = ns.choices.find(c => c.deltas.safetyMult === 2.2);
  const decline = ns.choices.find(c => c.deltas.safetyMult === 1.0);
  assert.ok(full.deltas.scoreAdj < 0, "claiming the ground costs score (land-grab read)");
  assert.ok(decline.deltas.scoreAdj > 0, "declining keeps the cooperative high ground");
});

test("applyInjectDeltas sets and clamps safetyMult", () => {
  const p = makePlayer({ x: 600, y: 600 }, 1, "#fff");
  assert.equal(applyInjectDeltas(p, { safetyMult: 2.2 }).safetyMult, 2.2);
  // Clamp: never below 1, never above 4.
  assert.equal(applyInjectDeltas(p, { safetyMult: 0.2 }).safetyMult, 1);
  assert.equal(applyInjectDeltas(p, { safetyMult: 99 }).safetyMult, 4);
});

// v128 (roadmap): first-mover-gets-it-wrong / resource relocation inject.
test("resource_relocation inject strands polar infrastructure proportionally", () => {
  const ir = INJECT_DECK.find(i => i.id === "resource_relocation");
  assert.ok(ir, "resource_relocation inject present");
  assert.equal(ir.choices.length, 3);
  // The "write down" and "hold" choices both carry a strandedScale; "double
  // down" does not (you take no write-down now, just morale + a flat hit).
  const writeDown = ir.choices[0], hold = ir.choices[1], doubleDown = ir.choices[2];
  assert.ok(writeDown.deltas.strandedScale > hold.deltas.strandedScale, "writing down realizes more sunk cost than hedging");
  assert.equal(doubleDown.deltas.strandedScale, undefined, "doubling down takes no write-down");
});

test("strandedScale penalty scales with sunk asset points", () => {
  const small = makePlayer({ x: 600, y: 600 }, 1, "#fff"); small.assetPts = 2;   // light polar build
  const heavy = makePlayer({ x: 600, y: 600 }, 1, "#fff"); heavy.assetPts = 10;  // over-committed to the pole
  const s0 = scorePlayerState(small), h0 = scorePlayerState(heavy);
  const sAfter = scorePlayerState(applyInjectDeltas(small, { strandedScale: 3 }));
  const hAfter = scorePlayerState(applyInjectDeltas(heavy, { strandedScale: 3 }));
  const sLoss = s0 - sAfter, hLoss = h0 - hAfter;
  assert.equal(sLoss, 6,  "2 asset pts * scale 3 = 6 lost");
  assert.equal(hLoss, 30, "10 asset pts * scale 3 = 30 lost");
  assert.ok(hLoss > sLoss, "the bloc that over-built at the pole loses more");
});

// v129 (roadmap): intertemporal disposal inject + counterpart externality.
test("satellite_disposal inject offers responsible vs externalizing choices", () => {
  const sd = INJECT_DECK.find(i => i.id === "satellite_disposal");
  assert.ok(sd, "satellite_disposal inject present");
  assert.equal(sd.choices.length, 3);
  const graveyard = sd.choices[0], ownArea = sd.choices[1], externalize = sd.choices[2];
  // Responsible options keep the cost with the owner (no counterpartDelta).
  assert.equal(graveyard.deltas.counterpartDelta, undefined);
  assert.equal(ownArea.deltas.counterpartDelta, undefined);
  // The externalizing option benefits the owner now but dumps a score hit on the
  // future user (the counterpart).
  assert.ok(externalize.deltas.scoreAdj > 0, "externalizing helps the owner short-term");
  assert.ok(externalize.deltas.counterpartDelta?.scoreAdj < 0, "the future user inherits a penalty");
});

test("counterpartDelta applies the externality to the OTHER actor (via applyInjectDeltas)", () => {
  // The handler applies counterpartDelta to the other actor; here we verify the
  // pure applyInjectDeltas leg: feeding the counterpart its delta moves its score.
  const future = makePlayer({ x: 600, y: 600 }, 2, "#fff");
  const before = scorePlayerState(future);
  const after = scorePlayerState(applyInjectDeltas(future, { scoreAdj: -16 }));
  assert.equal(before - after, 16, "the future user loses exactly the externalized penalty");
});

// ── v153: the OST walk-back inject now moves a tracked treaty floor ──────────
import {
  TREATY_FLOOR_INIT, FLOOR_MIN, DEFAULT_EROSION, treatyStage,
} from "../src/sim/treatyErosion.js";

const ostWalkback = INJECT_DECK.find(i => i.id === "ost_walkback");

test("ost_walkback is present and each choice carries a treatyErosion stake", () => {
  assert.ok(ostWalkback, "expected an ost_walkback inject in the deck");
  const pressures = ostWalkback.choices.map(c => c.deltas.treatyErosion);
  // reinforce (<0), let-slide (>0), exploit (more >0)
  assert.deepEqual(pressures, [-1, 1, 2]);
});

test("applying each ost_walkback choice moves the floor the right direction", () => {
  const [reinforce, slide, exploit] = ostWalkback.choices;
  // Fresh actor: no treatyFloor yet -> starts from TREATY_FLOOR_INIT.
  assert.equal(applyInjectDeltas({}, reinforce.deltas).treatyFloor, TREATY_FLOOR_INIT); // already at max, stays
  const slid = applyInjectDeltas({}, slide.deltas).treatyFloor;
  const took = applyInjectDeltas({}, exploit.deltas).treatyFloor;
  assert.ok(slid < TREATY_FLOOR_INIT, "let-slide should lower the floor");
  assert.ok(took < slid, "exploit should lower it further than let-slide");
  // From an already-eroded floor, reinforce recovers it.
  const recovered = applyInjectDeltas({ treatyFloor: 0.8 }, reinforce.deltas).treatyFloor;
  assert.ok(recovered > 0.8 && recovered <= 1, "reinforce should partially recover an eroded floor");
});

test("sustained exploitation walks the floor down gradually, never past the ceiling/floor or the per-step cap", () => {
  let p = {};
  let prev = TREATY_FLOOR_INIT;
  for (let r = 0; r < 60; r++) {
    p = applyInjectDeltas(p, ostWalkback.choices[2].deltas); // exploit, +2 each round
    assert.ok(p.treatyFloor >= FLOOR_MIN, "floor never drops below FLOOR_MIN");
    assert.ok(prev - p.treatyFloor <= DEFAULT_EROSION.maxStepDown + 1e-9, "no single-round cliff");
    prev = p.treatyFloor;
  }
  assert.equal(treatyStage(p.treatyFloor), "collapsed"); // sustained pressure eventually collapses it
});
