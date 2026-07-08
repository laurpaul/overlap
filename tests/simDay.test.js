// simDay integration tests.
//
// These tests run the per-day simulation step against synthetic map data
// installed directly into the typed-array buffers. They cover the classes
// of bugs the README v15-v20 changelog mentions:
//
//   • Recharge fires at the right power threshold (v15 bug 1)
//   • Recharge dwell doesn't trap full-power rovers at startup (v15 bug 2)
//   • Hop to next-fresh-pixel when current pixel depletes (v17/v18)
//   • Mining starts the same turn the rover arrives (v16 bug B)
//   • Hysteresis band prevents the 49↔51% bounce (v20)
//
// Map state is mutated globally because mapData.js exports module-level
// buffers, so tests reset what they touch.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { simDay, computeClaims, makePlayer } from "../src/sim/index.js";
import {
  PSR_MASK, RIDGE_MASK, PIXEL_CRATER, ICE_DEPTH_MAP, SLOPE_MAP, EARTH_VIS_MAP,
  CRATER_DATA,
} from "../src/sim/mapData.js";
import {
  W, ROVER_STEP, ROVER_REACH, POWER_CAP,
  ROVER_RECHARGE_LOW, ROVER_RECHARGE_HIGH,
} from "../src/sim/constants.js";

// ── Test fixture ────────────────────────────────────────────────────────────
// Single PSR crater: a 5×5 block centred on (500, 500). 25 pixels.
// Crater index 0. Ice-rich (localIceFrac = 0.8 → cap ~126 kg/px).
// Outside the block: no PSR, no slope.

const CRATER_CX = 500;
const CRATER_CY = 500;

function installFixtureMap() {
  // Wipe relevant pixels.
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const idx = (CRATER_CY + dy) * W + (CRATER_CX + dx);
      PSR_MASK[idx] = 0;
      PIXEL_CRATER[idx] = -1;
      ICE_DEPTH_MAP[idx] = 0;
      SLOPE_MAP[idx] = 0;
      EARTH_VIS_MAP[idx] = 1.0;
    }
  }
  // Install the 5×5 PSR block.
  const pixels = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = CRATER_CX + dx;
      const y = CRATER_CY + dy;
      const idx = y * W + x;
      PSR_MASK[idx] = 1;
      PIXEL_CRATER[idx] = 0;
      ICE_DEPTH_MAP[idx] = 0.8;
      pixels.push(idx);
    }
  }
  // Install one crater into CRATER_DATA[0].
  CRATER_DATA[0] = {
    cx: CRATER_CX, cy: CRATER_CY,
    mineX: CRATER_CX, mineY: CRATER_CY,
    size: pixels.length,
    pixels,
    quality: 1.0,
  };
  // Truncate to just our test crater so the array is clean.
  CRATER_DATA.length = 1;
}

function makeRover({ x, y, power = POWER_CAP, ice = 0, waypoint = null }) {
  // Minimal player object that satisfies simDay's shape requirements.
  const p = makePlayer({ x, y }, 1, "#A8A8F0");
  p.x = x; p.y = y;
  p.power = power;
  p.ice = ice;
  if (waypoint) p.currentWaypoint = waypoint;
  return p;
}

beforeEach(() => installFixtureMap());

// ── Mining starts the turn the rover arrives ───────────────────────────────
test("simDay: rover on a PSR pixel mines this same turn", () => {
  const r = makeRover({ x: CRATER_CX, y: CRATER_CY });
  const health = new Float32Array([1.0]);
  const out = simDay(r, health, 0);
  // Status should be "mining" and ice should increase from 0.
  assert.equal(out.status, "mining");
  assert.ok(out.ice > 0, `expected ice > 0, got ${out.ice}`);
  assert.ok(health[0] < 1.0, "crater health should drop");
});

