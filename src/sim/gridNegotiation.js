// ── Grid negotiation state machine (pure) ───────────────────────────────────
//
// Both the power grid and the comms grid follow the same offer/accept lifecycle:
//
//   independent  --(actor opens)-->  offered  --(other joins)-->  shared
//        ^                                                            |
//        +---------------------(either decouples)---------------------+
//
// This was previously inline in App.jsx for the power grid only. Extracted and
// generalized so the comms grid reuses exactly the same logic (no hand-synced
// duplicate), and so the transitions are unit-testable in Node.
//
// State shape: { mode: "independent"|"offered"|"shared", offeredBy, offeredTo }
//   offeredBy / offeredTo are actor IDs (1 or 2), null when not offered.
//
// Each grid carries its own label and score weights so the power grid and comms
// grid can reward cooperation differently if desired.

export const GRID_DEFS = {
  power: {
    key: "power",
    label: "Power Grid",
    short: "power",
    openScore: 30,   // opening your grid is a cooperative gesture
    joinScore: 20,   // accepting completes the deal
    decoupleScore: -20,
  },
  comms: {
    key: "comms",
    label: "Comms Grid",
    short: "comms",
    openScore: 25,   // sharing relay/DTE capacity: cooperative, slightly lower stakes than power
    joinScore: 18,
    decoupleScore: -16,
  },
};

export const INITIAL_GRID = { mode: "independent", offeredBy: null, offeredTo: null };

// What negotiation actions are available to actor `pi` (0-indexed) given a grid
// state. `permanent` (power grid only) means a shared grid cannot be decoupled.
// `canNegotiate` lets the caller fold in inject restrictions (no-negotiate
// directives, Earth-side freezes). Returns an array of { type, label }.
export function gridOptions(grid, pi, { permanent = false, canNegotiate = true } = {}) {
  const actorId = pi + 1;
  const otherId = actorId === 1 ? 2 : 1;
  if (grid.mode === "shared") {
    if (permanent) return [];
    return [{ type: "decouple", label: "Decouple" }];
  }
  // Offers/joins are blocked while under a negotiation restriction; decoupling
  // an already-shared grid is always allowed (handled above).
  if (!canNegotiate) return [];
  if (grid.mode === "offered") {
    if (grid.offeredTo === actorId) return [{ type: "join", label: `Join P${grid.offeredBy}` }];
    if (grid.offeredBy === actorId) return []; // waiting on the other actor
  }
  return [{ type: "open", label: `Open to P${otherId}` }];
}

// Apply a negotiation action. Returns { grid, score, logVerb } on a valid
// transition, or null if the action is not valid in the current state. `score`
// is the delta to apply to the acting player; `logVerb` describes the event.
export function applyGridAction(grid, pi, action, def, { permanent = false } = {}) {
  const actorId = pi + 1;
  const otherId = actorId === 1 ? 2 : 1;
  if (action === "open" && grid.mode !== "shared") {
    return {
      grid: { mode: "offered", offeredBy: actorId, offeredTo: otherId },
      score: def.openScore,
      logVerb: `opened its ${def.short} grid to P${otherId}`,
    };
  }
  if (action === "join" && grid.mode === "offered" && grid.offeredTo === actorId) {
    return {
      grid: { mode: "shared", offeredBy: grid.offeredBy, offeredTo: actorId },
      score: def.joinScore,
      logVerb: `joined P${grid.offeredBy}'s ${def.short} grid`,
    };
  }
  if (action === "decouple" && grid.mode === "shared" && !permanent) {
    return {
      grid: { ...INITIAL_GRID },
      score: def.decoupleScore,
      logVerb: `decoupled the shared ${def.short} grid`,
    };
  }
  return null;
}

// Convenience: is this grid actively shared?
export function isGridShared(grid) {
  return grid?.mode === "shared";
}
