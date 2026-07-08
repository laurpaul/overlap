// ── Auto-fit viewport ──────────────────────────────────────────────────────
//
// Pure calculation: given the current phase, players, and an optional focus
// pulse (recent placement), compute a `{zoom, panX, panY}` viewport that
// frames the most informative region.
//
// Priorities (high → low):
//   1. Active focusPulse -- zoom hard onto that spot
//   2. SETUP phases -- fit only the actively-placing player's footprint
//   3. PLAYING -- weight by rovers (live activity), then pads, habitats,
//      generators, miners, waypoints
//
// Returns null when there's nothing to fit yet (no placed assets).

import { W, H, PHASE } from "./constants.js";

const TIGHT_ZOOM       = 2.6;     // focus-pulse zoom
const MAX_ZOOM_AUTOFIT = 4.5;
const MIN_ZOOM_AUTOFIT = 1.05;
const PERCENTILE       = 0.92;    // 92nd-percentile radius around weighted centroid

// Weights -- higher = pull camera harder toward this asset type.
const WEIGHTS = {
  rover:    3,   // live activity, narrative driver
  pad:      2,   // entry point
  habitat:  2,   // anchor
  generator: 1,  // solar / reactor
  waypoint: 0.5, // future intent
};

// v27: previously included SETUP1_HAB / SETUP1_SOL / SETUP1_PAD / SETUP2_*
// alternatives, but those PHASE constants were removed when the multi-step
// setup wizard was cleaned up. Single-step setup is the only path now.
const isSetupForP1 = (phase) => phase === PHASE.SETUP1;
const isSetupForP2 = (phase) => phase === PHASE.SETUP2;

function collectPoints(focusPlayers) {
  const pts = [];
  const addPt = (x, y, w = 1) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    pts.push([x, y, w]);
  };

  for (const p of focusPlayers) {
    if (!p || p.active === false) continue;
    // Rovers
    addPt(p.x, p.y, WEIGHTS.rover);
    (p.extraRovers || []).forEach((r) => addPt(r.x, r.y, WEIGHTS.rover));
    // Pads
    if (p.landingPad) addPt(p.landingPad.x, p.landingPad.y, WEIGHTS.pad);
    (p.landingPads   || []).forEach((pd) => addPt(pd.x, pd.y, WEIGHTS.pad));
    // Habitats
    if (p.habitat) addPt(p.habitat.x, p.habitat.y, WEIGHTS.habitat);
    (p.habitats || []).forEach((h) => addPt(h.x, h.y, WEIGHTS.habitat));
    // Generators
    // v27: removed dead `p.solarPanels` fallback (never set anywhere; only
    // `p.panels` is ever populated). Same for `p.miners` which had a weight
    // table entry but no producer in the codebase.
    (p.panels   || []).forEach((s) => addPt(s.x, s.y, WEIGHTS.generator));
    (p.reactors || []).forEach((r) => addPt(r.x, r.y, WEIGHTS.generator));
    (p.waypoints || []).forEach((wp) => addPt(wp.x, wp.y, WEIGHTS.waypoint));
  }
  return pts;
}

export function computeAutoFitViewport({ phase, p1, p2, focusPulse, now = Date.now() }) {
  // 1. focusPulse override -- tight zoom onto a specific point.
  if (focusPulse && focusPulse.until > now) {
    return {
      zoom: TIGHT_ZOOM,
      panX: focusPulse.x - W / 2,
      panY: focusPulse.y - H / 2,
    };
  }

  // 2. SETUP -- fit only the placing player.
  const focusPlayers =
    isSetupForP1(phase) ? [p1] :
    isSetupForP2(phase) ? [p2] :
    [p1, p2];

  const pts = collectPoints(focusPlayers);
  if (pts.length < 1) return null;

  // 3. Weighted centroid.
  let sumW = 0, sumX = 0, sumY = 0;
  for (const [x, y, w] of pts) {
    sumW += w;
    sumX += x * w;
    sumY += y * w;
  }
  const cx = sumW > 0 ? sumX / sumW : 0;
  const cy = sumW > 0 ? sumY / sumW : 0;

  // 4. Percentile radius (avoids being yanked by a distant outlier rover).
  const radii = pts
    .map(([x, y]) => Math.hypot(x - cx, y - cy))
    .sort((a, b) => a - b);
  const idx = Math.floor(radii.length * PERCENTILE);
  const rPctl = radii[Math.min(idx, radii.length - 1)] || 60;

  // Tighter margin when activity is concentrated; looser when sprawling.
  const margin = pts.length < 4 ? 80 : 60;
  const bbHalf = Math.max(60, rPctl) + margin;
  const bbW = bbHalf * 2;
  const bbH = bbHalf * 2;

  const z = Math.min(W / bbW, H / bbH, MAX_ZOOM_AUTOFIT);
  return {
    zoom: Math.max(MIN_ZOOM_AUTOFIT, Math.min(z, MAX_ZOOM_AUTOFIT)),
    panX: cx - W / 2,
    panY: cy - H / 2,
  };
}