// ── Recharge dwell does NOT trap a full-power rover (v15 bug 2) ───────────
test("simDay: full-power rover does not get trapped in recharge dwell", () => {
  // Full charge, no waypoint marked _recharge. Even if rover happens to sit
  // somewhere that could be a charging zone, dwell shouldn't fire.
  const r = makeRover({ x: CRATER_CX + 30, y: CRATER_CY, power: POWER_CAP });
  const health = new Float32Array([1.0]);
  const out = simDay(r, health, 0);
  assert.notEqual(out.status, "recharging");
});

// ── Mid-power rover (above LOW, below HIGH) does NOT auto-recharge by itself
test("simDay: rover at 60% with no _recharge waypoint does not enter dwell", () => {
  const r = makeRover({ x: CRATER_CX, y: CRATER_CY, power: POWER_CAP * 0.6 });
  const health = new Float32Array([1.0]);
  const out = simDay(r, health, 0);
  // Power should change due to mining drain, but rover is mining (on PSR),
  // not dwelling at base.
  assert.notEqual(out.status, "recharging");
});

// ── Recharge dwell DOES fire when waypoint is tagged _recharge and a source is in range
test("simDay: recharge dwell adds charge when source is in range and waypoint is _recharge", () => {
  // Rover at (300, 300), low power, with a pad at (300, 300) and a
  // _recharge waypoint pointing to it.
  const startPower = POWER_CAP * 0.30;
  const r = makeRover({ x: 300, y: 300, power: startPower });
  r.landingPads = [{ x: 300, y: 300 }];
  r.structureHealth.landingPads = [1.0];
  r.currentWaypoint = { x: 300, y: 300, _recharge: true };

  const health = new Float32Array([1.0]);
  const out = simDay(r, health, 0);
  assert.equal(out.status, "recharging");
  assert.ok(out.power > startPower, `power should increase, was ${startPower}, now ${out.power}`);
});

// ── Per-pixel hop: when current pixel taps out, rover queues a new waypoint
test("simDay: depleted pixel queues a hop to the next-fresh pixel", () => {
  const r = makeRover({ x: CRATER_CX, y: CRATER_CY });
  // Mark the current pixel as already mined nearly to cap (mineMap).
  const here = CRATER_CY * W + CRATER_CX;
  // pxIceCap for iceFrac=0.8 is 150 * (0.20 + 0.80*0.80) = 150 * 0.84 = 126
  r.mineMap = { [here]: 126 };  // tapped out

  const health = new Float32Array([1.0]);
  const out = simDay(r, health, 0);

  // Either we got a hop waypoint queued, OR we just kept mining if the pixel
  // wasn't quite at >=99% of cap. With mineMap = 126 and cap = 126, it IS at
  // 100%, so the hop branch should trigger.
  const hopWaypoint = out.waypoints[0] || out.currentWaypoint;
  assert.ok(hopWaypoint, "expected a hop waypoint to be queued");
  assert.ok(hopWaypoint._hop, "waypoint should be tagged _hop");
  // The hop target should be a different pixel inside the crater.
  assert.ok(
    hopWaypoint.x !== CRATER_CX || hopWaypoint.y !== CRATER_CY,
    "hop target should differ from current pixel"
  );
});

// ── Hysteresis band: rover at HIGH+epsilon does not start recharging
test("simDay: hysteresis -- rover near recharge HIGH does not enter dwell", () => {
  // This validates the FRAMEWORK (constants) rather than the dwell branch.
  // The actual auto-target / pickRoverTarget logic lives in GameApp; here
  // we just confirm the hysteresis values are sane and the dwell branch
  // respects the _recharge flag rather than a raw power check.
  const r = makeRover({
    x: 300, y: 300,
    power: POWER_CAP * (ROVER_RECHARGE_HIGH + 0.01),  // just above HIGH
  });
  r.landingPads = [{ x: 300, y: 300 }];
  r.structureHealth.landingPads = [1.0];
  // No _recharge waypoint set → dwell branch should not fire.
  const health = new Float32Array([1.0]);
  const out = simDay(r, health, 0);
  assert.notEqual(out.status, "recharging");
});

