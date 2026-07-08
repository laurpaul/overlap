// v69 rover-off-PSR fix: a rover that settles just OUTSIDE a small PSR should
// nose onto the nearest in-reach PSR pixel and start mining, rather than idle
// off the shadow. Also verifies the interior-anchor logic via simDay behavior.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { simDay, makePlayer } from "../src/sim/index.js";
import {
  PSR_MASK, RIDGE_MASK, PIXEL_CRATER, ICE_DEPTH_MAP, SLOPE_MAP, EARTH_VIS_MAP,
  CRATER_DATA,
} from "../src/sim/mapData.js";
import { W, ROVER_REACH, POWER_CAP } from "../src/sim/constants.js";

const CX = 700, CY = 700;

function installSmallPSR() {
  // wipe a region
  for (let dy = -12; dy <= 12; dy++)
    for (let dx = -12; dx <= 12; dx++) {
      const idx = (CY + dy) * W + (CX + dx);
      PSR_MASK[idx] = 0; PIXEL_CRATER[idx] = -1; ICE_DEPTH_MAP[idx] = 0;
      SLOPE_MAP[idx] = 0; EARTH_VIS_MAP[idx] = 1; RIDGE_MASK[idx] = 0;
    }
  // a small 3-pixel-radius PSR disc
  const pixels = [];
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      if (dx*dx + dy*dy > 9) continue;
      const x = CX + dx, y = CY + dy, idx = y * W + x;
      PSR_MASK[idx] = 1; PIXEL_CRATER[idx] = 0; ICE_DEPTH_MAP[idx] = 0.8;
      pixels.push(idx);
    }
  CRATER_DATA.length = 0;
  CRATER_DATA[0] = { cx: CX, cy: CY, mineX: CX, mineY: CY, size: pixels.length, quality: 0.9, pixels };
}

beforeEach(installSmallPSR);

test("rover settling just outside a small PSR snaps on and mines", () => {
  // Place the rover ~6px from the PSR centre, outside the 3px disc but within
  // ROVER_REACH (8px) of the nearest PSR pixel. Give it no waypoint so it is
  // in the settle branch.
  const p = makePlayer({ x: CX + 6, y: CY }, 1, "#fff");
  p.x = CX + 6; p.y = CY;
  p.power = POWER_CAP;
  p.waypoints = [];
  p.currentWaypoint = null;

  const ch = new Float32Array(CRATER_DATA.length).fill(1.0);
  const out = simDay(p, ch, 0);

  assert.equal(out.status, "mining", `expected mining, got ${out.status}`);
  assert.ok(out.ice > 0, "rover should have mined ice after snapping onto PSR");
  assert.equal(PSR_MASK[out.y * W + out.x], 1, "rover should now sit on a PSR pixel");
});

test("rover too far from any PSR does NOT snap (bounded by ROVER_REACH)", () => {
  // 12px away, outside reach of the nearest PSR pixel (~9px). Should not mine.
  const p = makePlayer({ x: CX + 12, y: CY }, 1, "#fff");
  p.x = CX + 12; p.y = CY;
  p.power = POWER_CAP;
  p.waypoints = [];
  p.currentWaypoint = null;

  const ch = new Float32Array(CRATER_DATA.length).fill(1.0);
  const out = simDay(p, ch, 0);

  assert.notEqual(out.status, "mining", "rover out of reach should not mine");
  assert.equal(out.ice, 0, "no ice should be extracted from out of reach");
});
