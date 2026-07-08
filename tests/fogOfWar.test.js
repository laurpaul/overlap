// Tests for the fog-of-war sensor helpers (v177).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sensorSources, pointRevealed, countRevealed, SCOUT_RANGE,
} from "../src/sim/fogOfWar.js";

const emptySH = { panels: [], reactors: [], habitats: [], extraRovers: [], landingPads: [] };

test("sensorSources: includes the primary rover at rover range", () => {
  const v = { x: 100, y: 100, structureHealth: emptySH };
  const s = sensorSources(v);
  assert.equal(s.length, 1);
  assert.deepEqual(s[0], { x: 100, y: 100, r: SCOUT_RANGE.rover });
});

test("sensorSources: comsats give broad surveillance, panels narrow", () => {
  const v = {
    x: 0, y: 0,
    comsats: [{ x: 500, y: 500 }],
    panels:  [{ x: 200, y: 200 }],
    structureHealth: { ...emptySH, comsats: [1.0], panels: [1.0] },
  };
  const s = sensorSources(v);
  const comsat = s.find(z => z.x === 500);
  const panel  = s.find(z => z.x === 200);
  assert.equal(comsat.r, SCOUT_RANGE.comsat);
  assert.equal(panel.r, SCOUT_RANGE.solar);
  assert.ok(comsat.r > panel.r);
});

test("sensorSources: destroyed assets don't sense", () => {
  const v = {
    x: 0, y: 0,
    habitats: [{ x: 300, y: 300 }],
    structureHealth: { ...emptySH, habitats: [0.05] }, // destroyed
  };
  const s = sensorSources(v);
  assert.equal(s.find(z => z.x === 300), undefined);
  assert.equal(s.length, 1); // just the primary rover
});

test("sensorSources: inactive viewer senses nothing", () => {
  assert.deepEqual(sensorSources({ active: false, x: 0, y: 0 }), []);
  assert.deepEqual(sensorSources(null), []);
});

test("pointRevealed: inside range true, outside false", () => {
  const sources = [{ x: 100, y: 100, r: 18 }];
  assert.equal(pointRevealed(sources, 110, 100), true);  // 10 px away
  assert.equal(pointRevealed(sources, 100, 117), true);  // 17 px, inside 18
  assert.equal(pointRevealed(sources, 130, 100), false); // 30 px away
  assert.equal(pointRevealed([], 0, 0), false);
});

test("pointRevealed: a comsat covers a wide area a rover can't", () => {
  const viewer = {
    x: 0, y: 0,
    comsats: [{ x: 500, y: 500 }],
    structureHealth: { ...emptySH, comsats: [1.0] },
  };
  const sources = sensorSources(viewer);
  // A point 40 px from the comsat: inside the 60 px comsat range, outside the
  // rover's 18 px range from origin.
  assert.equal(pointRevealed(sources, 530, 530), true);
  // A point far from both is hidden.
  assert.equal(pointRevealed(sources, 900, 900), false);
});

test("countRevealed: tallies how many opponent positions are in coverage", () => {
  const sources = [{ x: 100, y: 100, r: 20 }, { x: 500, y: 500, r: 20 }];
  const positions = [
    { x: 105, y: 100 }, // revealed (near first)
    { x: 510, y: 505 }, // revealed (near second)
    { x: 800, y: 800 }, // hidden
  ];
  assert.equal(countRevealed(sources, positions), 2);
  assert.equal(countRevealed(sources, []), 0);
  assert.equal(countRevealed(sources, null), 0);
});
