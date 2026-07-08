// ─────────────────────────────────────────────────────────────────────────────
// Overlap · snapshot wire-serializer (pure, no React)
// ─────────────────────────────────────────────────────────────────────────────
//
// The host → peer state mirror passes through here. Kept dependency-free (no
// React, no socket.io) so it can be unit-tested directly under `node --test`,
// like the rest of src/sim/. multiplayer.js re-exports these.
//
// DESIGN NOTE, why this used to drift, and why it no longer can:
//   App.jsx builds `snapshotForBroadcast`, a hand-curated object of exactly the
//   fields peers need. Earlier, packSnapshot ALSO filtered that object through a
//   second hand-maintained allowlist (SNAPSHOT_KEYS). When new synced fields
//   were added on both the host (snapshotForBroadcast) and peer (ingest) sides
//   but NOT added to the middle allowlist, those fields were silently dropped on
//   the wire, a multi-user-only desync invisible in single-laptop testing
//   (comms-grid state, basemap, and map-overlay selections were all affected up
//   to v136). The host's curated object is the single source of truth now:
//   packSnapshot passes it through verbatim, special-casing only the typed
//   arrays that don't survive JSON. SNAPSHOT_KEYS is documentation, and
//   snapshotSync.test.js pins the pack→unpack contract so it can't drift again.

// Informational: the set of state fields the host curates into a snapshot.
// NOT used to filter (packSnapshot passes the curated object through). Kept
// current as a single readable reference of what crosses the wire.
export const SNAPSHOT_KEYS = [
  "phase",
  "p1", "p2",
  "round", "day", "globalDay",
  "history",
  "claimR",
  "showLayers",
  "simMode", "autoAdvance", "autoSpeed",
  "totalRounds", "missionEndMode", "scenarioPreset",
  "arrivalDelay", "gridSharingEnabled", "gridSharingPermanent",
  "missionLog", "annotations",
  "activeTurn", "p1Done", "p2Done",
  "selectingFor", "placingFor", "placingType",
  "selectedRover", "selectedBuild", "selectedDiplomacy", "selectedComms", "selectedPad",
  "powerGridState", "commsGridState",
  "baseMap", "activeOverlaysArr", "activeVectorOverlaysArr",
  "vectorOverlay", "vectorOverlayOpacity",
  "lastEvents",
  "physOverrides",
  "actorRoles",
  "craterHealth", // Float32Array → craterHealthArray (number[]) on the wire
];

// Convert a typed array (Float32Array, Uint8Array, …) to a plain number[].
// Plain arrays and everything else pass through untouched. DataView and raw
// ArrayBuffers (not length-indexed, not curated into snapshots) are left as-is.
function plainifyTypedArray(v) {
  if (ArrayBuffer.isView(v) && typeof v.length === "number") return Array.from(v);
  return v;
}

// Host → wire. Pass the host's already-curated snapshot through verbatim so new
// synced fields can never be dropped by a stale middle allowlist. Only the
// craterHealth Float32Array is renamed/encoded; any other stray typed array is
// defensively plainified so it can't bloat or corrupt the JSON payload.
export function packSnapshot(state) {
  if (!state) return { _t: Date.now() };
  const out = {};
  for (const [k, v] of Object.entries(state)) {
    if (k === "craterHealth") continue; // encoded below as craterHealthArray
    out[k] = plainifyTypedArray(v);
  }
  if (state.craterHealth && state.craterHealth.length != null) {
    out.craterHealthArray = Array.from(state.craterHealth);
  }
  out._t = Date.now();
  return out;
}

// Wire → peer. Rehydrate the craterHealth Float32Array; everything else is
// applied as-is by the peer's ingest handler.
export function unpackSnapshot(snap) {
  if (!snap) return null;
  const out = { ...snap };
  if (snap.craterHealthArray) {
    out.craterHealth = Float32Array.from(snap.craterHealthArray);
    delete out.craterHealthArray;
  }
  return out;
}
