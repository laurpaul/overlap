// v205 feedback fixes, from the June 13 debrief and July 1 call:
//  - deposit_blocked: a rover carrying ice at an unpowered/destroyed habitat
//    used to fail its deposit silently ("ice deposited 0 ... I think that's
//    a bug"). It must now emit a visible event.
//  - strand_risk / stranded: a rover running low (or flat) inside a PSR must
//    warn ("we're already trapped"), throttled so the log stays readable.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { simDay, makePlayer } from "../src/sim/index.js";
import {
  PSR_MASK, RIDGE_MASK, PIXEL_CRATER, ICE_DEPTH_MAP, SLOPE_MAP, EARTH_VIS_MAP,
  CRATER_DATA,
} from "../src/sim/mapData.js";
import { W, POWER_CAP } from "../src/sim/constants.js";

const CX = 700, CY = 700;

function installSmallPSR() {
  for (let dy = -12; dy <= 12; dy++)
    for (let dx = -12; dx <= 12; dx++) {
      const idx = (CY + dy) * W + (CX + dx);
      PSR_MASK[idx] = 0; PIXEL_CRATER[idx] = -1; ICE_DEPTH_MAP[idx] = 0;
      SLOPE_MAP[idx] = 0; EARTH_VIS_MAP[idx] = 1; RIDGE_MASK[idx] = 0;
    }
  const pixels = [];
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      if (dx * dx + dy * dy > 9) continue;
      const x = CX + dx, y = CY + dy, idx = y * W + x;
      PSR_MASK[idx] = 1; PIXEL_CRATER[idx] = 0; ICE_DEPTH_MAP[idx] = 0.8;
      pixels.push(idx);
    }
  CRATER_DATA.length = 0;
  CRATER_DATA[0] = { cx: CX, cy: CY, mineX: CX, mineY: CY, size: pixels.length, quality: 0.9, pixels };
}

beforeEach(installSmallPSR);

function parkedRover(overrides = {}) {
  // A rover parked OFF the PSR (12px east) with no waypoints.
  const p = makePlayer({ x: CX + 12, y: CY }, 1, "#fff");
  p.x = CX + 12; p.y = CY;
  p.power = POWER_CAP;
  p.waypoints = [];
  p.currentWaypoint = null;
  return Object.assign(p, overrides);
}

test("deposit at an UNPOWERED habitat is blocked and emits deposit_blocked", () => {
  const p = parkedRover({ ice: 40 });
  p.habitats = [{ x: CX + 12, y: CY }];
  p.habitatPower = [0]; // unpowered
  p.structureHealth = { ...(p.structureHealth || {}), habitats: [1.0] };

  const ch = new Float32Array(CRATER_DATA.length).fill(1.0);
  const out = simDay(p, ch, 5);

  assert.ok(out.ice > 0, "cargo must NOT deposit at an unpowered habitat");
  const blocked = out.events.filter(e => e.type === "deposit_blocked");
  assert.equal(blocked.length, 1, "expected exactly one deposit_blocked event");
  assert.ok(blocked[0].kg >= 40, "event should report the stranded cargo");
  assert.equal(out.events.some(e => e.type === "deposit"), false);
});

test("deposit_blocked is throttled (no repeat the very next day)", () => {
  const p = parkedRover({ ice: 40 });
  p.habitats = [{ x: CX + 12, y: CY }];
  p.habitatPower = [0];
  p.structureHealth = { ...(p.structureHealth || {}), habitats: [1.0] };

  const ch = new Float32Array(CRATER_DATA.length).fill(1.0);
  const d1 = simDay(p, ch, 5);
  assert.equal(d1.events.filter(e => e.type === "deposit_blocked").length, 1);
  const d2 = simDay(d1, ch, 6);
  assert.equal(d2.events.filter(e => e.type === "deposit_blocked").length, 0,
    "warning must be throttled on the immediately following day");
  const d3 = simDay(d2, ch, 7);
  assert.equal(d3.events.filter(e => e.type === "deposit_blocked").length, 1,
    "warning re-arms after the throttle window");
});

test("deposit at a POWERED habitat still works (no regression)", () => {
  const p = parkedRover({ ice: 40 });
  p.habitats = [{ x: CX + 12, y: CY }];
  p.habitatPower = [50];
  p.structureHealth = { ...(p.structureHealth || {}), habitats: [1.0] };

  const ch = new Float32Array(CRATER_DATA.length).fill(1.0);
  const out = simDay(p, ch, 5);
  assert.equal(out.ice, 0, "cargo should deposit at a powered habitat");
  assert.equal(out.events.filter(e => e.type === "deposit").length, 1);
  assert.equal(out.events.some(e => e.type === "deposit_blocked"), false);
});

test("low battery inside a PSR emits strand_risk (throttled)", () => {
  // Sit the rover ON the PSR with low power and nothing to mine nearby
  // exhausted pixel: pre-fill mineMap so it idles rather than mines.
  const p = makePlayer({ x: CX, y: CY }, 1, "#fff");
  p.x = CX; p.y = CY;
  p.power = 10; // below the 15% default threshold
  p.waypoints = [];
  p.currentWaypoint = null;

  const ch = new Float32Array(CRATER_DATA.length).fill(1.0);
  const d1 = simDay(p, ch, 5);
  assert.equal(d1.events.filter(e => e.type === "strand_risk").length, 1,
    "expected a strand_risk warning at low power inside a PSR");
  const d2 = simDay(d1, ch, 6);
  assert.equal(d2.events.filter(e => e.type === "strand_risk").length, 0,
    "strand_risk must be throttled the next day");
});

test("battery crossing to zero emits stranded exactly once", () => {
  const p = makePlayer({ x: CX, y: CY }, 1, "#fff");
  p.x = CX; p.y = CY;
  p.power = 0.5; // will hit zero after base drain
  p.waypoints = [];
  p.currentWaypoint = null;

  const ch = new Float32Array(CRATER_DATA.length).fill(1.0);
  const d1 = simDay(p, ch, 5);
  assert.equal(d1.power, 0);
  assert.equal(d1.events.filter(e => e.type === "stranded").length, 1,
    "expected one stranded event at the zero crossing");
  const d2 = simDay(d1, ch, 6);
  assert.equal(d2.events.filter(e => e.type === "stranded").length, 0,
    "stranded must not repeat while the battery stays flat");
});
