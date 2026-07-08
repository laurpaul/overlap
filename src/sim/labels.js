// ── Display-string helpers ─────────────────────────────────────────────────
//
// Small lookup tables used by the mission log, UI components, and the plot
// data builder. Pure functions, no React, no dependencies on map state.

import { CRATER_DATA, CRATER_LABELS } from "./mapData.js";

const STRUCTURE_LABELS = {
  solar:    "Solar Panel",
  reactor:  "Nuclear Reactor",
  habitat:  "Habitat",
  rover:    "Rover",
  pad:      "Landing Pad",
  comsat:   "Comsat Relay",
  resupply: "Resupply Order",
};

/**
 * Map an asset type id to its human-readable name. Unknown types fall back
 * to the raw type string so missing-mapping bugs surface visibly.
 *
 * @param {string} type  - e.g. "solar", "habitat", "comsat"
 * @returns {string}
 */
export function structureLabel(type) {
  return STRUCTURE_LABELS[type] || type;
}

/**
 * Resolve a CRATER_DATA index (the extracted-PSR-component id used by the
 * simulation) to the closest named crater from CRATER_LABELS by centroid
 * proximity. Returns null when nothing matches within a sensible radius,
 * so callers can fall back to a numeric id.
 *
 * The PSR-extracted craters and the IAU-named craters in CRATER_LABELS
 * are derived independently (the first from the binary PSR mask, the
 * second from the published nomenclature list), so a nearest-neighbor
 * match is the cleanest bridge between them. A 30-px (~15 km) tolerance
 * catches the headline craters without over-eagerly naming unnamed
 * secondary PSRs as their large neighbours.
 *
 * @param {number} craterIdx  - index into CRATER_DATA
 * @returns {string|null}
 */
export function craterName(craterIdx) {
  if (craterIdx == null || craterIdx < 0) return null;
  const c = CRATER_DATA[craterIdx];
  if (!c) return null;
  const TOL_PX = 30;
  let best = null;
  let bestDSq = TOL_PX * TOL_PX;
  for (const named of CRATER_LABELS) {
    const dx = named.x - c.cx;
    const dy = named.y - c.cy;
    const dSq = dx * dx + dy * dy;
    if (dSq < bestDSq) { bestDSq = dSq; best = named.name; }
  }
  return best;
}
