import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeSeededRng, isMapDepleted, clonePlayerState, structureCounts,
  grantAssetToPlayer, removeLastAsset, GOD_ASSET_ARRAY,
  clearViolations, repairAllAssets, rechargeAll, functionalPadCount,
} from "../src/sim/playerState.js";
import { DEPLETION_END_THRESHOLD } from "../src/sim/constants.js";

test("makeSeededRng is deterministic: same seed -> same sequence", () => {
  const a = makeSeededRng(12345);
  const b = makeSeededRng(12345);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
  // different seeds diverge
  const c = makeSeededRng(99);
  assert.notEqual(makeSeededRng(12345)(), c());
  // output is in [0,1)
  const r = makeSeededRng(7);
  for (let i = 0; i < 20; i++) { const v = r(); assert.ok(v >= 0 && v < 1); }
});

test("isMapDepleted: empty/all-depleted true, any remaining false", () => {
  assert.equal(isMapDepleted(null), false);
  assert.equal(isMapDepleted(new Float32Array([0, 0, 0])), true);
  // just below threshold counts as depleted
  assert.equal(isMapDepleted(new Float32Array([DEPLETION_END_THRESHOLD - 0.001])), true);
  // anything above the floor means not depleted
  assert.equal(isMapDepleted(new Float32Array([0, 0, 0.5])), false);
  assert.equal(isMapDepleted(new Float32Array([DEPLETION_END_THRESHOLD + 0.01])), false);
});

test("structureCounts: tallies assets incl. primary + extra rovers; null -> zeros", () => {
  assert.deepEqual(structureCounts(null), { habitats: 0, panels: 0, reactors: 0, rovers: 0, pads: 0 });
  const p = {
    habitats: [{}, {}],
    panels: [{}],
    reactors: [{}, {}, {}],
    extraRovers: [{}, {}],   // + 1 primary = 3 rovers
    landingPads: [{}],
  };
  assert.deepEqual(structureCounts(p), { habitats: 2, panels: 1, reactors: 3, rovers: 3, pads: 1 });
  // a player with no extras still has the one primary rover
  assert.equal(structureCounts({}).rovers, 1);
});

test("clonePlayerState: deep independence (mutating clone does not touch original)", () => {
  const orig = {
    x: 10, y: 20,
    panels: [{ x: 1, y: 2 }],
    extraRovers: [{ x: 3, y: 4, waypoints: [{ x: 5, y: 6 }] }],
    comsats: [{ x: 7, y: 8 }],
    structureHealth: { panels: [1.0], comsats: [0.9] },
    mineMap: { "12": 0.5 },
  };
  const clone = clonePlayerState(orig);
  // mutate the clone in several places
  clone.panels[0].x = 999;
  clone.extraRovers[0].waypoints[0].x = 999;
  clone.comsats[0].x = 999;
  clone.structureHealth.comsats[0] = 0.1;
  clone.mineMap["12"] = 9;
  // original is untouched
  assert.equal(orig.panels[0].x, 1);
  assert.equal(orig.extraRovers[0].waypoints[0].x, 5);
  assert.equal(orig.comsats[0].x, 7);
  assert.equal(orig.structureHealth.comsats[0], 0.9);
  assert.equal(orig.mineMap["12"], 0.5);
});

test("clonePlayerState: comsats survive the clone (the v27 regression guard)", () => {
  const orig = { comsats: [{ x: 1, y: 1 }, { x: 2, y: 2 }], structureHealth: { comsats: [1.0, 0.8] } };
  const clone = clonePlayerState(orig);
  assert.equal(clone.comsats.length, 2);
  assert.equal(clone.structureHealth.comsats.length, 2);
  assert.deepEqual(clone.comsats, orig.comsats);
});

test("clonePlayerState: unknown structureHealth keys carry through (spread catch-all)", () => {
  const orig = { structureHealth: { panels: [1.0], someFutureKey: [0.5, 0.5] } };
  const clone = clonePlayerState(orig);
  assert.deepEqual(clone.structureHealth.someFutureKey, [0.5, 0.5]);
});

test("clonePlayerState: null -> null", () => {
  assert.equal(clonePlayerState(null), null);
});

// ── god-mode asset grant / remove (v161) ────────────────────────────────────

function basePlayer(over = {}) {
  return {
    base: { x: 100, y: 100 },
    panels: [], reactors: [], habitats: [], landingPads: [], extraRovers: [],
    habitatPower: [], structureHealth: {}, assetPts: 0, ...over,
  };
}

test("grantAssetToPlayer: each type lands in the right array with a matching health entry", () => {
  for (const [type, arr] of Object.entries(GOD_ASSET_ARRAY)) {
    const p = grantAssetToPlayer(basePlayer(), type, { x: 10, y: 20, seq: 1, assetPts: 3 });
    assert.equal(p[arr].length, 1, `${type} pushed to ${arr}`);
    assert.equal(p.structureHealth[arr].length, 1, `${type} health entry created`);
    assert.equal(p.structureHealth[arr][0], 1.0, "granted asset is full health");
    assert.equal(p.assetPts, 3, "asset points granted");
    assert.equal(p[arr][0].seq, 1, "placement seq stamped");
  }
});

test("grantAssetToPlayer: health array stays index-aligned across repeated grants", () => {
  let p = basePlayer({ panels: [{ x: 0, y: 0 }], structureHealth: { panels: [0.4] } });
  p = grantAssetToPlayer(p, "solar", { x: 5, y: 5, seq: 2, assetPts: 2 });
  p = grantAssetToPlayer(p, "solar", { x: 6, y: 6, seq: 3, assetPts: 2 });
  assert.equal(p.panels.length, 3);
  assert.equal(p.structureHealth.panels.length, 3, "no off-by-one between array and health");
  assert.deepEqual(p.structureHealth.panels, [0.4, 1.0, 1.0], "existing health preserved, new ones full");
});

