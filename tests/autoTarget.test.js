// Tests for pickRoverTarget -- the rover auto-targeting logic.
//
// This is the function where the v15-v20 bug cluster lived: recharge
// firing at the wrong threshold, full-power rovers getting trapped at
// startup, the 49↔51% bounce, aim-snap missing the PSR, etc.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { pickRoverTarget } from "../src/sim/autoTarget.js";
import {
  W, ICE_CAP, POWER_CAP,
  ROVER_RECHARGE_LOW, ROVER_RECHARGE_HIGH,
} from "../src/sim/constants.js";
import { PSR_MASK, PIXEL_CRATER, ICE_DEPTH_MAP, CRATER_DATA } from "../src/sim/mapData.js";

// ── Fixture: one PSR crater at (500, 500) ──────────────────────────────────
function installFixtureMap() {
  // Clear any prior fixture pixels.
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const idx = (500 + dy) * W + (500 + dx);
      PSR_MASK[idx] = 0;
      PIXEL_CRATER[idx] = -1;
      ICE_DEPTH_MAP[idx] = 0;
    }
  }
  // Install 5x5 PSR block centred on (500, 500).
  const pixels = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const idx = (500 + dy) * W + (500 + dx);
      PSR_MASK[idx] = 1;
      PIXEL_CRATER[idx] = 0;
      ICE_DEPTH_MAP[idx] = 0.8;
      pixels.push(idx);
    }
  }
  CRATER_DATA[0] = {
    cx: 500, cy: 500,
    mineX: 500, mineY: 500,
    size: pixels.length, pixels, quality: 1.0,
  };
  CRATER_DATA.length = 1;
}

const baseRover = (overrides = {}) => ({
  x: 100, y: 100,
  power: POWER_CAP,
  ice: 0,
  aimDirection: null,
  _recharging: false,
  ...overrides,
});

const basePlayer = (overrides = {}) => ({
  panels: [], reactors: [], habitats: [], extraRovers: [], landingPads: [],
  structureHealth: { panels: [], reactors: [], habitats: [], extraRovers: [], landingPads: [] },
  ...overrides,
});

beforeEach(() => installFixtureMap());

// ── Hysteresis (regression test for v20 bounce) ─────────────────────────────

test("pickRoverTarget: full-power rover does NOT trigger recharge", () => {
  const rover = baseRover({ power: POWER_CAP });  // 120/120 = 100%
  const player = basePlayer({ landingPads: [{ x: 50, y: 50 }] });
  player.structureHealth.landingPads = [1.0];
  const target = pickRoverTarget(rover, player, new Float32Array([1.0]));
  // Should NOT be recharge -- should be autoseek toward the crater.
  assert.notEqual(target?.reason, "recharge");
});

test("pickRoverTarget: rover at LOW threshold triggers recharge", () => {
  // rPower < POWER_CAP * ROVER_RECHARGE_LOW → recharge fires.
  const rover = baseRover({ power: POWER_CAP * (ROVER_RECHARGE_LOW - 0.01) });
  const player = basePlayer({ landingPads: [{ x: 50, y: 50 }] });
  player.structureHealth.landingPads = [1.0];
  const target = pickRoverTarget(rover, player, new Float32Array([1.0]));
  assert.equal(target?.reason, "recharge");
  assert.equal(target.x, 50);
  assert.equal(target.y, 50);
});

test("pickRoverTarget: rover BETWEEN LOW and HIGH stays on task if not _recharging", () => {
  // This is the v20 fix. With a single 50% threshold, a rover bouncing
  // between 49% and 51% would yo-yo. The hysteresis pair prevents this.
  // Not currently recharging → uses LOW threshold → above LOW → no recharge.
  const mid = (ROVER_RECHARGE_LOW + ROVER_RECHARGE_HIGH) / 2;  // ~62.5%
  const rover = baseRover({ power: POWER_CAP * mid, _recharging: false });
  const player = basePlayer({ landingPads: [{ x: 50, y: 50 }] });
  player.structureHealth.landingPads = [1.0];
  const target = pickRoverTarget(rover, player, new Float32Array([1.0]));
  assert.notEqual(target?.reason, "recharge");
});