// ── Movement: rover with a waypoint moves toward it ───────────────────────
test("simDay: rover with a waypoint moves toward it", () => {
  // Place rover far from waypoint so it definitely moves rather than arrives.
  // Use no PSR at the start so we don't get into mining branch.
  const r = makeRover({
    x: 100, y: 100, power: POWER_CAP,
    waypoint: { x: 400, y: 100, _auto: true },
  });
  const health = new Float32Array([1.0]);
  const out = simDay(r, health, 0);

  assert.ok(out.x > 100, `expected rover to advance in x, got x=${out.x}`);
  assert.equal(out.y, 100);
  assert.ok(out.power < POWER_CAP, "power should drop on a movement turn");
  // Should be moving, not mining or idle.
  assert.equal(out.status, "moving");
});

// ── Inactive rover (pre-arrival) does nothing ──────────────────────────────
test("simDay: inactive rover returns idle and no movement", () => {
  const r = makeRover({ x: 100, y: 100 });
  r.active = false;
  const health = new Float32Array([1.0]);
  const out = simDay(r, health, 0);
  assert.equal(out.status, "idle");
  assert.equal(out.x, 100);
  assert.equal(out.y, 100);
});

test("simDay: rover before arrival day is idle", () => {
  const r = makeRover({ x: 100, y: 100 });
  r.arrivalDay = 5;
  const health = new Float32Array([1.0]);
  const out = simDay(r, health, 0);  // globalDay=0, arrivalDay=5
  assert.equal(out.status, "idle");
});

// ── Impassable terrain stalls the rover ────────────────────────────────────
test("simDay: rover on >25° slope is stalled", () => {
  // Plant a steep slope right where the rover is.
  SLOPE_MAP[100 * W + 100] = 26;  // > 25° impassable
  const r = makeRover({
    x: 100, y: 100, power: POWER_CAP,
    waypoint: { x: 400, y: 100, _auto: true },
  });
  const health = new Float32Array([1.0]);
  const out = simDay(r, health, 0);
  assert.equal(out.status, "stalled");
  // Should not have moved.
  assert.equal(out.x, 100);
  // Reset.
  SLOPE_MAP[100 * W + 100] = 0;
});

// ── Deposit at habitat empties the rover ───────────────────────────────────
test("simDay: rover at a functional habitat deposits ice", () => {
  const r = makeRover({ x: 200, y: 200, ice: 50 });
  r.habitats = [{ x: 200, y: 200 }];
  r.habitatPower = [40];  // > 0
  r.structureHealth.habitats = [1.0];
  const health = new Float32Array([1.0]);
  const out = simDay(r, health, 0);
  assert.equal(out.ice, 0, "ice should drain to zero at the habitat");
  // status should reflect the deposit (or be overridden by subsequent
  // behavior in the same turn; either way ice should be 0).
});

// ── Pickup from pad ────────────────────────────────────────────────────────
test("simDay: rover at a pad picks up a pending delivery", () => {
  const r = makeRover({ x: 250, y: 250 });
  r.landingPads = [{ x: 250, y: 250 }];
  r.structureHealth.landingPads = [1.0];
  r.pendingDeliveries = [{ id: "p1", type: "solar", padIdx: 0 }];
  const health = new Float32Array([1.0]);
  const out = simDay(r, health, 0);
  assert.equal(out.pendingDeliveries.length, 0, "delivery should have been picked up");
  assert.deepEqual(out.carrying, { id: "p1", type: "solar", padIdx: 0 });
});

// ── computeClaims: each player's nearest PSR pixels are claimed ────────────
test("computeClaims: nearest player claims the PSR pixel", () => {
  // Two players on opposite sides; centred PSR fixture pixels.
  const p1 = { x: 480, y: 500, active: true };
  const p2 = { x: 520, y: 500, active: true };
  const c = computeClaims(p1, p2, 100, 100);

  // The pixel at (498, 500) is closer to p1; (502, 500) is closer to p2.
  const i1 = 500 * W + 498;
  const i2 = 500 * W + 502;
  // Only PSR pixels in our fixture are within ±2 of (500, 500).
  assert.equal(c[i1], 1, "(498, 500) should be claimed by p1");
  assert.equal(c[i2], 2, "(502, 500) should be claimed by p2");
});

