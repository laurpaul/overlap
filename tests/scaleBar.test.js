import { test } from "node:test";
import assert from "node:assert/strict";
import { scaleBarFor } from "../src/sim/scaleBar.js";

const approxRel = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));

test("kmPerPx follows (mapKm/zoom)/containerWidth", () => {
  const r = scaleBarFor(606, 1, 1000);
  assert.ok(approxRel(r.kmPerPx, 0.606));
});

test("picks a nice 1/2/5 step and a km label at low zoom", () => {
  const r = scaleBarFor(606, 1, 1000); // rawKm ~60.6 -> nice 50 km
  assert.equal(r.niceKm, 50);
  assert.equal(r.label, "50 km");
  assert.ok(approxRel(r.barPx, 50 / 0.606, 1e-6));
});

test("switches to a metres label below 1 km", () => {
  const r = scaleBarFor(606, 100, 1000); // rawKm ~0.606 -> nice 0.5 km
  assert.equal(r.niceKm, 0.5);
  assert.equal(r.label, "500 m");
});

test("returns null when the scale can't be computed", () => {
  assert.equal(scaleBarFor(606, 1, 0), null);       // div-by-zero -> Infinity
  assert.equal(scaleBarFor(606, 1, -5), null);      // negative width
  assert.equal(scaleBarFor(606, 1, NaN), null);     // NaN width
});

test("zoom falls back to 1 when zero/undefined", () => {
  assert.equal(scaleBarFor(606, 0, 1000).kmPerPx, scaleBarFor(606, 1, 1000).kmPerPx);
  assert.equal(scaleBarFor(606, undefined, 1000).kmPerPx, scaleBarFor(606, 1, 1000).kmPerPx);
});

test("the bar width stays in a comfortable on-screen band across zoom levels", () => {
  for (let z = 1; z <= 64; z *= 1.3) {
    const r = scaleBarFor(606, z, 1000);
    assert.ok(r.barPx >= 60 && r.barPx <= 161, `barPx ${r.barPx.toFixed(1)} at zoom ${z.toFixed(2)} out of band`);
  }
});
