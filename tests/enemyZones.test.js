// Tests for the enemy-zone helpers -- buildEnemyZones + pointInAnyZone.

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildEnemyZones, pointInAnyZone } from "../src/sim/enemyZones.js";
import { ZONE_RADII_PX } from "../src/sim/constants.js";
// v190: every asset now projects the SAME uniform DLA Core keep-out.
const CORE = ZONE_RADII_PX.core;

// Helper: build a minimal "foe" object with optional asset arrays.
function makeFoe(overrides = {}) {
  return {
    x: 500, y: 500,
    panels: [], reactors: [], habitats: [], landingPads: [], extraRovers: [],
    structureHealth: { panels: [], reactors: [], habitats: [], landingPads: [], extraRovers: [] },
    ...overrides,
  };
}

// ── buildEnemyZones ──────────────────────────────────────────────────────

test("buildEnemyZones -- null foe returns empty array", () => {
  assert.deepEqual(buildEnemyZones(null), []);
  assert.deepEqual(buildEnemyZones(undefined), []);
});

test("buildEnemyZones -- primary rover always contributes a zone", () => {
  const zones = buildEnemyZones(makeFoe());
  // Just the primary rover.
  assert.equal(zones.length, 1);
  assert.equal(zones[0].x, 500);
  assert.equal(zones[0].y, 500);
  // Radius is CORE * 1.10 buffer.
  assert.ok(Math.abs(zones[0].r - CORE * 1.10) < 1e-9);
});

test("buildEnemyZones -- primary rover missing position skips it", () => {
  const foe = makeFoe({ x: null, y: null });
  // No primary, no other assets → no zones.
  assert.equal(buildEnemyZones(foe).length, 0);
});

test("buildEnemyZones -- habitat with full health is included", () => {
  const foe = makeFoe({
    habitats: [{ x: 100, y: 100 }],
    structureHealth: { habitats: [1.0], panels: [], reactors: [], landingPads: [], extraRovers: [] },
  });
  const zones = buildEnemyZones(foe);
  // Primary rover + habitat = 2.
  assert.equal(zones.length, 2);
  const hab = zones.find(z => z.x === 100 && z.y === 100);
  assert.ok(hab, "habitat zone present");
  assert.ok(Math.abs(hab.r - CORE * 1.10) < 1e-9);
});

test("buildEnemyZones -- destroyed habitat (health <= 0.1) is excluded", () => {
  const foe = makeFoe({
    habitats: [{ x: 100, y: 100 }, { x: 200, y: 200 }],
    structureHealth: { habitats: [0.05, 1.0], panels: [], reactors: [], landingPads: [], extraRovers: [] },
  });
  const zones = buildEnemyZones(foe);
  // Primary + 1 functional habitat = 2.
  assert.equal(zones.length, 2);
  // The destroyed one (100, 100) should be absent.
  assert.ok(!zones.some(z => z.x === 100 && z.y === 100));
  // The functional one (200, 200) should be present.
  assert.ok(zones.some(z => z.x === 200 && z.y === 200));
});

test("buildEnemyZones -- all structure types are included with correct radii", () => {
  const foe = makeFoe({
    panels:       [{ x: 110, y: 110 }],
    reactors:     [{ x: 120, y: 120 }],
    habitats:     [{ x: 130, y: 130 }],
    landingPads:  [{ x: 140, y: 140 }],
    extraRovers:  [{ x: 150, y: 150 }],
    structureHealth: {
      panels: [1.0], reactors: [1.0], habitats: [1.0],
      landingPads: [1.0], extraRovers: [1.0],
    },
  });
  const zones = buildEnemyZones(foe);
  // primary + 5 structures = 6.
  assert.equal(zones.length, 6);

  const find = (x, y) => zones.find(z => z.x === x && z.y === y);
  assert.ok(Math.abs(find(110, 110).r - CORE * 1.10) < 1e-9);
  assert.ok(Math.abs(find(120, 120).r - CORE * 1.10) < 1e-9);
  assert.ok(Math.abs(find(130, 130).r - CORE * 1.10) < 1e-9);
  assert.ok(Math.abs(find(140, 140).r - CORE * 1.10) < 1e-9);
  assert.ok(Math.abs(find(150, 150).r - CORE * 1.10) < 1e-9);
});

test("buildEnemyZones -- legacy single landingPad field is supported", () => {
  const foe = makeFoe({
    landingPad: { x: 250, y: 250 },  // legacy singular form
  });
  const zones = buildEnemyZones(foe);
  // Primary + landingPad = 2.
  assert.equal(zones.length, 2);
  const pad = zones.find(z => z.x === 250 && z.y === 250);
  assert.ok(pad, "legacy landingPad zone present");
  assert.ok(Math.abs(pad.r - CORE * 1.10) < 1e-9);
});