// ── ICE_MASS_FRACTION override scales mining ────────────────────────────
test("simDay: BASE_MINE_RATE override scales the ice yield", () => {
  // Run two identical sims, one with a 2× BASE_MINE_RATE override.
  // The double-rate sim should mine ~2× the ice (clamped by per-pixel cap).
  const rovA = makeRover({ x: CRATER_CX, y: CRATER_CY });
  const rovB = makeRover({ x: CRATER_CX, y: CRATER_CY });
  const hA = new Float32Array([1.0]);
  const hB = new Float32Array([1.0]);
  // Use a TINY BASE_MINE_RATE override that's well below the per-pixel cap
  // so we actually see the linear scaling, not just the cap.
  const a = simDay(rovA, hA, 0, { BASE_MINE_RATE: 1.0 });
  const b = simDay(rovB, hB, 0, { BASE_MINE_RATE: 2.0 });
  // Both rovers mined this turn; the 2× rate should produce ~2× ice.
  assert.ok(a.ice > 0, "rover A should mine some ice");
  assert.ok(b.ice > 0, "rover B should mine some ice");
  const ratio = b.ice / a.ice;
  assert.ok(ratio > 1.9 && ratio < 2.1,
    `2× BASE_MINE_RATE should give ~2× ice; got ratio = ${ratio.toFixed(3)}`);
});

test("computeClaims: pixels outside claim radius are unclaimed", () => {
  const p1 = { x: 0, y: 0, active: true };
  const p2 = { x: 1100, y: 1100, active: true };
  const c = computeClaims(p1, p2, 50, 50);  // tight radius
  // Our crater is way outside both radii.
  const i = CRATER_CY * W + CRATER_CX;
  assert.equal(c[i], 0);
});

test("computeClaims: null p2 doesn't crash; only p1 claims appear", () => {
  // Regression test for the v27 defense-in-depth fix. Previously the
  // `p?.active !== false` pattern returned true for a null player and
  // then crashed on p.x. Now p1-only games (e.g. unevenArrival pre-P2
  // arrival) return a claim grid with no p2 claims.
  const p1 = { x: CRATER_CX, y: CRATER_CY, active: true };
  const c = computeClaims(p1, null, 100, 100);
  const i = CRATER_CY * W + CRATER_CX;
  // p1 should claim the centre pixel.
  assert.equal(c[i], 1);
  // No p2 claims anywhere.
  for (let k = 0; k < c.length; k++) {
    assert.notEqual(c[k], 2, `unexpected p2 claim at index ${k}`);
  }
});

test("computeClaims: null p1 doesn't crash either", () => {
  const p2 = { x: CRATER_CX, y: CRATER_CY, active: true };
  const c = computeClaims(null, p2, 100, 100);
  const i = CRATER_CY * W + CRATER_CX;
  assert.equal(c[i], 2);
});

// ── mineMap chaining (regression test for v27 extra-rover fix) ─────────────
// Background: stepPlayer chains the running mineMap through each extra rover's
// simDay call, so multiple rovers within the same day see each other's per-
// pixel depletions. Verify simDay properly extends the input mineMap.

test("simDay: respects an input mineMap (pixel already mined → reduced yield)", () => {
  // Pre-mine the current pixel close to its cap.
  const here = CRATER_CY * W + CRATER_CX;
  // px cap at iceFrac=0.8 is 150 * (0.20 + 0.80*0.80) = 126.
  const rover = makeRover({ x: CRATER_CX, y: CRATER_CY });
  rover.mineMap = { [here]: 125 };  // 1 kg of capacity remaining

  const out = simDay(rover, new Float32Array([1.0]), 0);
  // Should mine at most 1 kg (the remaining capacity), since pxRemaining is tight.
  assert.ok(out.ice <= 1.1, `ice should be ≤ 1 kg, got ${out.ice}`);
});