test("pickRoverTarget: rover BETWEEN LOW and HIGH KEEPS recharging if _recharging", () => {
  // Same power level, but the rover is already in recharge mode → uses
  // HIGH threshold → below HIGH → keeps recharging.
  const mid = (ROVER_RECHARGE_LOW + ROVER_RECHARGE_HIGH) / 2;  // ~62.5%
  const rover = baseRover({ power: POWER_CAP * mid, _recharging: true });
  const player = basePlayer({ landingPads: [{ x: 50, y: 50 }] });
  player.structureHealth.landingPads = [1.0];
  const target = pickRoverTarget(rover, player, new Float32Array([1.0]));
  assert.equal(target?.reason, "recharge");
});

test("pickRoverTarget: rover above HIGH stops recharging", () => {
  // Recharging + above HIGH → exit recharge.
  const rover = baseRover({ power: POWER_CAP * (ROVER_RECHARGE_HIGH + 0.01), _recharging: true });
  const player = basePlayer({ landingPads: [{ x: 50, y: 50 }] });
  player.structureHealth.landingPads = [1.0];
  const target = pickRoverTarget(rover, player, new Float32Array([1.0]));
  assert.notEqual(target?.reason, "recharge");
});

// ── Recharge destination preferences ────────────────────────────────────────

test("pickRoverTarget: recharge picks the NEAREST functional home", () => {
  // Three homes; the closest should be picked.
  const rover = baseRover({ x: 100, y: 100, power: 10 });
  const player = basePlayer({
    landingPads: [
      { x: 500, y: 500 },  // far
      { x: 150, y: 100 },  // closest
      { x: 100, y: 300 },  // mid
    ],
  });
  player.structureHealth.landingPads = [1.0, 1.0, 1.0];
  const target = pickRoverTarget(rover, player, new Float32Array([1.0]));
  assert.equal(target?.reason, "recharge");
  assert.equal(target.x, 150);
  assert.equal(target.y, 100);
});

test("pickRoverTarget: recharge skips DESTROYED pads", () => {
  const rover = baseRover({ x: 100, y: 100, power: 10 });
  const player = basePlayer({
    landingPads: [
      { x: 150, y: 100 },  // closest but destroyed
      { x: 200, y: 200 },  // farther but functional
    ],
  });
  player.structureHealth.landingPads = [0.05, 1.0];  // first is destroyed (≤ 0.1)
  const target = pickRoverTarget(rover, player, new Float32Array([1.0]));
  assert.equal(target?.reason, "recharge");
  assert.equal(target.x, 200);
  assert.equal(target.y, 200);
});

test("pickRoverTarget: recharge uses solar panels and reactors as homes", () => {
  // A rover at 30% power, no pads/habitats, but with a solar panel nearby.
  // Per v20 README, solar panels and reactors are valid recharge sources.
  const rover = baseRover({ x: 100, y: 100, power: 10 });
  const player = basePlayer({
    panels: [{ x: 120, y: 110 }],
  });
  player.structureHealth.panels = [1.0];
  const target = pickRoverTarget(rover, player, new Float32Array([1.0]));
  assert.equal(target?.reason, "recharge");
  assert.equal(target.x, 120);
  assert.equal(target.y, 110);
});

test("pickRoverTarget: recharge prefers generator over closer pad (v27 fix)", () => {
  // v27: generators are the only ACTUAL recharge sources; pads/habitats
  // only work if they happen to be near a generator. Prefer generators
  // even when a pad is closer, to route the rover to a known supply.
  const rover = baseRover({ x: 100, y: 100, power: 10 });
  const player = basePlayer({
    landingPads: [{ x: 110, y: 100 }],   // very close pad
    panels:      [{ x: 200, y: 100 }],   // farther panel
  });
  player.structureHealth.landingPads = [1.0];
  player.structureHealth.panels      = [1.0];
  const target = pickRoverTarget(rover, player, new Float32Array([1.0]));
  assert.equal(target?.reason, "recharge");
  // Should pick the panel (the actual generator), not the closer pad.
  assert.equal(target.x, 200);
  assert.equal(target.y, 100);
});

