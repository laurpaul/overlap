// DLA hazard-zone tests. These assert the framework's qualitative contract
// (zones nest, classification thresholds, mapping) and the scale-correct
// km↔px behaviour that distinguishes this in-sandbox port from the legacy
// 700px standalone tool. Pure functions, no DOM.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeDustRadii, computeManualRadii, classifyHazard,
  zonesToSafetyRadiusKm, applySafetyRadius, restoreSafetyRadius,
  parseBuffersJson, buildBuffersJson, buildGeoJson,
  ZONE_FOR_ASSET, HAZARD_TYPES, LUNAR_RADIUS_KM, REACTOR_ZONE_OPTIONS,
} from "../src/sim/hazardZones.js";
import { PIXELS_PER_KM } from "../src/sim/constants.js";

test("dust: zones nest core < buffer < coord and respect the clamp", () => {
  const z = computeDustRadii(500, 0.25, 1.0);
  assert.ok(z.core < z.buffer && z.buffer < z.coord, "zones should nest");
  assert.ok(z.core >= 0.5 && z.core <= 30, "core within clamp");
  // Higher rate → larger core (monotonic power law).
  assert.ok(computeDustRadii(2000, 0.25, 1.0).core > z.core);
});

test("dust: mitigation shrinks zones, low confidence grows them", () => {
  const base = computeDustRadii(800, 0.25, 1.0);
  assert.ok(computeDustRadii(800, 0.25, 0.35).core < base.core, "full mitigation shrinks core");
  assert.ok(computeDustRadii(800, 1.00, 1.0).core > base.core, "unknown confidence grows core");
});

test("manual: linear ratio and editable multipliers", () => {
  // 20 mSv/hr at 10→3 ratio, no confidence pad, no mitigation: core = 20/10*3 = 6
  const z = computeManualRadii(20, 0, 1.0, 10, 3, 2.5, 5);
  assert.equal(z.core, 6);
  assert.equal(z.buffer, 15);
  assert.equal(z.coord, 30);
});

test("classification thresholds at 2 and 8 km", () => {
  assert.equal(classifyHazard(1.9).cls, "low");
  assert.equal(classifyHazard(2).cls, "medium");
  assert.equal(classifyHazard(7.9).cls, "medium");
  assert.equal(classifyHazard(8).cls, "high");
});

test("asset mapping: pad→core, habitat/rover→buffer, solar→coord", () => {
  const km = zonesToSafetyRadiusKm({ core: 3, buffer: 9, coord: 18 });
  assert.equal(km.pad, 3);
  assert.equal(km.habitat, 9);
  assert.equal(km.rover, 9);
  assert.equal(km.solar, 18);
  // Framework never defines reactor/comsat.
  assert.ok(!("reactor" in km) && !("comsat" in km));
});

test("apply mutates in place at this sim's scale and restores exactly", () => {
  const target = { pad: 14.44, solar: 5.78, reactor: 11.56, habitat: 28.86, rover: 2.88 };
  const before = { ...target };
  const prior = applySafetyRadius(target, { pad: 3, habitat: 9, rover: 9, solar: 18 }, PIXELS_PER_KM);
  // Mapped assets reprojected with the sandbox's own px/km (2), not 2.4248.
  assert.equal(target.pad, 3 * PIXELS_PER_KM);
  assert.equal(target.solar, 18 * PIXELS_PER_KM);
  // Reactor untouched (not in the framework mapping).
  assert.equal(target.reactor, before.reactor);
  restoreSafetyRadius(target, prior);
  assert.deepEqual(target, before, "restore returns the exact prior pixel values");
});

test("buffers.json round-trips through km, ignoring legacy baked pixels", () => {
  // A buffers.json produced by the legacy 700px tool: zones_km are correct,
  // baked SAFETY_RADIUS pixels are at the WRONG (2.4248) scale.
  const legacy = {
    _meta: { site: "Shackleton Rim Alpha", schema: "OLF-DLA-buffers-v1" },
    zones_km: { core: 5, buffer: 12.5, coordination: 25 },
    SAFETY_RADIUS: { pad: 12.12, habitat: 30.31, rover: 30.31, solar: 60.62 }, // 2.4248 px/km
  };
  const { zones, meta } = parseBuffersJson(legacy);
  assert.deepEqual(zones, { core: 5, buffer: 12.5, coord: 25 });
  assert.equal(meta.site, "Shackleton Rim Alpha");
  // Reproject at THIS sim's scale → different (correct) pixels.
  const target = { pad: 0, habitat: 0, rover: 0, solar: 0 };
  applySafetyRadius(target, zonesToSafetyRadiusKm(zones), PIXELS_PER_KM);
  assert.equal(target.pad, 5 * PIXELS_PER_KM);
  assert.notEqual(target.pad, legacy.SAFETY_RADIUS.pad);
});

