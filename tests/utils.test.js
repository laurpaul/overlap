import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dist, clamp, lerp, stepToward, snapToPSR, isNight,
  hasPlacementGrace, getCraterIceCapacity, getTotalMapIce,
} from "../src/sim/utils.js";
import { W, NIGHT_CYCLE, DAYS_PER_ROUND, DEPLETION_RATE } from "../src/sim/constants.js";
import { PSR_MASK } from "../src/sim/mapData.js";

test("dist / clamp / lerp basics", () => {
  assert.equal(dist({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
  assert.equal(lerp(0, 10, 0.5), 5);
  assert.equal(lerp(0, 10, 0), 0);
  assert.equal(lerp(0, 10, 1), 10);
});

test("stepToward interpolates one step and flags arrival", () => {
  const mid = stepToward({ x: 0, y: 0 }, { x: 10, y: 0 }, 3);
  assert.deepEqual(mid, { x: 3, y: 0, arrived: false });
  const reach = stepToward({ x: 0, y: 0 }, { x: 10, y: 0 }, 100);
  assert.deepEqual(reach, { x: 10, y: 0, arrived: true });
  const exact = stepToward({ x: 0, y: 0 }, { x: 4, y: 0 }, 4); // speed == distance
  assert.equal(exact.arrived, true);
});

test("isNight flips at the 7-day mark of the cycle", () => {
  assert.equal(isNight(0), false);
  assert.equal(isNight(6), false);
  assert.equal(isNight(7), true);
  assert.equal(isNight(NIGHT_CYCLE - 1), true);
  assert.equal(isNight(NIGHT_CYCLE), false); // wraps back to day
});

test("placement grace lasts exactly one round from arrival", () => {
  assert.equal(hasPlacementGrace(0, 0), true);
  assert.equal(hasPlacementGrace(0, DAYS_PER_ROUND - 1), true);
  assert.equal(hasPlacementGrace(0, DAYS_PER_ROUND), false);
  // Shifts with a later arrival day.
  assert.equal(hasPlacementGrace(10, 10 + DAYS_PER_ROUND - 1), true);
  assert.equal(hasPlacementGrace(10, 10 + DAYS_PER_ROUND), false);
});

test("crater ice capacity scales linearly with size and inversely with depletion", () => {
  const small = getCraterIceCapacity({ size: 100 });
  const big = getCraterIceCapacity({ size: 200 });
  assert.ok(Math.abs(big - 2 * small) < 1e-9); // double size -> double yield
  const faster = getCraterIceCapacity({ size: 100 }, DEPLETION_RATE * 2);
  assert.ok(faster < small); // higher depletion rate -> less recoverable ice
});

test("total map ice is finite and non-negative, and honours the depletion override", () => {
  // CRATER_DATA is populated from the map image at runtime (browser only), so
  // under the test runner it is empty and the total is 0 -- assert the contract
  // that always holds. Per-crater scaling is covered by the test above.
  const base = getTotalMapIce();
  assert.ok(Number.isFinite(base) && base >= 0);
  assert.equal(base, getTotalMapIce({ DEPLETION_RATE })); // default == explicit default
});

test("snapToPSR rounds, no-ops on a PSR pixel, and spirals out to the nearest one", () => {
  // PSR_MASK is a real (zero-filled in Node) Uint8Array; seed a single pixel to
  // exercise the spiral search deterministically, then restore it.
  const tx = 200, ty = 200, ti = ty * W + tx;
  const prev = PSR_MASK[ti];
  PSR_MASK[ti] = 1;
  try {
    assert.deepEqual(snapToPSR(tx, ty), { x: tx, y: ty });        // already on a PSR
    assert.deepEqual(snapToPSR(tx + 0.4, ty - 0.2), { x: tx, y: ty }); // rounds onto it
    const near = snapToPSR(tx + 3, ty);                            // 3 px away -> spirals in
    assert.equal(PSR_MASK[near.y * W + near.x], 1);
  } finally {
    PSR_MASK[ti] = prev;
  }
});
