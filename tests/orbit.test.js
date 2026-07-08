// Orbit / disposal layer tests (roadmap). Pure foundation: orbital objects,
// disposal (graveyard vs crash), surface debris keep-out, ejecta-to-orbit
// coupling, and transient-debris decay. Physical numbers are placeholders
// (ORBIT_TUNING); these tests lock the mechanics' SHAPE, not survey accuracy.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  makeOrbitalObject, disposeOrbitalObject, loftEjectaToOrbit,
  tickOrbitalObjects, orbitalSurfaceZones, ORBIT_TUNING, _resetOrbitIds,
} from "../src/sim/orbit.js";
import { PIXELS_PER_KM, W } from "../src/sim/constants.js";

test("makeOrbitalObject clamps ground projection to the map and assigns an id", () => {
  _resetOrbitIds();
  const o = makeOrbitalObject({ owner: 0, groundX: 99999, groundY: -50 });
  assert.ok(o.id.startsWith("orb_"));
  assert.ok(o.groundX <= W - 1 && o.groundX >= 0);
  assert.equal(o.groundY, 0, "negative y clamps to 0");
});

test("graveyard disposal is clean: no surface zone, boosted to graveyard band", () => {
  const o = makeOrbitalObject({ owner: 1, massT: 3, band: "low" });
  const { object, surfaceZone, ejectaCloud } = disposeOrbitalObject(o, { mode: "graveyard" });
  assert.equal(object.band, "graveyard");
  assert.equal(object.disposed, true);
  assert.equal(surfaceZone, null, "a responsible graveyard disposal leaves no surface keep-out");
  assert.equal(ejectaCloud, null);
});

test("crash disposal leaves a surface debris keep-out scaled by mass", () => {
  const light = disposeOrbitalObject(makeOrbitalObject({ owner: 0, massT: 1 }), { mode: "crash" });
  const heavy = disposeOrbitalObject(makeOrbitalObject({ owner: 0, massT: 5 }), { mode: "crash" });
  assert.ok(light.surfaceZone && heavy.surfaceZone, "a crash leaves a surface zone");
  assert.ok(heavy.surfaceZone.r > light.surfaceZone.r, "heavier object -> larger debris field");
  // Radius matches the documented placeholder relationship.
  const expectKm = ORBIT_TUNING.crashDebrisBaseKm + ORBIT_TUNING.crashDebrisPerTonKm * 1;
  assert.equal(light.surfaceZone.r, expectKm * PIXELS_PER_KM);
  assert.equal(light.surfaceZone.kind, "crash_debris");
});

test("crash disposal can target a point away from the sub-lunar point", () => {
  const o = makeOrbitalObject({ owner: 0, massT: 2, groundX: 600, groundY: 600 });
  const { surfaceZone } = disposeOrbitalObject(o, { mode: "crash", targetX: 300, targetY: 400 });
  assert.equal(surfaceZone.x, 300);
  assert.equal(surfaceZone.y, 400);
});

test("crash lofts an ejecta cloud to orbit (ejecta-to-orbit coupling)", () => {
  const o = makeOrbitalObject({ owner: 1, massT: 10, groundX: 500, groundY: 500 });
  const { ejectaCloud } = disposeOrbitalObject(o, { mode: "crash" });
  assert.ok(ejectaCloud, "mass lofts some ejecta");
  assert.equal(ejectaCloud.kind, "debris");
  assert.equal(ejectaCloud.massT, ORBIT_TUNING.ejectaToOrbitCoupling * 10);
  assert.equal(ejectaCloud.decayRounds, ORBIT_TUNING.orbitalDebrisDecayRounds);
  assert.equal(ejectaCloud.groundX, 500);
});

test("loftEjectaToOrbit returns a decaying cloud or null for zero energy", () => {
  assert.equal(loftEjectaToOrbit({ owner: 0, x: 1, y: 1, energyT: 0 }), null);
  const cloud = loftEjectaToOrbit({ owner: 0, x: 10, y: 20, energyT: 5 });
  assert.ok(cloud && cloud.decayRounds > 0);
});

test("tickOrbitalObjects decays transient debris and drops expired clouds", () => {
  const persistent = makeOrbitalObject({ owner: 0, kind: "comsat" });             // no decay
  let debris = { ...makeOrbitalObject({ owner: 0, kind: "debris" }), decayRounds: 2 };
  let objs = [persistent, debris];
  objs = tickOrbitalObjects(objs); // 2 -> 1
  assert.equal(objs.length, 2);
  objs = tickOrbitalObjects(objs); // 1 -> 0 -> dropped
  assert.equal(objs.length, 1, "expired debris cloud removed");
  assert.equal(objs[0].kind, "comsat", "the persistent operational object survives");
});

test("orbitalSurfaceZones projects only transient debris clouds onto the surface", () => {
  const sat    = makeOrbitalObject({ owner: 0, kind: "comsat" });
  const debris = { ...makeOrbitalObject({ owner: 1, kind: "debris", massT: 2, groundX: 400, groundY: 400 }), decayRounds: 3 };
  const zones = orbitalSurfaceZones([sat, debris]);
  assert.equal(zones.length, 1, "operational sats do not project a surface keep-out; debris does");
  assert.equal(zones[0].x, 400);
  assert.equal(zones[0].kind, "orbital_debris");
});

// ── v203: debris zones feed the violation tally ──────────────────────────────
import { debrisViolationCount } from "../src/sim/orbit.js";

test("debrisViolationCount: counts assets inside debris zones, one charge per asset", () => {
  const zones = [{ x: 100, y: 100, r: 20 }, { x: 400, y: 400, r: 10 }];
  const player = {
    x: 105, y: 105,                       // rover inside zone 1
    habitats: [{ x: 110, y: 95 }],        // inside zone 1
    panels: [{ x: 300, y: 300 }],         // outside both
    reactors: [{ x: 395, y: 402 }],       // inside zone 2
    landingPads: [], extraRovers: [],
  };
  assert.equal(debrisViolationCount(zones, player), 3);
});

test("debrisViolationCount: 0 for empty zones, null player, or clear assets", () => {
  assert.equal(debrisViolationCount([], { x: 1, y: 1 }), 0);
  assert.equal(debrisViolationCount([{ x: 0, y: 0, r: 5 }], null), 0);
  assert.equal(debrisViolationCount([{ x: 0, y: 0, r: 5 }], { x: 100, y: 100, habitats: [] }), 0);
});

test("debrisViolationCount: an asset inside two overlapping zones is charged once", () => {
  const zones = [{ x: 100, y: 100, r: 30 }, { x: 110, y: 100, r: 30 }];
  assert.equal(debrisViolationCount(zones, { x: 105, y: 100 }), 1);
});
