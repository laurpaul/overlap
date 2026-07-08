import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeDeal, isEmptyDeal, isEmptyBundle, canFulfill, dealIsHonorable,
  applyAcceptedDeal, hasEasement, summarizeBundle,
} from "../src/sim/deals.js";
import { attributeSafetyViolations } from "../src/sim/enemyZones.js";
import { ZONE_RADII_PX } from "../src/sim/constants.js";

function P(over = {}) {
  return { budget: 100, iceDeposited: 50, scoreAdjustments: 0,
    panels: [], reactors: [], habitats: [], landingPads: [], extraRovers: [],
    structureHealth: {}, easements: [], ...over };
}

test("makeDeal normalizes bundles and clamps negatives", () => {
  const d = makeDeal(0, 1, { budget: -5, ice: 3.7, power: 1 }, { score: 10 });
  assert.equal(d.give.budget, 0);
  assert.equal(d.give.ice, 4);
  assert.equal(d.give.power, true);
  assert.equal(d.want.score, 10);
  assert.equal(d.status, "pending");
});

test("isEmptyDeal / isEmptyBundle", () => {
  assert.ok(isEmptyBundle({}));
  assert.ok(isEmptyDeal(makeDeal(0, 1, {}, {})));
  assert.ok(!isEmptyDeal(makeDeal(0, 1, { budget: 5 }, {})));
});

test("canFulfill checks budget, ice, and score", () => {
  const p = P({ budget: 40, iceDeposited: 10, scoreAdjustments: 5 });
  assert.ok(canFulfill(p, { budget: 40, ice: 10, score: 5 }));
  assert.ok(!canFulfill(p, { budget: 41 }));
  assert.ok(!canFulfill(p, { ice: 11 }));
  assert.ok(!canFulfill(p, { score: 6 }));
  assert.ok(canFulfill(p, { power: true, comms: true })); // access is always affordable
});

test("dealIsHonorable requires both sides able to pay", () => {
  const from = P({ budget: 30 }), to = P({ budget: 10 });
  const deal = makeDeal(0, 1, { budget: 30 }, { budget: 20 });
  assert.ok(!dealIsHonorable(from, to, deal)); // recipient can't cover 20? has 10
  const to2 = P({ budget: 25 });
  assert.ok(dealIsHonorable(from, to2, deal));
});

test("applyAcceptedDeal moves budget/ice/score both directions", () => {
  const p1 = P({ budget: 100, iceDeposited: 40, scoreAdjustments: 0 });
  const p2 = P({ budget: 50, iceDeposited: 10, scoreAdjustments: 5 });
  // P1 gives 30cr + 10kg, wants 5 score
  const deal = makeDeal(0, 1, { budget: 30, ice: 10 }, { score: 5 });
  const out = applyAcceptedDeal({ p1, p2, powerGrid: { mode: "independent" }, commsGrid: { mode: "independent" } }, deal);
  assert.equal(out.p1.budget, 70);
  assert.equal(out.p2.budget, 80);
  assert.equal(out.p1.iceDeposited, 30);
  assert.equal(out.p2.iceDeposited, 20);
  assert.equal(out.p1.scoreAdjustments, 5);  // received 5
  assert.equal(out.p2.scoreAdjustments, 0);  // gave 5
});

test("applyAcceptedDeal flips power/comms grids to shared", () => {
  const deal = makeDeal(0, 1, { power: true }, { comms: true });
  const out = applyAcceptedDeal({ p1: P(), p2: P(), powerGrid: { mode: "independent" }, commsGrid: { mode: "independent" } }, deal);
  assert.equal(out.powerGrid.mode, "shared");
  assert.equal(out.commsGrid.mode, "shared");
  assert.ok(out.applied.power && out.applied.comms);
});

test("applyAcceptedDeal grants easements in the right direction", () => {
  // P1 (actor 1) waives its zones vs P2; P2 (actor 2) does not.
  const deal = makeDeal(0, 1, { easement: true }, {});
  const out = applyAcceptedDeal({ p1: P(), p2: P(), powerGrid: {}, commsGrid: {} }, deal);
  assert.ok(out.p1.easements.includes(2), "P1 waived vs actor 2");
  assert.ok(!out.p2.easements.includes(1));
});