test("buildEnemyZones -- destroyed extra rovers are excluded", () => {
  const foe = makeFoe({
    extraRovers: [{ x: 300, y: 300 }, { x: 400, y: 400 }],
    structureHealth: {
      panels: [], reactors: [], habitats: [], landingPads: [],
      extraRovers: [0.05, 1.0],  // first one destroyed
    },
  });
  const zones = buildEnemyZones(foe);
  // Primary + 1 functional extra = 2.
  assert.equal(zones.length, 2);
  assert.ok(!zones.some(z => z.x === 300 && z.y === 300));
  assert.ok(zones.some(z => z.x === 400 && z.y === 400));
});

// ── pointInAnyZone ────────────────────────────────────────────────────────

test("pointInAnyZone -- empty zones returns null", () => {
  assert.equal(pointInAnyZone([], 500, 500), null);
});

test("pointInAnyZone -- point inside a zone returns that zone", () => {
  const zones = [{ x: 100, y: 100, r: 50 }];
  const result = pointInAnyZone(zones, 110, 110);
  assert.ok(result);
  assert.equal(result.x, 100);
  assert.equal(result.y, 100);
});

test("pointInAnyZone -- point outside all zones returns null", () => {
  const zones = [{ x: 100, y: 100, r: 50 }];
  assert.equal(pointInAnyZone(zones, 200, 200), null);
});

test("pointInAnyZone -- point at exactly the zone boundary is NOT inside", () => {
  // Edge case: distance² === r² is treated as outside (strict <).
  const zones = [{ x: 100, y: 100, r: 50 }];
  // Point at exactly 50 units away.
  assert.equal(pointInAnyZone(zones, 150, 100), null);
});

test("pointInAnyZone -- picks first matching zone in insertion order", () => {
  // Two overlapping zones, both containing the point.
  const zones = [
    { x: 100, y: 100, r: 50 },
    { x: 110, y: 110, r: 50 },
  ];
  const result = pointInAnyZone(zones, 120, 100);
  // First in array wins.
  assert.equal(result.x, 100);
  assert.equal(result.y, 100);
});

// ── applySafetyDecay ─────────────────────────────────────────────────────

import { applySafetyDecay, isZoneExempt } from "../src/sim/enemyZones.js";

test("isZoneExempt: only solar/reactor are exempt, and only under a shared grid", () => {
  // Shared grid: generators exempt, everything else still counts.
  assert.equal(isZoneExempt("solar", true), true);
  assert.equal(isZoneExempt("reactor", true), true);
  assert.equal(isZoneExempt("habitat", true), false);
  assert.equal(isZoneExempt("pad", true), false);
  assert.equal(isZoneExempt("rover", true), false);
  // No shared grid: nothing is exempt.
  assert.equal(isZoneExempt("solar", false), false);
  assert.equal(isZoneExempt("reactor", false), false);
  // Falsy guard.
  assert.equal(isZoneExempt("solar", undefined), false);
});

const DECAY_OPTS = { passiveDecay: 0.01, hostileDecayEff: 0.20, sharedGridActive: false };

function owner(over = {}) {
  return {
    x: 5000, y: 5000,                 // primary rover parked far away by default
    panels: [], reactors: [], habitats: [], landingPads: [], extraRovers: [],
    structureHealth: {}, safetyViolations: 0, ...over,
  };
}

test("applySafetyDecay: enemy inside a habitat zone counts one violation + hostile decay", () => {
  const o = owner({ habitats: [{ x: 100, y: 100 }] });
  const enemy = [{ x: 100, y: 100 }]; // dead center of the zone
  const { updatedOwner, violationCount, damageDone } = applySafetyDecay(o, enemy, DECAY_OPTS);
  assert.equal(violationCount, 1);
  assert.equal(updatedOwner.safetyViolations, 1);
  assert.ok(Math.abs(damageDone - 0.20) < 1e-9);
  // habitat health decayed by the hostile rate
  assert.ok(Math.abs(updatedOwner.structureHealth.habitats[0] - (1 - 0.20)) < 1e-9);
});

test("applySafetyDecay: no enemy nearby -> passive decay, zero violations", () => {
  const o = owner({ habitats: [{ x: 100, y: 100 }] });
  const { updatedOwner, violationCount } = applySafetyDecay(o, [{ x: 9000, y: 9000 }], DECAY_OPTS);
  assert.equal(violationCount, 0);
  assert.ok(Math.abs(updatedOwner.structureHealth.habitats[0] - (1 - 0.01)) < 1e-9);
});

