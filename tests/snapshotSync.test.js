import { test } from "node:test";
import assert from "node:assert/strict";
import { packSnapshot, unpackSnapshot, SNAPSHOT_KEYS } from "../src/sim/snapshotSync.js";

// A representative host snapshot, mirroring exactly the object App.jsx builds in
// `snapshotForBroadcast`. If a synced field is ever added on the host/peer sides
// but the wire drops it, these tests fail.
function sampleHostSnapshot() {
  return {
    phase: "PLAYING",
    p1: { base: { x: 10, y: 20 }, budget: 5, comsats: [{ x: 1, y: 2 }] },
    p2: { base: { x: 30, y: 40 }, budget: 7, comsats: [] },
    round: 3, day: 2, globalDay: 14,
    history: [{ e: 1 }],
    claimR: [80, 80],
    showLayers: true,
    simMode: "auto", autoAdvance: false, autoSpeed: 1,
    totalRounds: 6, missionEndMode: "rounds", scenarioPreset: "baseline",
    arrivalDelay: 2, gridSharingEnabled: true, gridSharingPermanent: false,
    missionLog: [{ type: "policy", label: "x" }], annotations: [{ x: 1, y: 1, label: "Pin 1" }],
    activeTurn: 0, p1Done: false, p2Done: false,
    selectingFor: null, placingFor: null, placingType: null,
    selectedRover: [0, null], selectedBuild: [null, null], selectedDiplomacy: [null, null],
    // ── the fields the v136 wire silently dropped ──
    selectedComms: ["offer", null],
    selectedPad: [null, 1],
    powerGridState: { mode: "independent", offeredBy: null, offeredTo: null },
    commsGridState: { mode: "shared", offeredBy: 1, offeredTo: 2 },
    baseMap: "basemap_fig_topo",
    activeOverlaysArr: ["idx_composite", "ice"],
    activeVectorOverlaysArr: ["basemap_fig_composite"],
    vectorOverlay: "basemap_fig_composite",
    vectorOverlayOpacity: 0.85,
    lastEvents: [{ kind: "flare" }],
    physOverrides: { g: 1.62 },
    actorRoles: ["artemis", "ilrs"],
    craterHealth: new Float32Array([0.5, 0.25, 0.75]),
  };
}

test("packSnapshot: every curated host field survives onto the wire", () => {
  const state = sampleHostSnapshot();
  const wire = packSnapshot(state);
  for (const k of Object.keys(state)) {
    if (k === "craterHealth") continue; // encoded as craterHealthArray, checked below
    assert.ok(k in wire, `field "${k}" must be present on the wire (was dropped pre-fix)`);
  }
});

test("packSnapshot/unpackSnapshot: the seven fields the v136 allowlist dropped round-trip", () => {
  // Regression guard for the exact bug: comms-grid, basemap, and overlay
  // selections never reached peers because they were absent from SNAPSHOT_KEYS.
  const regressed = [
    "selectedComms", "commsGridState", "baseMap",
    "activeOverlaysArr", "activeVectorOverlaysArr",
    "vectorOverlay", "vectorOverlayOpacity",
  ];
  const state = sampleHostSnapshot();
  const round = unpackSnapshot(packSnapshot(state));
  for (const k of regressed) {
    assert.deepEqual(round[k], state[k], `field "${k}" must round-trip to peers`);
  }
});

test("craterHealth: Float32Array → number[] on the wire → Float32Array after unpack", () => {
  const state = sampleHostSnapshot();
  const wire = packSnapshot(state);
  // On the wire it is a JSON-safe plain array under craterHealthArray.
  assert.ok(Array.isArray(wire.craterHealthArray));
  assert.ok(!("craterHealth" in wire));
  assert.deepEqual(wire.craterHealthArray, [0.5, 0.25, 0.75]);
  // After unpack the peer gets a Float32Array back.
  const peer = unpackSnapshot(wire);
  assert.ok(peer.craterHealth instanceof Float32Array);
  assert.deepEqual(Array.from(peer.craterHealth), [0.5, 0.25, 0.75]);
  assert.ok(!("craterHealthArray" in peer));
});

test("packSnapshot: stray typed arrays are plainified so the payload stays JSON-safe", () => {
  const wire = packSnapshot({ phase: "PLAYING", mask: new Uint8Array([1, 2, 3]) });
  assert.ok(Array.isArray(wire.mask), "a stray typed array must become a plain array");
  assert.deepEqual(wire.mask, [1, 2, 3]);
  // And the whole payload must survive a JSON round-trip (the actual wire format).
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(wire)));
});

test("packSnapshot: tolerates a missing craterHealth and null input", () => {
  const wire = packSnapshot({ phase: "SETUP1" });
  assert.equal(wire.phase, "SETUP1");
  assert.ok(!("craterHealthArray" in wire));
  assert.ok(typeof wire._t === "number");
  const empty = packSnapshot(null);
  assert.ok(typeof empty._t === "number");
  assert.equal(unpackSnapshot(null), null);
});

test("SNAPSHOT_KEYS documents every field the sample host snapshot sends", () => {
  // Keeps the human-readable reference honest: if a new synced field is added to
  // the host snapshot, it should also be listed in SNAPSHOT_KEYS.
  const documented = new Set(SNAPSHOT_KEYS);
  for (const k of Object.keys(sampleHostSnapshot())) {
    assert.ok(documented.has(k), `SNAPSHOT_KEYS should list "${k}"`);
  }
});