test("simDay: output mineMap contains both prior entries and new mining", () => {
  // Pre-populate an entry for a *different* pixel; simDay should preserve it.
  const otherPx = (CRATER_CY - 1) * W + (CRATER_CX - 1);
  const here    = CRATER_CY * W + CRATER_CX;
  const rover = makeRover({ x: CRATER_CX, y: CRATER_CY });
  rover.mineMap = { [otherPx]: 42 };  // dummy prior entry

  const out = simDay(rover, new Float32Array([1.0]), 0);
  // Prior entry should be preserved (chaining contract).
  assert.equal(out.mineMap[otherPx], 42, "prior mineMap entry preserved");
  // New mining should appear at the current pixel.
  assert.ok(out.mineMap[here] > 0, `new mining entry written at ${here}, got ${out.mineMap[here]}`);
});

test("simDay: two sequential simDay calls accumulate at the same pixel", () => {
  // Simulates the chained-mineMap scenario: rover #1 mines, then rover #2
  // sees rover #1's depletion in the input mineMap.
  const here = CRATER_CY * W + CRATER_CX;

  // First rover, fresh mineMap.
  const rA = makeRover({ x: CRATER_CX, y: CRATER_CY });
  const outA = simDay(rA, new Float32Array([1.0]), 0);
  const minedA = outA.mineMap[here] || 0;
  assert.ok(minedA > 0, "first rover should record mining at the target pixel");

  // Second rover sees outA's mineMap.
  const rB = makeRover({ x: CRATER_CX, y: CRATER_CY });
  rB.mineMap = { ...outA.mineMap };
  const outB = simDay(rB, new Float32Array([1.0]), 0);
  const minedB = outB.mineMap[here] || 0;

  // The second rover's mineMap[here] should be ≥ first rover's (cumulative).
  assert.ok(minedB >= minedA,
    `chained mineMap should accumulate; rovA=${minedA}, rovB=${minedB}`);
});

// ── pendingDeliveries chaining (regression for v27 double-pickup fix) ──────
// In App.jsx's stepPlayer, each extra rover used to inherit the original
// pendingDeliveries from sForSim, so two rovers at the same pad could
// "both" pick up the SAME delivery (double-spending). v27 chains pending
// through each extra rover's simDay call so each delivery is claimed once.
// Verify simDay correctly consumes a delivery from its input list.

test("simDay: rover at pad picks up a pendingDelivery and removes it from output", () => {
  // Place a pad at a known spot and put the rover right on it.
  const padX = 100, padY = 100;
  const player = {
    active: true,
    arrivalDay: 0,
    x: padX, y: padY,
    power: POWER_CAP, ice: 0,
    base: { x: padX, y: padY },
    panels: [], reactors: [], habitats: [],
    landingPads: [{ x: padX, y: padY }],
    structureHealth: { landingPads: [1.0] },
    pendingDeliveries: [{ id: 1, type: "solar", padIdx: 0 }],
    carrying: null,
    waypoints: [], currentWaypoint: null,
    mineMap: {},
  };

  const out = simDay(player, new Float32Array([1.0]), 0);

  // The delivery should now be on the rover, not in pendingDeliveries.
  assert.ok(out.carrying, "rover should be carrying after pickup");
  assert.equal(out.carrying.type, "solar");
  assert.equal(out.pendingDeliveries.length, 0, "delivery removed from list");
});

test("simDay: rover not at pad does NOT consume pendingDeliveries", () => {
  // Pad at (100, 100); rover at (500, 500) -- far away.
  const player = {
    active: true,
    arrivalDay: 0,
    x: 500, y: 500,
    power: POWER_CAP, ice: 0,
    base: { x: 500, y: 500 },
    panels: [], reactors: [], habitats: [],
    landingPads: [{ x: 100, y: 100 }],
    structureHealth: { landingPads: [1.0] },
    pendingDeliveries: [{ id: 1, type: "solar", padIdx: 0 }],
    carrying: null,
    waypoints: [], currentWaypoint: null,
    mineMap: {},
  };

  const out = simDay(player, new Float32Array([1.0]), 0);
  // No carrying, delivery still pending.
  assert.equal(out.carrying, null);
  assert.equal(out.pendingDeliveries.length, 1);
});