test("applySafetyDecay: destroyed structure projects no zone (no violation) but still decays", () => {
  const o = owner({
    habitats: [{ x: 100, y: 100 }],
    structureHealth: { habitats: [0.05] }, // <= DESTROYED_HEALTH (0.1)
  });
  const { updatedOwner, violationCount } = applySafetyDecay(o, [{ x: 100, y: 100 }], DECAY_OPTS);
  assert.equal(violationCount, 0, "wreckage earns no violation");
  assert.ok(Math.abs(updatedOwner.structureHealth.habitats[0] - Math.max(0, 0.05 - 0.01)) < 1e-9);
});

test("applySafetyDecay: shared grid exempts solar/reactor but not habitat", () => {
  const o = owner({ panels: [{ x: 100, y: 100 }], habitats: [{ x: 100, y: 100 }] });
  const enemy = [{ x: 100, y: 100 }];
  const shared = applySafetyDecay(o, enemy, { ...DECAY_OPTS, sharedGridActive: true });
  // Only the habitat counts; the solar panel is exempt under a shared grid.
  assert.equal(shared.violationCount, 1);
  // Panel took only passive decay; habitat took hostile.
  assert.ok(Math.abs(shared.updatedOwner.structureHealth.panels[0] - (1 - 0.01)) < 1e-9);
  assert.ok(Math.abs(shared.updatedOwner.structureHealth.habitats[0] - (1 - 0.20)) < 1e-9);
});

test("applySafetyDecay: primary rover zone counts, and non-decayed fields survive", () => {
  const o = owner({ x: 100, y: 100, structureHealth: { comsats: [1.0] } });
  const { updatedOwner, violationCount } = applySafetyDecay(o, [{ x: 100, y: 100 }], DECAY_OPTS);
  assert.equal(violationCount, 1, "primary rover zone is enforced");
  // comsats (not in structTypes) must survive the merge untouched
  assert.deepEqual(updatedOwner.structureHealth.comsats, [1.0]);
});

test("applySafetyDecay: violations accumulate onto prior count", () => {
  const o = owner({ habitats: [{ x: 100, y: 100 }], safetyViolations: 4 });
  const { updatedOwner } = applySafetyDecay(o, [{ x: 100, y: 100 }], DECAY_OPTS);
  assert.equal(updatedOwner.safetyViolations, 5);
});

// v127 (roadmap): a NatSec safetyMult inflates an actor's keep-out zones.
test("buildEnemyZones scales zone radius by the owner's safetyMult", () => {
  const base = { landingPads: [{ x: 600, y: 600 }], structureHealth: { landingPads: [1.0] } };
  const normal = buildEnemyZones(base);
  const buffed = buildEnemyZones({ ...base, safetyMult: 2.2 });
  assert.equal(buffed[0].r / normal[0].r, 2.2, "zone radius scales 1:1 with safetyMult");
  // Missing / invalid safetyMult behaves as 1 (no change, back-compat).
  assert.equal(buildEnemyZones({ ...base, safetyMult: 0 })[0].r, normal[0].r);
  assert.equal(buildEnemyZones({ ...base, safetyMult: undefined })[0].r, normal[0].r);
});

// ── attributeSafetyViolations (v160: second-arriver attribution) ─────────────

import { attributeSafetyViolations } from "../src/sim/enemyZones.js";

// Minimal players. Primary rover defaults far away so it doesn't self-trigger.
function actor(over = {}) {
  return {
    x: 5000, y: 5000, foundingSeq: undefined,
    panels: [], reactors: [], habitats: [], landingPads: [], extraRovers: [],
    structureHealth: {}, safetyViolations: 0, ...over,
  };
}

test("attributeSafetyViolations: intruder driving into an established zone is the violator", () => {
  // p1 placed a habitat first (low seq); p2's rover drives in later (high seq).
  const p1 = actor({ foundingSeq: 1, habitats: [{ x: 100, y: 100, seq: 2 }] });
  const p2 = actor({ x: 100, y: 100, foundingSeq: 9 }); // rover sitting in the zone
  const { v1, v2 } = attributeSafetyViolations(p1, p2, {});
  assert.equal(v1, 0, "the first placer is NOT the violator");
  assert.equal(v2, 1, "the second arriver (intruding rover) is the violator");
});

test("attributeSafetyViolations: building a zone around an already-present rover charges the builder", () => {
  // p2's rover was there first (seq 1); p1 builds a habitat around it later (seq 50).
  const p1 = actor({ foundingSeq: 50, habitats: [{ x: 100, y: 100, seq: 50 }] });
  const p2 = actor({ x: 100, y: 100, foundingSeq: 1 });
  const { v1, v2 } = attributeSafetyViolations(p1, p2, {});
  assert.equal(v1, 1, "the owner who arrived second is the violator");
  assert.equal(v2, 0, "the rover that was there first is innocent");
});