test("easement actually suppresses violations in attribution", () => {
  // P1 has a habitat; P2's rover sits inside its zone and arrives later (breaches).
  const r = ZONE_RADII_PX.core; // v190: uniform DLA Core exclusion
  const p1 = P({ habitats: [{ x: 100, y: 100, seq: 1 }], structureHealth: { habitats: [1] } });
  const p2 = P({ x: 100 + r * 0.5, y: 100, seq: 5 }); // primary rover breaches, later seq
  const before = attributeSafetyViolations(p1, p2, {});
  assert.ok(before.v2 >= 1, "P2 is charged without easement");
  // Now P1 waives its zones vs actor 2:
  const p1e = { ...p1, easements: [2] };
  const after = attributeSafetyViolations(p1e, p2, {});
  assert.equal(after.v2, 0, "easement clears P2's violation of P1's zones");
});

test("zoneScale enlarges/shrinks the breach radius", () => {
  const baseR = ZONE_RADII_PX.core; // v190: uniform DLA Core exclusion
  const p1 = P({ habitats: [{ x: 100, y: 100, seq: 1 }], structureHealth: { habitats: [1] } });
  // rover just OUTSIDE the base zone
  const p2 = P({ x: 100 + baseR * 1.2, y: 100, seq: 5 });
  assert.equal(attributeSafetyViolations(p1, p2, {}).v2, 0, "outside base zone: no breach");
  // widen P1's zones 1.5x -> now it reaches the rover
  const p1wide = { ...p1, zoneScale: 1.5 };
  assert.ok(attributeSafetyViolations(p1wide, p2, {}).v2 >= 1, "widened zone now breached");
});

test("summarizeBundle reads naturally", () => {
  const s = summarizeBundle({ budget: 20, power: true, easement: true, stance: "economic" }, (k) => k);
  assert.ok(s.includes("20cr") && s.includes("power") && s.includes("easement") && s.includes("economic"));
  assert.equal(summarizeBundle({}), "nothing");
});

test("hasEasement helper", () => {
  assert.ok(hasEasement({ easements: [2] }, 2));
  assert.ok(!hasEasement({ easements: [2] }, 1));
  assert.ok(!hasEasement(null, 1));
});

// ── deal hygiene / pruning (v168) ───────────────────────────────────────────
import { pruneDeals, dealStillHonorable, DEAL_MAX_AGE_ROUNDS } from "../src/sim/deals.js";

test("pruneDeals: expires deals older than the max age", () => {
  const d0 = makeDeal(0, 1, { budget: 5 }, {}, { round: 1 });
  const d1 = makeDeal(0, 1, { budget: 5 }, {}, { round: 4 });
  const { kept, dropped } = pruneDeals([d0, d1], { round: 4, p1: P(), p2: P() });
  assert.equal(kept.length, 1);
  assert.equal(kept[0].round, 4, "fresh deal kept");
  assert.equal(dropped[0].reason, "expired");
});

test("pruneDeals: drops deals the proposer can no longer cover", () => {
  const deal = makeDeal(0, 1, { budget: 80 }, {}, { round: 1 });
  const poorP1 = P({ budget: 10 });
  const { kept, dropped } = pruneDeals([deal], { round: 1, p1: poorP1, p2: P() });
  assert.equal(kept.length, 0);
  assert.equal(dropped[0].reason, "unaffordable");
});

test("pruneDeals: keeps a fresh, affordable, pending deal", () => {
  const deal = makeDeal(0, 1, { budget: 20 }, { comms: true }, { round: 3 });
  const { kept, dropped } = pruneDeals([deal], { round: 3, p1: P({ budget: 50 }), p2: P() });
  assert.equal(kept.length, 1);
  assert.equal(dropped.length, 0);
});

test("pruneDeals: removes already-resolved deals", () => {
  const deal = { ...makeDeal(0, 1, { budget: 5 }, {}, { round: 1 }), status: "accepted" };
  const { kept } = pruneDeals([deal], { round: 1 });
  assert.equal(kept.length, 0);
});

test("dealStillHonorable tracks the proposer's give side", () => {
  const deal = makeDeal(1, 0, { ice: 30 }, {}, {});
  assert.ok(dealStillHonorable(deal, P(), P({ iceDeposited: 40 })));   // proposer is P2
  assert.ok(!dealStillHonorable(deal, P(), P({ iceDeposited: 5 })));
});
