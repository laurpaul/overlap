// Tests for the curated layer presets (v182).
import { test } from "node:test";
import assert from "node:assert/strict";
import { LAYER_PRESETS, LAYER_INFO } from "../src/sim/mapData.js";

const VALID_KEYS = new Set(LAYER_INFO.map(L => L.key));

test("LAYER_PRESETS: every overlay key exists in LAYER_INFO", () => {
  for (const p of LAYER_PRESETS) {
    for (const k of p.overlays) {
      assert.ok(VALID_KEYS.has(k), `preset "${p.key}" references unknown layer "${k}"`);
    }
  }
});

test("LAYER_PRESETS: each preset has the required shape", () => {
  for (const p of LAYER_PRESETS) {
    assert.equal(typeof p.key, "string");
    assert.equal(typeof p.label, "string");
    assert.equal(typeof p.color, "string");
    assert.ok(Array.isArray(p.overlays));
    assert.ok(typeof p.desc === "string" && p.desc.length > 0);
  }
});

test("LAYER_PRESETS: the curated set covers ice/slope/comms/illumination + clear", () => {
  const keys = LAYER_PRESETS.map(p => p.key);
  for (const expected of ["ice", "slope", "comms", "illum", "clear"]) {
    assert.ok(keys.includes(expected), `missing preset "${expected}"`);
  }
  // "clear" resets to no overlays.
  assert.equal(LAYER_PRESETS.find(p => p.key === "clear").overlays.length, 0);
});

test("LAYER_PRESETS: presets are distinct overlay sets (no accidental dupes)", () => {
  const sigs = LAYER_PRESETS.filter(p => p.overlays.length)
    .map(p => [...p.overlays].sort().join("|"));
  assert.equal(new Set(sigs).size, sigs.length, "two presets share the same overlay set");
});
