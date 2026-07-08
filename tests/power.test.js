import { test } from "node:test";
import assert from "node:assert/strict";
import { getGeneratorOutput, allocateDailyPower } from "../src/sim/power.js";
import {
  POWER_CAP, REACTOR_OUTPUT, PANEL_RIDGE,
  HABITAT_POWER_INIT, HABITAT_POWER_DRAIN,
} from "../src/sim/constants.js";
import { isNight } from "../src/sim/utils.js";

// A minimal but complete player. Reactors give a fixed output (REACTOR_OUTPUT)
// independent of the illumination map, so power routing is deterministic.
const mkPlayer = (over = {}) => ({
  active: true, arrivalDay: 0, x: 100, y: 100, power: 0,
  panels: [], reactors: [], habitats: [], extraRovers: [],
  ...over,
});

test("getGeneratorOutput: reactor is fixed and night-independent; solar zeroes at night", () => {
  const g = { x: 100, y: 100 };
  assert.equal(getGeneratorOutput({ ...g, kind: "reactor" }, false), REACTOR_OUTPUT);
  assert.equal(getGeneratorOutput({ ...g, kind: "reactor" }, true), REACTOR_OUTPUT);
  assert.equal(getGeneratorOutput({ ...g, kind: "solar" }, true), 0);
  const dayOut = getGeneratorOutput({ ...g, kind: "solar" }, false);
  assert.ok(dayOut >= 0 && dayOut <= PANEL_RIDGE); // PANEL_RIDGE * illum, illum in [0,1]
});

test("an in-range reactor charges a depleted rover (capped at POWER_CAP)", () => {
  const p = mkPlayer({ power: 0, reactors: [{ x: 100, y: 100 }] });
  const out = allocateDailyPower([p], 0)[0];
  assert.equal(out.power, Math.min(REACTOR_OUTPUT, POWER_CAP));
  assert.ok(out.power > 0);
});

test("an out-of-range generator charges nothing", () => {
  const p = mkPlayer({ power: 0, reactors: [{ x: 400, y: 400 }] }); // ~424 px away >> reactor range
  const out = allocateDailyPower([p], 0)[0];
  assert.equal(out.power, 0);
});

test("a habitat with no generator in range drains one DRAIN per day", () => {
  const p = mkPlayer({ habitats: [{ x: 100, y: 100 }] });
  const out = allocateDailyPower([p], 0)[0];
  assert.equal(out.habitatPower[0], HABITAT_POWER_INIT - HABITAT_POWER_DRAIN);
});

test("solar produces nothing at night, so a night allocation leaves the rover empty", () => {
  const nightDay = [...Array(28).keys()].find(d => isNight(d));
  const p = mkPlayer({ power: 0, panels: [{ x: 100, y: 100 }] });
  const out = allocateDailyPower([p], nightDay)[0];
  assert.equal(out.power, 0);
});

test("shared grid lets one player's reactor charge the other player's rover; isolated grid does not", () => {
  const p1 = () => mkPlayer({ x: 100, y: 100, power: POWER_CAP, reactors: [{ x: 100, y: 100 }] }); // full rover
  const p2 = () => mkPlayer({ x: 105, y: 100, power: 0 }); // empty rover, 5px from the reactor

  const shared = allocateDailyPower([p1(), p2()], 0, true);
  assert.equal(shared[1].power, Math.min(REACTOR_OUTPUT, POWER_CAP)); // cross-charged

  const isolated = allocateDailyPower([p1(), p2()], 0, false);
  assert.equal(isolated[1].power, 0); // each player runs alone
});

test("a destroyed extra rover is skipped; a healthy one charges", () => {
  const base = (health) => mkPlayer({
    x: 0, y: 0, power: POWER_CAP, // primary far + full
    reactors: [{ x: 100, y: 100 }],
    extraRovers: [{ x: 100, y: 100, power: 0 }],
    structureHealth: { extraRovers: [health] },
  });
  const dead = allocateDailyPower([base(0)], 0)[0];
  assert.equal(dead.extraRovers[0].power, 0);
  const alive = allocateDailyPower([base(1)], 0)[0];
  assert.equal(alive.extraRovers[0].power, Math.min(REACTOR_OUTPUT, POWER_CAP));
});

test("inactive or not-yet-arrived players are returned untouched", () => {
  const inactive = mkPlayer({ active: false, power: 7 });
  assert.equal(allocateDailyPower([inactive], 0)[0], inactive);
  const future = mkPlayer({ arrivalDay: 5, power: 7 });
  assert.equal(allocateDailyPower([future], 0)[0], future);
});
