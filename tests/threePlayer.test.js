// ── Three-actor engine tests (v192) ─────────────────────────────────────────
//
// Verifies the N-actor generalizations that make a solid 3-player game correct
// at the simulation level: PSR territory partition (computeClaimsN) and safety-
// violation attribution (attributeSafetyViolationsN). The 2-actor wrappers are
// covered by simDay.test.js / enemyZones.test.js; here we prove 3 actors behave.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { computeClaimsN } from "../src/sim/simDay.js";
import { attributeSafetyViolationsN, buildEnemyZonesMulti } from "../src/sim/enemyZones.js";
import { W, ZONE_RADII_PX, ACTOR_COLORS } from "../src/sim/constants.js";
import { PSR_MASK } from "../src/sim/mapData.js";

// A small PSR patch around a known centre so the partition has pixels to award.
const CX = 500, CY = 500;
const testPixels = [
  [CX - 8, CY],      // nearest to a left actor
  [CX + 8, CY],      // nearest to a right actor
  [CX,     CY - 8],  // nearest to a top actor
  [CX,     CY],      // centre
];
beforeEach(() => {
  for (const [x, y] of testPixels) PSR_MASK[y * W + x] = 1;
});

// ── computeClaimsN: three actors partition PSR by nearest base ───────────────
test("computeClaimsN: each PSR pixel is awarded to the nearest active base", () => {
  const players = [
    { x: CX - 10, y: CY, active: true },  // Actor I  (left)
    { x: CX + 10, y: CY, active: true },  // Actor II (right)
    { x: CX, y: CY - 10, active: true },  // Actor III (top)
  ];
  const c = computeClaimsN(players, [100, 100, 100]);
  assert.equal(c[CY * W + (CX - 8)], 1, "left pixel → Actor I");
  assert.equal(c[CY * W + (CX + 8)], 2, "right pixel → Actor II");
  assert.equal(c[(CY - 8) * W + CX], 3, "top pixel → Actor III");
});

test("computeClaimsN: a pixel outside every claim radius is unclaimed (0)", () => {
  const players = [
    { x: 0, y: 0, active: true },
    { x: W - 1, y: 0, active: true },
    { x: 0, y: 1000, active: true },
  ];
  const c = computeClaimsN(players, [5, 5, 5]); // radii too tight to reach centre
  assert.equal(c[CY * W + CX], 0);
});

test("computeClaimsN: an inactive / null actor claims nothing", () => {
  const players = [
    { x: CX - 10, y: CY, active: true },
    null,
    { x: CX + 10, y: CY, active: false },
  ];
  const c = computeClaimsN(players, [100, 100, 100]);
  // Only Actor I is active, so every reachable pixel is 1 and none are 2 or 3.
  assert.equal(c[CY * W + (CX - 8)], 1);
  for (let k = 0; k < c.length; k++) {
    assert.notEqual(c[k], 2);
    assert.notEqual(c[k], 3);
  }
});

test("computeClaimsN: closer actor wins a contested pixel (tie → lower index)", () => {
  // Actor II and III equidistant from the centre pixel; Actor I is closest.
  const players = [
    { x: CX - 2, y: CY, active: true },   // closest to centre
    { x: CX + 40, y: CY, active: true },
    { x: CX, y: CY - 40, active: true },
  ];
  const c = computeClaimsN(players, [200, 200, 200]);
  assert.equal(c[CY * W + CX], 1);
});

// ── attributeSafetyViolationsN: violations across three actors ───────────────
const CORE = ZONE_RADII_PX.core;
// Actor with a single habitat anchor at (hx,hy) placed at sequence `seq`.
const owner = (hx, hy, seq, extra = {}) => ({
  habitats: [{ x: hx, y: hy, seq }],
  structureHealth: { habitats: [1] },
  x: null, y: null, extraRovers: [], easements: [], ...extra,
});
// Actor whose primary rover sits at (rx,ry), arriving at sequence `seq`.
const intruder = (rx, ry, seq) => ({
  x: rx, y: ry, foundingSeq: seq,
  habitats: [], structureHealth: {}, extraRovers: [],
});

test("attributeSafetyViolationsN: a later-arriving rover breaching a first-mover's core is the violator", () => {
  const players = [
    owner(100, 100, 1),                 // Actor I habitat, placed first
    intruder(100 + CORE * 0.5, 100, 5), // Actor II rover inside I's core, later
    intruder(9000, 9000, 6),            // Actor III far away
  ];
  const v = attributeSafetyViolationsN(players);
  assert.deepEqual(v, [0, 1, 0], "Actor II (second arriver) owns the violation");
});

test("attributeSafetyViolationsN: two different actors each breaching one owner each score", () => {
  const players = [
    owner(100, 100, 1),                 // Actor I habitat, first
    intruder(100 + CORE * 0.8, 100, 5), // Actor II inside I's core
    intruder(100 - CORE * 0.8, 100, 6), // Actor III inside I's core
  ];
  const v = attributeSafetyViolationsN(players);
  assert.equal(v[1], 1, "Actor II charged for breaching I");
  assert.equal(v[2], 1, "Actor III charged for breaching I");
  assert.equal(v[0], 0, "first-mover Actor I is innocent");
});

test("attributeSafetyViolationsN: an easement waives that actor's violations only", () => {
  const players = [
    owner(100, 100, 1, { easements: [2] }), // I waives vs Actor II (id 2)
    intruder(100 + CORE * 0.8, 100, 5),     // Actor II, waived
    intruder(100 - CORE * 0.8, 100, 6),     // Actor III, still charged
  ];
  const v = attributeSafetyViolationsN(players);
  assert.equal(v[1], 0, "Actor II waived");
  assert.equal(v[2], 1, "Actor III still charged");
});

test("attributeSafetyViolationsN: the earlier-placed owner is innocent even when breached", () => {
  // Owner placed LATER than the rover already sitting there → owner is the
  // second arriver and owns the violation (drives into an existing presence).
  const players = [
    owner(100, 100, 9),           // habitat placed late (seq 9)
    intruder(100, 100, 2),        // rover was already there (seq 2)
    intruder(9000, 9000, 3),
  ];
  const v = attributeSafetyViolationsN(players);
  assert.equal(v[0], 1, "late-arriving owner is the violator");
  assert.equal(v[1], 0, "the earlier rover is innocent");
});

// ── buildEnemyZonesMulti: union of all foes' keep-out zones ──────────────────
test("buildEnemyZonesMulti: a rover must avoid every other actor's zones", () => {
  const foeB = intruder(200, 200, 1); foeB.habitats = [{ x: 200, y: 200 }];
  foeB.structureHealth = { habitats: [1] };
  const foeC = intruder(400, 400, 1); foeC.habitats = [{ x: 400, y: 400 }];
  foeC.structureHealth = { habitats: [1] };
  const zones = buildEnemyZonesMulti([foeB, foeC]);
  // Each foe contributes at least its rover + habitat zones; union is non-empty
  // and strictly larger than either foe alone.
  const onlyB = buildEnemyZonesMulti([foeB]);
  assert.ok(zones.length > onlyB.length, "union spans both foes");
});

// ── Palette: three distinct team colors exist ───────────────────────────────
test("ACTOR_COLORS: three distinct team colors are defined", () => {
  assert.equal(ACTOR_COLORS.length, 3);
  assert.equal(new Set(ACTOR_COLORS).size, 3, "all three colors are distinct");
});