test("pickRoverTarget: recharge falls back to pad when no generators exist", () => {
  // v27: when no functional generators are available, pads/habitats
  // still serve as a "head home and die visibly" fallback so the rover
  // doesn't wander.
  const rover = baseRover({ x: 100, y: 100, power: 10 });
  const player = basePlayer({
    landingPads: [{ x: 150, y: 100 }],
  });
  player.structureHealth.landingPads = [1.0];
  const target = pickRoverTarget(rover, player, new Float32Array([1.0]));
  assert.equal(target?.reason, "recharge");
  assert.equal(target.x, 150);
});

// ── Ice-full return ──────────────────────────────────────────────────────────

test("pickRoverTarget: ice ≥ 95% routes to nearest functional habitat (v27 fix)", () => {
  // v27 fix: pads are for PICKUP, habitats accept DEPOSITS. A full rover
  // should head to a habitat, not a pad. Set up both -- the habitat should win.
  const rover = baseRover({ ice: ICE_CAP * 0.96, power: POWER_CAP });
  const player = basePlayer({
    landingPads: [{ x: 200, y: 200 }],
    habitats:    [{ x: 300, y: 300 }],
  });
  player.structureHealth.landingPads = [1.0];
  player.structureHealth.habitats    = [1.0];
  const target = pickRoverTarget(rover, player, new Float32Array([1.0]));
  assert.equal(target?.reason, "return");
  // Should target the habitat, not the pad.
  assert.equal(target.x, 300);
  assert.equal(target.y, 300);
});

test("pickRoverTarget: ice ≥ 95% falls back to pad when no functional habitats", () => {
  const rover = baseRover({ ice: ICE_CAP * 0.96, power: POWER_CAP });
  const player = basePlayer({
    landingPads: [{ x: 200, y: 200 }],
  });
  player.structureHealth.landingPads = [1.0];
  const target = pickRoverTarget(rover, player, new Float32Array([1.0]));
  // No habitats → falls back to pad.
  assert.equal(target?.reason, "return");
  assert.equal(target.x, 200);
});

test("pickRoverTarget: ice ≥ 95% skips destroyed habitats", () => {
  const rover = baseRover({ ice: ICE_CAP * 0.96, power: POWER_CAP });
  const player = basePlayer({
    landingPads: [{ x: 200, y: 200 }],
    habitats:    [{ x: 300, y: 300 }],  // destroyed
  });
  player.structureHealth.landingPads = [1.0];
  player.structureHealth.habitats    = [0.05];  // destroyed
  const target = pickRoverTarget(rover, player, new Float32Array([1.0]));
  // Habitat is destroyed → falls back to pad.
  assert.equal(target?.reason, "return");
  assert.equal(target.x, 200);
});

test("pickRoverTarget: ice ≥ 95% returns null if no pads exist", () => {
  const rover = baseRover({ ice: ICE_CAP * 0.96 });
  const player = basePlayer();  // no pads, no habitats
  const target = pickRoverTarget(rover, player, new Float32Array([1.0]));
  // Falls through to the autoseek branch -- should find the crater at (500, 500).
  assert.equal(target?.reason, "autoseek");
});

// ── v174: partial-load deposit return + bank-when-stuck ──────────────────────

test("pickRoverTarget: a half-full hopper routes home to deposit (v174)", () => {
  // Below the old 95% gate but at/above the new 50% partial-deposit threshold.
  const rover = baseRover({ ice: ICE_CAP * 0.55, power: POWER_CAP });
  const player = basePlayer({ habitats: [{ x: 300, y: 300 }] });
  player.structureHealth.habitats = [1.0];
  const target = pickRoverTarget(rover, player, new Float32Array([1.0]));
  assert.equal(target?.reason, "return");
  assert.equal(target.x, 300);
  assert.equal(target.y, 300);
});

test("pickRoverTarget: a hopper just under 50% keeps mining (v174)", () => {
  const rover = baseRover({ ice: ICE_CAP * 0.45, power: POWER_CAP });
  const player = basePlayer({ habitats: [{ x: 300, y: 300 }] });
  player.structureHealth.habitats = [1.0];
  const target = pickRoverTarget(rover, player, new Float32Array([1.0]));
  // Not full enough to bank -- should still auto-seek the crater.
  assert.equal(target?.reason, "autoseek");
});

