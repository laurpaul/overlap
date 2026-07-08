// ── Per-asset placement feasibility (item 8) ────────────────────────────────
//
// "Where is it actually sensible to put each asset type?" The favorability
// indices (LFI/SOFI/IFI) answer mission-phase questions (landing / surface ops /
// ice). Feasibility answers the placement question for each BUILDABLE asset:
// solar, reactor, habitat, pad, rover, comsat. Each returns a score in [0,1]
// from the same static terrain the indices use, so a player can toggle a layer
// and see green-where-good / dark-where-poor for the asset they are about to
// place.
//
// These are deliberately simple, legible weightings of real terrain inputs
// (slope, illumination, Earth visibility, PSR mask) rather than survey-grade
// models -- the point is to make the placement tradeoffs visible, the same
// philosophy as the favorability layers.
//
// Pure: no DOM, no module state. The raster filler writes into FEASIBILITY_MAPS
// once after loadMapData, mirroring computeIndexRasters.

import { W, H } from "./constants.js";
import { PSR_MASK, ILLUM_MAP, EARTH_VIS_MAP, SLOPE_MAP } from "./mapData.js";

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Slope at which a build site is effectively unusable (matches the indices'
// SLOPE_IMPASSABLE_DEG and roverSlopeFactor's 25 deg cutoff).
const SLOPE_MAX_DEG = 25;

// The buildable asset types this module scores. Order is the layer order.
export const FEASIBILITY_ASSETS = ["solar", "reactor", "habitat", "pad", "rover", "comsat"];

// Human-facing copy for each layer (what the asset needs, in one line).
export const FEASIBILITY_CARDS = {
  solar:   { label: "Solar feasibility",   need: "Sustained illumination on low slope -- ridge crests and peaks of near-eternal light." },
  reactor: { label: "Reactor feasibility", need: "Flat, stable ground clear of permanently shadowed floors; siting standoff matters more than sunlight." },
  habitat: { label: "Habitat feasibility", need: "Safe surface-ops terrain: moderate slope, some illumination for thermal/power, not a PSR floor." },
  pad:     { label: "Landing-pad feasibility", need: "Flat, low-slope ground for a stable touchdown and cargo handling." },
  rover:   { label: "Rover feasibility",   need: "Traversable slope. Rovers reach almost anywhere except impassably steep terrain." },
  comsat:  { label: "Comsat feasibility",  need: "Direct-to-Earth visibility for the relay's ground-projection footprint." },
};

const slopeFlat = (slope) => clamp01(1 - slope / SLOPE_MAX_DEG);

// Feasibility for one asset at one sampled location L = { psr, slope, illum, earth }.
// Returns [0,1]; higher = more feasible.
export function assetFeasibility(L, type) {
  const flat  = slopeFlat(L.slope || 0);
  const illum = clamp01(L.illum || 0);
  const earth = clamp01(L.earth || 0);
  const psr   = !!L.psr;
  switch (type) {
    case "solar":
      // Illumination dominates; needs a buildable (not-too-steep) mount.
      return clamp01(0.72 * illum + 0.28 * flat);
    case "reactor":
      // Flat, stable ground; PSR floors are poor; sunlight largely irrelevant.
      return clamp01((0.80 * flat + 0.20 * (1 - illum * 0.0)) * (psr ? 0.45 : 1));
    case "habitat":
      // Surface-ops safety: slope + some illumination, hard penalty inside a PSR.
      return clamp01((0.55 * flat + 0.45 * illum) * (psr ? 0.30 : 1));
    case "pad":
      // Flatness is nearly everything for a touchdown site.
      return clamp01(0.88 * flat + 0.12 * (1 - (psr ? 0.5 : 0)));
    case "rover":
      // Traversability: feasible nearly everywhere the slope allows.
      return clamp01(0.15 + 0.85 * flat);
    case "comsat":
      // Relay ground-projection needs a direct line to Earth.
      return clamp01(0.85 * earth + 0.15 * flat);
    default:
      return 0;
  }
}

// One Float32Array per asset type, filled once after loadMapData (like the
// favorability rasters). NaN outside the data disk so the renderer can skip it.
export const FEASIBILITY_MAPS = {};
for (const t of FEASIBILITY_ASSETS) FEASIBILITY_MAPS[t] = new Float32Array(W * H);

export const FEASIBILITY_RANGES = {};

export function computeFeasibilityRasters() {
  const mins = {}, maxs = {};
  for (const t of FEASIBILITY_ASSETS) { mins[t] = Infinity; maxs[t] = -Infinity; }
  for (let i = 0; i < W * H; i++) {
    const psr   = PSR_MASK[i] === 1;
    const slope = SLOPE_MAP[i] || 0;
    const illum = ILLUM_MAP[i] || 0;
    const earth = EARTH_VIS_MAP[i] || 0;
    const hasData = psr || slope > 0 || illum > 0 || earth > 0;
    if (!hasData) {
      for (const t of FEASIBILITY_ASSETS) FEASIBILITY_MAPS[t][i] = NaN;
      continue;
    }
    const L = { psr, slope, illum, earth };
    for (const t of FEASIBILITY_ASSETS) {
      const v = assetFeasibility(L, t);
      FEASIBILITY_MAPS[t][i] = v;
      if (v < mins[t]) mins[t] = v;
      if (v > maxs[t]) maxs[t] = v;
    }
  }
  for (const t of FEASIBILITY_ASSETS) {
    if (maxs[t] > mins[t]) FEASIBILITY_RANGES[t] = [mins[t], maxs[t]];
  }
}

// Sample feasibility for one asset at a pixel (for the explore sidebar / tooltips).
export function feasibilityAt(x, y, type) {
  if (x < 0 || y < 0 || x >= W || y >= H) return NaN;
  const map = FEASIBILITY_MAPS[type];
  return map ? map[y * W + x] : NaN;
}
