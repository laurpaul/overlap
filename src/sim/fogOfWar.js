// ── Fog of war (v177) ───────────────────────────────────────────────────────
//
// "Don't reveal opponent asset locations until scouted (surveillance assets)."
//
// Information asymmetry as a governance lever: with fog on, you can't see WHERE
// a rival has placed things until one of your sensors covers that spot. You
// still know WHAT they have, the opponent force-composition readout (v175)
// stays public, so fog hides positions, not the order of battle. That split is
// the teachable bit: you know the rival fields three rovers and two habitats;
// finding them, and keeping eyes on them, costs you surveillance.
//
// This module is pure and stateless: reveal is a function of CURRENT positions
// only (active sensor coverage), so there's no synced discovery state to drift
// and nothing for a snapshot to get wrong. The flip side, assets you scouted
// re-hide when you lose coverage, is deliberate: it makes standing
// surveillance (comsats) and forward scouts (rovers) continuously valuable
// rather than a one-time reveal.

import { COMSAT_RELAY_RADIUS } from "./constants.js";

// Sensor reach per asset type, in pixels (0.5 km/px). A comsat is a dedicated
// surveillance platform, broad standing overwatch (its relay footprint doubles
// as its sensor footprint). Rovers are mobile close-range scouts. Fixed
// installations have a modest local-awareness bubble.
export const SCOUT_RANGE = {
  rover:   18,                 // ~9 km, forward scouting
  comsat:  COMSAT_RELAY_RADIUS, // 60 px (~30 km), standing surveillance
  habitat: 16,
  reactor: 12,
  pad:     12,
  solar:   8,
};

const DESTROYED = 0.1;

// All of a viewer's live sensor sources as {x, y, r}. Destroyed assets (health
// at/below DESTROYED) don't sense.
export function sensorSources(viewer) {
  if (!viewer || viewer.active === false) return [];
  const sh = viewer.structureHealth || {};
  const out = [];
  const live = (arr, key, r) => (arr || []).forEach((s, i) => {
    if (!s) return;
    if (key && (sh[key]?.[i] ?? 1.0) <= DESTROYED) return;
    out.push({ x: s.x, y: s.y, r });
  });
  // Primary rover always senses (its health field is unread; treated as alive).
  if (viewer.x != null && viewer.y != null) out.push({ x: viewer.x, y: viewer.y, r: SCOUT_RANGE.rover });
  live(viewer.extraRovers, "extraRovers", SCOUT_RANGE.rover);
  live(viewer.comsats,     "comsats",     SCOUT_RANGE.comsat);
  live(viewer.habitats,    "habitats",    SCOUT_RANGE.habitat);
  live(viewer.reactors,    "reactors",    SCOUT_RANGE.reactor);
  live(viewer.landingPads, "landingPads", SCOUT_RANGE.pad);
  live(viewer.panels,      "panels",      SCOUT_RANGE.solar);
  return out;
}

// Is a map point currently within any sensor's range?
export function pointRevealed(sources, x, y) {
  if (!sources || sources.length === 0) return false;
  for (const s of sources) {
    const dx = x - s.x, dy = y - s.y;
    if (dx * dx + dy * dy <= s.r * s.r) return true;
  }
  return false;
}

// Convenience: total scouted area is implied by sources; this returns the count
// of opponent asset positions currently revealed, for a HUD "X of Y located"
// style readout. `positions` is [{x,y}].
export function countRevealed(sources, positions) {
  let n = 0;
  for (const p of (positions || [])) if (pointRevealed(sources, p.x, p.y)) n++;
  return n;
}