test("pickRoverTarget: banks a partial load when no crater is minable (v174)", () => {
  // Rover holds a non-trivial load, but the only crater is depleted below the
  // 0.15 health floor -> it should bank what it has rather than idle on the ice.
  const rover = baseRover({ ice: ICE_CAP * 0.2, power: POWER_CAP });
  const player = basePlayer({ habitats: [{ x: 300, y: 300 }] });
  player.structureHealth.habitats = [1.0];
  const target = pickRoverTarget(rover, player, new Float32Array([0.05]));
  assert.equal(target?.reason, "return");
  assert.equal(target.x, 300);
});

test("pickRoverTarget: an empty rover with nothing to mine stays put (v174)", () => {
  // No ice to bank and no minable crater -> null (idle), not a phantom return.
  const rover = baseRover({ ice: 0, power: POWER_CAP });
  const player = basePlayer({ habitats: [{ x: 300, y: 300 }] });
  player.structureHealth.habitats = [1.0];
  const target = pickRoverTarget(rover, player, new Float32Array([0.05]));
  assert.equal(target, null);
});

// ── Aim-snap (v17 fix) ──────────────────────────────────────────────────────

test("pickRoverTarget: aimDirection snaps to a PSR along the bearing", () => {
  // Rover at (100, 100) aiming roughly east (toward 500, 500 which is our
  // single test crater). The aim should snap onto that crater's mineX/mineY.
  const angle = Math.atan2(500 - 100, 500 - 100);  // 45° toward (500, 500)
  const rover = baseRover({ x: 100, y: 100, aimDirection: angle });
  const player = basePlayer();
  const target = pickRoverTarget(rover, player, new Float32Array([1.0]));
  assert.equal(target?.reason, "aim");
  assert.equal(target.x, 500);
  assert.equal(target.y, 500);
});

test("pickRoverTarget: aimDirection with no PSR ahead falls through to a distant point", () => {
  // Aim WEST when the crater is to the southeast. The crater is "behind"
  // in the bearing-forward sense (forward < 0), so it gets rejected.
  // The function then falls back to a 1200-px projection.
  const rover = baseRover({ x: 100, y: 100, aimDirection: Math.PI });  // due west
  const player = basePlayer();
  const target = pickRoverTarget(rover, player, new Float32Array([1.0]));
  assert.equal(target?.reason, "aim");
  // Should be far west of the rover.
  assert.ok(target.x < rover.x);
});

// ── Auto-seek (v15 fix) ─────────────────────────────────────────────────────

test("pickRoverTarget: idle rover aims at nearest unmined PSR", () => {
  const rover = baseRover({ x: 100, y: 100, aimDirection: null });
  const player = basePlayer();
  const target = pickRoverTarget(rover, player, new Float32Array([1.0]));
  assert.equal(target?.reason, "autoseek");
  // mineX/mineY of crater 0 in our fixture.
  assert.equal(target.x, 500);
  assert.equal(target.y, 500);
});

test("pickRoverTarget: idle rover skips DEPLETED craters (h < 0.15)", () => {
  const rover = baseRover({ x: 100, y: 100 });
  const player = basePlayer();
  const health = new Float32Array([0.10]);  // depleted
  const target = pickRoverTarget(rover, player, health);
  // Only one crater, and it's depleted → no target.
  assert.equal(target, null);
});

test("pickRoverTarget: aims at the mineX/mineY (PSR pixel), not the centroid", () => {
  // Override the crater to have a centroid OUTSIDE the PSR (simulate
  // C-shaped crater bug from v15).
  CRATER_DATA[0] = {
    ...CRATER_DATA[0],
    cx: 999, cy: 999,           // centroid far away
    mineX: 500, mineY: 500,     // actual PSR pixel
  };
  const rover = baseRover({ x: 100, y: 100 });
  const player = basePlayer();
  const target = pickRoverTarget(rover, player, new Float32Array([1.0]));
  assert.equal(target.x, 500, "should aim at the PSR pixel");
  assert.equal(target.y, 500);
});

// ── Null safety ────────────────────────────────────────────────────────────

test("pickRoverTarget: returns null for null rover", () => {
  assert.equal(pickRoverTarget(null, basePlayer(), new Float32Array(0)), null);
});

test("pickRoverTarget: no craters and idle rover → null", () => {
  CRATER_DATA.length = 0;
  const target = pickRoverTarget(baseRover(), basePlayer(), new Float32Array(0));
  assert.equal(target, null);
});