test("simDay: chained pendingDeliveries -- second rover sees the first's pickup", () => {
  // Simulates the chained-pending scenario: rover A picks up; rover B starts
  // with rover A's post-step pendingDeliveries and finds the list empty.
  const padX = 100, padY = 100;

  const rA = {
    active: true,
    arrivalDay: 0,
    x: padX, y: padY,
    power: POWER_CAP, ice: 0,
    base: { x: padX, y: padY },
    panels: [], reactors: [], habitats: [],
    landingPads: [{ x: padX, y: padY }],
    structureHealth: { landingPads: [1.0] },
    pendingDeliveries: [{ id: 42, type: "solar", padIdx: 0 }],
    carrying: null,
    waypoints: [], currentWaypoint: null,
    mineMap: {},
  };
  const outA = simDay(rA, new Float32Array([1.0]), 0);
  assert.ok(outA.carrying, "rover A picks up");

  // Rover B starts at the same pad but with the CHAINED pendingDeliveries.
  const rB = { ...rA, pendingDeliveries: outA.pendingDeliveries };
  const outB = simDay(rB, new Float32Array([1.0]), 0);
  // Rover B should NOT have picked up (the list is empty).
  assert.equal(outB.carrying, null, "rover B finds no delivery");
});


// ── v174: ice actually banks (the "iceDeposited = 0" regression) ─────────────
// End-to-end proof of the ice-flow fix: a rover parked on the crater mines a
// partial hopper, pickRoverTarget routes it home once it crosses the 50%
// threshold, and simDay deposits the load at the habitat so iceDeposited > 0.
// Before v174 the hopper (800 kg) vs mine rate (~0.8 kg/day) meant the rover
// never reached the return threshold and nothing ever banked.
import { pickRoverTarget } from "../src/sim/autoTarget.js";
import { ICE_CAP } from "../src/sim/constants.js";

test("v174: a rover mines a partial hopper, routes home, and banks ice", () => {
  const HAB = { x: 560, y: 500 }; // ~60 px from the crater: a real round trip
  const r = makeRover({ x: CRATER_CX, y: CRATER_CY });
  r.habitats = [HAB];
  r.habitatPower = [80];               // powered, so deposits are accepted
  r.structureHealth.habitats = [1.0];
  const health = new Float32Array([1.0]);

  let s = r;
  let day = 0;
  // Phase 1: mine in place until the hopper crosses the 50% return threshold.
  for (; day < 60 && s.ice < ICE_CAP * 0.5; day++) {
    s = simDay(s, health, day);
  }
  assert.ok(s.ice >= ICE_CAP * 0.5, `hopper should reach 50%; got ${s.ice.toFixed(1)} kg`);

  // The auto-router should now send the rover home to deposit.
  const tgt = pickRoverTarget(s, s, health);
  assert.equal(tgt?.reason, "return");
  assert.equal(tgt.x, HAB.x);

  // Phase 2: drive the routed waypoint home. simDay emits a `deposit` event and
  // drains the hopper on arrival (iceDeposited itself is tallied from these
  // events by the App-level stepPlayer wrapper, not inside simDay).
  s = { ...s, currentWaypoint: { x: HAB.x, y: HAB.y } };
  let banked = 0;
  for (let i = 0; i < 12 && s.ice > 0; i++) {
    s = simDay(s, health, day++);
    for (const ev of (s.events || [])) if (ev.type === "deposit") banked += ev.kg;
  }
  assert.equal(s.ice, 0, "hopper should empty into the habitat");
  assert.ok(banked > 0, `a deposit event should bank ice; got ${banked} kg`);
});