test("grantAssetToPlayer: habitat also seeds habitatPower; rover carries power", () => {
  const h = grantAssetToPlayer(basePlayer(), "habitat", { x: 1, y: 1, seq: 1, habitatInit: 52 });
  assert.equal(h.habitatPower.length, 1);
  assert.equal(h.habitatPower[0], 52);
  const r = grantAssetToPlayer(basePlayer(), "rover", { x: 1, y: 1, seq: 1, roverPower: 120 });
  assert.equal(r.extraRovers[0].power, 120);
});

test("grantAssetToPlayer: does not mutate the input player", () => {
  const p0 = basePlayer();
  const p1 = grantAssetToPlayer(p0, "reactor", { x: 1, y: 1, seq: 1 });
  assert.equal(p0.reactors.length, 0, "input untouched");
  assert.equal(p1.reactors.length, 1);
});

test("removeLastAsset: pops the last asset and its health, claws back points", () => {
  let p = basePlayer({
    habitats: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
    habitatPower: [40, 50],
    structureHealth: { habitats: [1.0, 0.7] },
    assetPts: 10,
  });
  p = removeLastAsset(p, "habitats", { assetPts: 4 });
  assert.equal(p.habitats.length, 1);
  assert.equal(p.structureHealth.habitats.length, 1);
  assert.equal(p.habitatPower.length, 1, "habitatPower stays aligned");
  assert.equal(p.assetPts, 6, "points clawed back");
  assert.deepEqual(p.structureHealth.habitats, [1.0]);
});

test("removeLastAsset: empty array is a no-op (and never goes negative on points)", () => {
  const p0 = basePlayer({ assetPts: 0 });
  const p1 = removeLastAsset(p0, "panels", { assetPts: 5 });
  assert.equal(p1.panels.length, 0);
  assert.equal(p1.assetPts, 0, "no negative points, no phantom removal");
});

// ── facilitator maintenance transforms (v163) ───────────────────────────────

test("clearViolations: zeroes the count, leaves everything else", () => {
  const p = basePlayer({ safetyViolations: 7, assetPts: 5 });
  const out = clearViolations(p);
  assert.equal(out.safetyViolations, 0);
  assert.equal(out.assetPts, 5, "unrelated fields preserved");
  assert.equal(p.safetyViolations, 7, "input not mutated");
});

test("repairAllAssets: every asset's health array is full and length-aligned", () => {
  const p = basePlayer({
    panels: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    habitats: [{ x: 2, y: 2 }],
    extraRovers: [{ x: 3, y: 3 }],
    structureHealth: { panels: [0.2, 0.5], habitats: [0.0], extraRovers: [0.3], primaryRover: [0.4] },
  });
  const out = repairAllAssets(p);
  assert.deepEqual(out.structureHealth.panels, [1.0, 1.0]);
  assert.deepEqual(out.structureHealth.habitats, [1.0]);
  assert.deepEqual(out.structureHealth.extraRovers, [1.0]);
  assert.deepEqual(out.structureHealth.primaryRover, [1.0], "non-array tracked health restored too");
  assert.equal(out.structureHealth.panels.length, out.panels.length, "stays length-aligned");
  assert.equal(p.structureHealth.panels[0], 0.2, "input not mutated");
});

test("repairAllAssets: missing health array gets created at the asset-array length", () => {
  const p = basePlayer({ reactors: [{ x: 0, y: 0 }], structureHealth: {} });
  const out = repairAllAssets(p);
  assert.deepEqual(out.structureHealth.reactors, [1.0]);
});

test("rechargeAll: tops up primary rover, extras, and habitats", () => {
  const p = basePlayer({
    power: 5,
    extraRovers: [{ x: 0, y: 0, power: 2 }, { x: 1, y: 1, power: 0 }],
    habitats: [{ x: 2, y: 2 }, { x: 3, y: 3 }],
    habitatPower: [10, 20],
  });
  const out = rechargeAll(p, { roverPower: 120, habitatPower: 80 });
  assert.equal(out.power, 120);
  assert.deepEqual(out.extraRovers.map(r => r.power), [120, 120]);
  assert.deepEqual(out.habitatPower, [80, 80]);
  assert.equal(p.power, 5, "input not mutated");
  assert.equal(p.extraRovers[0].power, 2, "input rovers not mutated");
});

test("rechargeAll: no habitats -> no habitatPower added", () => {
  const p = basePlayer({ power: 3, extraRovers: [] });
  const out = rechargeAll(p, { roverPower: 100 });
  assert.equal(out.power, 100);
  assert.equal(out.habitatPower.length, 0);
});

// ── functionalPadCount (v164) ───────────────────────────────────────────────

test("functionalPadCount: counts only pads above the destroyed floor", () => {
  assert.equal(functionalPadCount(null), 0);
  assert.equal(functionalPadCount(basePlayer()), 0);
  const p = basePlayer({
    landingPads: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }],
    structureHealth: { landingPads: [1.0, 0.05, 0.5] }, // middle one destroyed
  });
  assert.equal(functionalPadCount(p), 2);
});

test("functionalPadCount: missing health array treats pads as full health", () => {
  const p = basePlayer({ landingPads: [{ x: 0, y: 0 }, { x: 1, y: 1 }], structureHealth: {} });
  assert.equal(functionalPadCount(p), 2);
});
