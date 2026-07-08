import { test } from "node:test";
import assert from "node:assert/strict";
import {
  circleUnionArea, individualZoneArea, blocDenialMetrics, shrinkToExpand,
} from "../src/sim/denialZones.js";

const approxRel = (a, b, rel = 0.03) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));

test("circleUnionArea approximates a single circle and is empty-safe", () => {
  assert.equal(circleUnionArea([]), 0);
  const a = circleUnionArea([{ x: 0, y: 0, r: 10 }]);
  assert.ok(approxRel(a, Math.PI * 100, 0.02), `single-circle union ~pi r^2, got ${a}`);
});

test("union does not double-count overlap and does sum disjoint circles", () => {
  // two coincident circles -> area of one, not two
  const same = circleUnionArea([{ x: 0, y: 0, r: 10 }, { x: 0, y: 0, r: 10 }]);
  assert.ok(approxRel(same, Math.PI * 100, 0.02), `coincident union ~one circle, got ${same}`);
  // two far-apart circles -> sum of both
  const far = circleUnionArea([{ x: -100, y: 0, r: 8 }, { x: 100, y: 0, r: 8 }]);
  assert.ok(approxRel(far, 2 * Math.PI * 64, 0.03), `disjoint union ~sum, got ${far}`);
});

test("individualZoneArea sums pi r^2", () => {
  assert.ok(approxRel(individualZoneArea([{ r: 3 }, { r: 4 }]), Math.PI * (9 + 16)));
});

test("tilingEfficiency is high for tiled zones and low for stacked ones", () => {
  const tiled = blocDenialMetrics([{ x: -30, y: 0, r: 9 }, { x: 0, y: 0, r: 9 }, { x: 30, y: 0, r: 9 }]);
  const stacked = blocDenialMetrics([{ x: 0, y: 0, r: 12 }, { x: 1, y: 1, r: 12 }, { x: -1, y: 1, r: 12 }]);
  assert.ok(tiled.tilingEfficiency > 0.95, `tiled efficiency high, got ${tiled.tilingEfficiency}`);
  assert.ok(stacked.tilingEfficiency < 0.6, `stacked wastes coverage, got ${stacked.tilingEfficiency}`);
  assert.ok(stacked.overlapWasted > tiled.overlapWasted);
});

test("shrink-to-expand: every buffer shrinks while the bloc footprint grows", () => {
  // before: three big buffers piled on the same spot (cooperative-looking? no -
  //         each is huge, and they waste coverage by overlapping)
  const before = [{ x: 0, y: 0, r: 12 }, { x: 1, y: 1, r: 12 }, { x: -1, y: 1, r: 12 }];
  // after: each member SHRINKS its own buffer, and the bloc spreads them to tile
  const after = [{ x: -30, y: 0, r: 9 }, { x: 0, y: 0, r: 9 }, { x: 30, y: 0, r: 9 }];
  const r = shrinkToExpand(before, after);
  assert.ok(r.individualShrank, "each actor's own buffer got smaller");
  assert.ok(r.footprintGrew, "yet the bloc's denied footprint got bigger");
  assert.ok(r.isShrinkToExpand, "this is the shrink-to-expand signature");
  assert.ok(r.individualDelta < 0 && r.footprintDelta > 0);
});