test("buildBuffersJson emits this sim's scale and is re-importable", () => {
  const json = buildBuffersJson({ core: 4, buffer: 10, coord: 20, meta: { siteName: "Test" } });
  assert.equal(json._meta.schema, "OLF-DLA-buffers-v1");
  assert.equal(json._meta.simulator.pixels_per_km, parseFloat(PIXELS_PER_KM.toFixed(4)));
  assert.equal(json.SAFETY_RADIUS.pad, parseFloat((4 * PIXELS_PER_KM).toFixed(3)));
  // Re-import yields the original km zones.
  assert.deepEqual(parseBuffersJson(json).zones, { core: 4, buffer: 10, coord: 20 });
});

test("buildGeoJson produces nested polygons + a source point", () => {
  const gj = buildGeoJson({ lat: -89.9, lon: 0, siteName: "S", core: 2, buffer: 5, coord: 10 });
  assert.equal(gj.type, "FeatureCollection");
  assert.equal(gj.features.length, 4);
  assert.equal(gj.features[3].geometry.type, "Point");
  // Polygon rings close on themselves.
  const ring = gj.features[0].geometry.coordinates[0];
  assert.deepEqual(ring[0], ring[ring.length - 1]);
});

test("optional reactor mapping applies and restores like any other asset", () => {
  const target = { pad: 14.44, solar: 5.78, reactor: 11.56, habitat: 28.86, rover: 2.88 };
  const before = { ...target };
  // Panel folds reactor into the km map at a chosen zone (here: core).
  const km = { ...zonesToSafetyRadiusKm({ core: 3, buffer: 9, coord: 18 }), reactor: 3 };
  const prior = applySafetyRadius(target, km, PIXELS_PER_KM);
  assert.equal(target.reactor, 3 * PIXELS_PER_KM, "reactor scaled to the core zone");
  assert.equal(target.pad, 3 * PIXELS_PER_KM);
  assert.ok("reactor" in prior, "reactor captured for restore");
  restoreSafetyRadius(target, prior);
  assert.deepEqual(target, before, "restore reverts reactor too");
});

test("REACTOR_ZONE_OPTIONS includes off + the three zones", () => {
  const vals = REACTOR_ZONE_OPTIONS.map((o) => o.value);
  assert.deepEqual(vals, ["off", "core", "buffer", "coord"]);
});

test("hazard metadata is complete", () => {
  for (const [, m] of Object.entries(HAZARD_TYPES)) {
    assert.ok(m.label && m.unit && m.defaultRatioIn > 0 && m.defaultRatioOut > 0);
  }
  assert.ok(HAZARD_TYPES.dust.powerLaw, "dust uses the power law");
  assert.equal(LUNAR_RADIUS_KM, 1737.4);
});

// v116: startup auto-load contract. The Lunar Radius Framework (collaborator
// tool) exports buffers.json; the sim auto-loads public/buffers.json on startup
// and routes it through parseBuffersJson -> zonesToSafetyRadiusKm -> applyHazard
// (same path as the Hazard panel import). This locks that the tool's exact
// export schema yields the expected km map the startup loader feeds applyHazard.
test("Lunar Radius Framework buffers.json -> startup km map for applyHazard", () => {
  // Exact shape emitted by the standalone tool's buildBuffersJSON()
  const toolExport = {
    _meta: { schema: "OLF-DLA-buffers-v1", site: "Shackleton Rim Alpha",
             framework: "Open Lunar Foundation, DLA Hazard Framework v0.5" },
    zones_km: { core: 4.97, buffer: 12.43, coordination: 24.85 },
    SAFETY_RADIUS: { pad: 12.05, habitat: 30.14, rover: 30.14, solar: 60.25 }, // legacy 2.4248 scale
    mapping: {
      pad:     { zone: "core",         km: 4.97 },
      habitat: { zone: "buffer",       km: 12.43 },
      rover:   { zone: "buffer",       km: 12.43 },
      solar:   { zone: "coordination", km: 24.85 },
    },
  };
  const { zones, meta } = parseBuffersJson(toolExport);
  assert.deepEqual(zones, { core: 4.97, buffer: 12.43, coord: 24.85 });
  assert.equal(meta.site, "Shackleton Rim Alpha");
  // The startup loader passes zonesToSafetyRadiusKm(zones) to applyHazard.
  const kmMap = zonesToSafetyRadiusKm(zones);
  // Core->pad, buffer->habitat/rover, coordination->solar (the documented mapping).
  assert.equal(kmMap.pad, 4.97);
  assert.equal(kmMap.habitat, 12.43);
  assert.equal(kmMap.rover, 12.43);
  assert.equal(kmMap.solar, 24.85);
});