test("attributeSafetyViolations: with no seqs at all, the intruding rover is charged by default", () => {
  const p1 = actor({ habitats: [{ x: 100, y: 100 }] }); // no seqs anywhere
  const p2 = actor({ x: 100, y: 100 });
  const { v1, v2 } = attributeSafetyViolations(p1, p2, {});
  assert.equal(v1, 0);
  assert.equal(v2, 1);
});

test("attributeSafetyViolations: two overlapping rovers -> only the later one is the violator (both overlaps)", () => {
  const p1 = actor({ x: 100, y: 100, foundingSeq: 1 });
  const p2 = actor({ x: 100, y: 100, foundingSeq: 5 });
  const { v1, v2 } = attributeSafetyViolations(p1, p2, {});
  assert.equal(v1, 0, "first rover down is never the violator");
  assert.equal(v2, 2, "later rover owns both contested overlaps");
});

test("attributeSafetyViolations: shared grid exempts a solar zone from violation", () => {
  const p1 = actor({ foundingSeq: 1, panels: [{ x: 100, y: 100, seq: 2 }] });
  const p2 = actor({ x: 100, y: 100, foundingSeq: 9 });
  const open = attributeSafetyViolations(p1, p2, { sharedGridActive: false });
  assert.equal(open.v2, 1, "solar zone breach counts when the grid is independent");
  const shared = attributeSafetyViolations(p1, p2, { sharedGridActive: true });
  assert.equal(shared.v1, 0);
  assert.equal(shared.v2, 0, "shared grid deconflicts the generator zone");
});

test("attributeSafetyViolations: a destroyed anchor projects no zone", () => {
  const p1 = actor({
    foundingSeq: 1,
    habitats: [{ x: 100, y: 100, seq: 2 }],
    structureHealth: { habitats: [0.05] }, // wrecked
  });
  const p2 = actor({ x: 100, y: 100, foundingSeq: 9 });
  const { v1, v2 } = attributeSafetyViolations(p1, p2, {});
  assert.equal(v1, 0);
  assert.equal(v2, 0, "no zone, no violation");
});

test("attributeSafetyViolations: a far-away rover triggers nothing", () => {
  const p1 = actor({ foundingSeq: 1, habitats: [{ x: 100, y: 100, seq: 2 }] });
  const p2 = actor({ x: 9000, y: 9000, foundingSeq: 9 });
  const { v1, v2 } = attributeSafetyViolations(p1, p2, {});
  assert.equal(v1, 0);
  assert.equal(v2, 0);
});

// ── coordinationIntrusions (v171: middle-tier advisories) ───────────────────
import { coordinationIntrusions } from "../src/sim/enemyZones.js";

test("coordinationIntrusions: rover in the coordination band (not exclusion) is an advisory", () => {
  const rEx = CORE;
  // P1 habitat; P2 rover at 1.3x exclusion -> inside coordination (1.7x), outside exclusion
  const p1 = actor({ habitats: [{ x: 100, y: 100, seq: 2 }] });
  const p2 = actor({ x: 100 + rEx * 1.3, y: 100 });
  const { a1, a2 } = coordinationIntrusions(p1, p2, { coordMult: 1.7 });
  assert.equal(a1, 1, "advisory against P1's zone");
  assert.equal(a2, 0);
});

test("coordinationIntrusions: rover inside the exclusion is NOT an advisory (it's a violation)", () => {
  const rEx = CORE;
  const p1 = actor({ habitats: [{ x: 100, y: 100, seq: 2 }] });
  const p2 = actor({ x: 100 + rEx * 0.5, y: 100 }); // inside exclusion
  assert.equal(coordinationIntrusions(p1, p2, {}).a1, 0);
});

test("coordinationIntrusions: rover beyond the coordination radius is clear", () => {
  const rEx = CORE;
  const p1 = actor({ habitats: [{ x: 100, y: 100, seq: 2 }] });
  const p2 = actor({ x: 100 + rEx * 2.2, y: 100 }); // beyond 1.7x
  assert.equal(coordinationIntrusions(p1, p2, { coordMult: 1.7 }).a1, 0);
});

test("coordinationIntrusions: an easement waives advisories too", () => {
  const rEx = CORE;
  const p1 = actor({ habitats: [{ x: 100, y: 100, seq: 2 }], easements: [2] });
  const p2 = actor({ x: 100 + rEx * 1.3, y: 100 });
  assert.equal(coordinationIntrusions(p1, p2, {}).a1, 0);
});
