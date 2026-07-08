// Per-asset feasibility tests (item 8). Pure: validates that each asset's
// placement-feasibility score responds to the right terrain inputs in the right
// direction, so the toggleable layers mean what they claim.

import { test } from "node:test";
import assert from "node:assert/strict";

import { assetFeasibility, FEASIBILITY_ASSETS, FEASIBILITY_CARDS } from "../src/sim/feasibility.js";

const flatSunlit   = { slope: 0,  illum: 1.0, earth: 1.0, psr: false };
const flatDark     = { slope: 0,  illum: 0.0, earth: 0.0, psr: false };
const steepSunlit  = { slope: 24, illum: 1.0, earth: 1.0, psr: false };
const psrFloor     = { slope: 2,  illum: 0.0, earth: 0.2, psr: true  };

test("every asset has a feasibility card", () => {
  for (const t of FEASIBILITY_ASSETS) {
    assert.ok(FEASIBILITY_CARDS[t]?.label && FEASIBILITY_CARDS[t]?.need, `${t} card present`);
  }
});

test("all feasibility scores stay in [0,1]", () => {
  for (const L of [flatSunlit, flatDark, steepSunlit, psrFloor]) {
    for (const t of FEASIBILITY_ASSETS) {
      const v = assetFeasibility(L, t);
      assert.ok(v >= 0 && v <= 1, `${t} feasibility ${v} out of range`);
    }
  }
});

test("solar wants illumination: sunlit flat >> dark flat", () => {
  assert.ok(assetFeasibility(flatSunlit, "solar") > 0.8);
  assert.ok(assetFeasibility(flatDark, "solar") < 0.4);
  assert.ok(assetFeasibility(flatSunlit, "solar") > assetFeasibility(flatDark, "solar"));
});

test("reactor wants flat ground, not sunlight: flat dark is still strong", () => {
  // A reactor on flat dark ground should score well (sunlight irrelevant).
  assert.ok(assetFeasibility(flatDark, "reactor") > 0.7);
  // Steep ground tanks it even when sunlit.
  assert.ok(assetFeasibility(steepSunlit, "reactor") < assetFeasibility(flatDark, "reactor"));
});

test("comsat wants Earth visibility above all", () => {
  const flatNoEarth = { slope: 0, illum: 1.0, earth: 0.0, psr: false };
  assert.ok(assetFeasibility(flatSunlit, "comsat") > 0.8, "high earth-vis -> high comsat feasibility");
  assert.ok(assetFeasibility(flatNoEarth, "comsat") < 0.4, "no earth-vis -> low comsat feasibility");
});

test("PSR floors penalize habitat and reactor", () => {
  // Same gentle slope, but PSR vs not: habitat/reactor should drop on a PSR floor.
  const gentleClear = { slope: 2, illum: 0.0, earth: 0.2, psr: false };
  assert.ok(assetFeasibility(psrFloor, "habitat") < assetFeasibility(gentleClear, "habitat"));
  assert.ok(assetFeasibility(psrFloor, "reactor") < assetFeasibility(gentleClear, "reactor"));
});

test("rover is broadly feasible except on steep terrain", () => {
  assert.ok(assetFeasibility(flatDark, "rover") > 0.9, "rover fine on flat regardless of light");
  assert.ok(assetFeasibility(steepSunlit, "rover") < assetFeasibility(flatDark, "rover"));
});

test("pad is flatness-dominated", () => {
  assert.ok(assetFeasibility(flatSunlit, "pad") > 0.85);
  assert.ok(assetFeasibility(steepSunlit, "pad") < 0.3);
});
