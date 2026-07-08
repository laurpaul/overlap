// ── Pure snapshot / undo helpers ────────────────────────────────────────────
//
// Extracted from App.jsx (v108) so the snapshot-shaping and undo-segment-key
// logic can be unit-tested in Node without React. Both functions are pure:
// buildSnapshot takes an explicit field bag and returns a fresh plain object
// (deep-cloning the mutable parts); getUndoSegmentKey derives a stable string
// key from an explicit snapshot, with no hidden closure reads.

import { PHASE } from "./constants.js";
import { clonePlayerState } from "./playerState.js";

// Build a normalized state snapshot. Both the sim-object path (snapshotSimState)
// and the live-React path (snapshotLiveFrame) feed through here so the two can
// never drift in shape. Players are deep-cloned; arrays are copied; the rest is
// scalar.
export function buildSnapshot({
  round, day, globalDay,
  claimR, powerGridState,
  p1, p2,
  craterHealth, history,
  missionLogLength,
  phase,
}) {
  return {
    round,
    day,
    globalDay,
    claimR: [...(claimR || [])],
    powerGridState: { ...(powerGridState || {}) },
    p1: clonePlayerState(p1),
    p2: clonePlayerState(p2),
    craterHealth: Array.from(craterHealth || []),
    history: (history || []).map(h => ({ ...h })),
    logLength: missionLogLength,
    phase: phase || PHASE.PLAYING,
  };
}

// Derive a stable "segment key" for an undo snapshot. Two checkpoints with the
// same key are in the same logical step (so the undo stack can collapse rapid
// in-step changes to one entry). Pure: reads only from the passed snapshot.
// Callers pass the full set of fields (phase/round/day/globalDay/activeTurn/
// p1Done/p2Done); there are no closure fallbacks.
export function getUndoSegmentKey(snapshot = {}) {
  const {
    phase, round, day, globalDay, activeTurn, p1Done, p2Done,
  } = snapshot;
  if (phase === PHASE.PLAYING || phase === PHASE.DONE) {
    return `play|${round}|${day}|${globalDay}|${activeTurn}|${p1Done ? 1 : 0}|${p2Done ? 1 : 0}`;
  }
  return `phase|${phase}|${round}|${day}|${globalDay}`;
}
