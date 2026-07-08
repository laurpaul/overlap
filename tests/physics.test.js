import { test } from "node:test";
import assert from "node:assert/strict";
import { roverSlopeFactor, roverPowerFactor, analyzePixel } from "../src/sim/physics.js";
import { W, H } from "../src/sim/constants.js";

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test("roverSlopeFactor matches the published VIPER curve and clamps to [0,1]", () => {
  assert.ok(approx(roverSlopeFactor(0), 1));
  assert.ok(approx(roverSlopeFactor(15), 0.4));   // 1 - 15/25
  assert.ok(approx(roverSlopeFactor(25), 0));     // impassable threshold
  assert.equal(roverSlopeFactor(30), 0);          // beyond threshold stays 0
  assert.equal(roverSlopeFactor(-5), 1);          // negative clamps up to 1
  assert.equal(roverSlopeFactor(NaN), 1);         // non-finite -> nominal
  assert.equal(roverSlopeFactor(Infinity), 1);
});

test("roverPowerFactor follows 1 + (s/15)^2 and never drops below 1", () => {
  assert.ok(approx(roverPowerFactor(0), 1));
  assert.ok(approx(roverPowerFactor(15), 2));     // 1 + 1
  assert.ok(approx(roverPowerFactor(30), 5));     // 1 + 4
  assert.equal(roverPowerFactor(-5), 1);          // negative slope -> no penalty
  assert.equal(roverPowerFactor(NaN), 1);
});

test("the two curves move in opposite directions (slower => thirstier)", () => {
  for (let s = 0; s < 25; s += 5) {
    assert.ok(roverSlopeFactor(s) >= roverSlopeFactor(s + 5)); // speed falls
    assert.ok(roverPowerFactor(s) <= roverPowerFactor(s + 5)); // draw rises
  }
});

test("analyzePixel returns null outside the map", () => {
  assert.equal(analyzePixel(-1, 0), null);
  assert.equal(analyzePixel(0, -1), null);
  assert.equal(analyzePixel(W, 0), null);
  assert.equal(analyzePixel(0, H), null);
});

test("analyzePixel returns a complete, well-formed assessment for in-bounds pixels", () => {
  const assets = new Set(["solar", "habitat", "reactor", "pad", "rover", "mining"]);
  const verdicts = new Set(["good", "ok", "bad"]);
  // Sample a spread of pixels across the disk.
  for (const [x, y] of [[W >> 1, H >> 1], [100, 100], [W - 50, H - 50], [300, 800], [800, 300]]) {
    const a = analyzePixel(x, y);
    assert.ok(a, `expected an assessment at ${x},${y}`);
    for (const k of ["lat", "lon", "psr", "slope", "illum", "earth", "ice", "h2", "temp", "recs", "indices"]) {
      assert.ok(k in a, `missing key ${k}`);
    }
    assert.ok(Number.isFinite(a.slope) && Number.isFinite(a.illum));
    assert.equal(typeof a.psr, "boolean");
    // Exactly one recommendation per asset, every verdict legal.
    assert.equal(a.recs.length, assets.size);
    assert.deepEqual(new Set(a.recs.map(r => r.asset)), assets);
    for (const r of a.recs) {
      assert.ok(verdicts.has(r.verdict), `bad verdict ${r.verdict}`);
      assert.ok(typeof r.reason === "string" && r.reason.length > 0);
    }
    // Mining is only ever viable on a PSR pixel.
    const mining = a.recs.find(r => r.asset === "mining");
    if (!a.psr) assert.equal(mining.verdict, "bad");
  }
});
