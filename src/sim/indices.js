// ── Mission-phase favorability indices ──────────────────────────────────────
//
// Direct implementation of the three indices from Blog Post 2 of the
// Designated Lunar Areas series, "Geology Writes the Rules" (Paulson, 2026):
//
//   LFI , Landing Favorability Index      (Class 2 / descent of Class 3)
//   SOFI, Surface Operations Favorability  (sustained Class 3 surface phase)
//   IFI , Ice Favorability Index           (Class 1 / extraction of Class 3)
//
// The thesis the indices encode: the same square kilometer of regolith is
// weighted three completely different ways depending on which mission class
// is operating on it, and NO pixel maximizes all three at once. PSRs are the
// worst place to land, the worst place to operate, and the only place worth
// mining.
//
// Two corrections from the post's SOFI methodology note are implemented
// explicitly because they are the post's central modeling lesson, binary
// survival conditions (comms, shadow) must enter as NONLINEAR modifiers, not
// as terms in a linear weighted sum:
//
//   1. Shadow-avoidance term. The raw min-illumination layer is bimodal at
//      the pole, so a linear average barely separates PSR floors from rim
//      terrain. Fix: take max(min-illum, annual-illum) as the shadow input,
//      then apply an explicit 95% multiplicative penalty inside PSRs.
//
//   2. Comms term. Earth visibility is a make-or-break constraint with a
//      steeply nonlinear relationship to viability, so it cannot sit in the
//      linear sum. It enters as a sigmoid penalty centered between 15% and
//      50% Earth visibility, subtracting up to 0.30 of total score. Sites
//      below that band can score NEGATIVE SOFI, they are not low-favorability
//      operations sites, they are non-sites for solar-powered habitats until
//      relay infrastructure exists.
//
// Provenance note on layer proxies: the post builds its indices on LRO
// products (LOLA slope/roughness, Diviner temperature, WAC illumination,
// LEND hydrogen, modeled Earth visibility, PSR masks). This sandbox carries
// most of those as normalized [0,1] raster layers. Where a layer is absent
// (LOLA roughness; "double-PSR" nesting; separate min/annual illumination)
// the code derives a documented proxy from layers that ARE present rather
// than inventing data. The post itself flags that the weights are a first
// pass and the absolute numbers are not the point, the cross-index ORDERING
// is. The unit tests assert that ordering, not specific magnitudes.

import { W, H, MAP_KM_PER_PX } from "./constants.js";
import {
  PSR_MASK, SLOPE_MAP, ILLUM_MAP, EARTH_VIS_MAP,
  ICE_DEPTH_MAP, HYDROGEN_MAP, TEMPERATURE_MAP,
  effectiveEarthVis,
} from "./mapData.js";

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Slope where a rover can no longer move (matches physics.js). Used to
// normalize the slope sub-score so "flatness" reads 1 at 0° and 0 at ≥25°.
const SLOPE_IMPASSABLE_DEG = 25;

// ── Blog weights, verbatim ───────────────────────────────────────────────────
export const LFI_WEIGHTS = {
  flatness: 0.45,      // slope (0.45, dominant)
  smoothness: 0.25,    // roughness (0.25)
  illumination: 0.15,  // illumination (0.15)
  temperature: 0.10,   // temperature (0.10)
  psrPenalty: 0.05,    // PSR penalty (0.05), subtracted
};

export const SOFI_WEIGHTS = {
  shadowAvoidance: 0.25,
  smoothness: 0.20,
  flatness: 0.15,
  illumination: 0.10,
  sunIncidence: 0.05,
  thermalEnv: 0.05,
  // comms enters NONLINEARLY (sigmoid), not as a linear weight, see below.
  commsPenaltyMax: 0.30,
};

export const IFI_WEIGHTS = {
  hydrogen: 0.40,       // LEND hydrogen (0.40)
  psrPresence: 0.15,    // PSR presence (0.15)
  iceStability: 0.15,   // ice stability (0.15)
  doublePsr: 0.10,      // nested / double PSRs (0.10)
  coldSunlit: 0.10,     // min sunlit temperature (0.10)
  lowInsolation: 0.05,  // min insolation (0.05)
  summerCold: 0.05,     // summer cold (0.05)
};

// Comms sigmoid: centered at the midpoint of the 15-50% Earth-visibility band
// the post describes, with a scale that spreads the transition across roughly
// that band. Returns a viability factor in (0,1); 1 = full comms, 0 = none.
const COMMS_CENTER = 0.325; // midpoint of [0.15, 0.50]
const COMMS_SCALE  = 0.08;  // ~the half-width of the transition band
export function commsViability(earthVis) {
  return 1 / (1 + Math.exp(-(earthVis - COMMS_CENTER) / COMMS_SCALE));
}
export function commsPenalty(earthVis) {
  return SOFI_WEIGHTS.commsPenaltyMax * (1 - commsViability(earthVis));
}

// Local roughness proxy: mean absolute slope difference to the 4-neighbours,
// normalized. Stands in for the LOLA roughness layer the post uses. Smooth
// terrain → near 0; broken/blocky terrain (crater rims, ejecta) → higher.
function localRoughness(x, y) {
  const i = y * W + x;
  const s = SLOPE_MAP[i] || 0;
  let acc = 0, n = 0;
  if (x > 0)     { acc += Math.abs((SLOPE_MAP[i - 1] || 0) - s); n++; }
  if (x < W - 1) { acc += Math.abs((SLOPE_MAP[i + 1] || 0) - s); n++; }
  if (y > 0)     { acc += Math.abs((SLOPE_MAP[i - W] || 0) - s); n++; }
  if (y < H - 1) { acc += Math.abs((SLOPE_MAP[i + W] || 0) - s); n++; }
  const meanDiff = n ? acc / n : 0;
  // 6° of local relief over one pixel is already very rough at 0.5 km/px.
  return clamp01(meanDiff / 6);
}

// Pull the normalized layer sample at a pixel into a plain object. `comsats`
// (optional) lets a deployed relay lift a site out of DTE blackout, exactly
// as effectiveEarthVis does in the live sim, so building a comsat visibly
// raises SOFI at otherwise comms-dead sites.
export function sampleLayers(x, y, comsats = null) {
  if (x < 0 || x >= W || y < 0 || y >= H) return null;
  const i = y * W + x;
  const earth = comsats ? effectiveEarthVis(x, y, comsats) : (EARTH_VIS_MAP[i] || 0);
  return {
    psr:    PSR_MASK[i] === 1,
    slope:  SLOPE_MAP[i] || 0,
    illum:  ILLUM_MAP[i] || 0,
    earth,
    ice:    ICE_DEPTH_MAP[i] || 0,
    h2:     HYDROGEN_MAP[i] || 0,
    temp:   TEMPERATURE_MAP[i] || 0,   // normalized 0..1 (0=coldest)
    rough:  localRoughness(x, y),
  };
}

// ── LFI: landing favorability ────────────────────────────────────────────────
export function landingFavorability(L) {
  const flat   = clamp01(1 - L.slope / SLOPE_IMPASSABLE_DEG);
  const smooth = 1 - L.rough;
  const w = LFI_WEIGHTS;
  let s = w.flatness * flat
        + w.smoothness * smooth
        + w.illumination * L.illum
        + w.temperature * L.temp;       // some warmth helps hardware survival
  if (L.psr) s -= w.psrPenalty;          // PSR floors are landing-hostile
  return s;
}

// ── SOFI: surface-operations favorability (with both corrections) ────────────
export function surfaceOpsFavorability(L) {
  // Correction 1, shadow avoidance. Annual illumination stands in for the
  // max(min-illum, annual-illum) input; inside a PSR, apply the explicit 95%
  // multiplicative penalty so PSR floors drop out hard instead of being
  // averaged away.
  let shadowAvoid = L.illum;
  if (L.psr) shadowAvoid *= 0.05;

  const flat   = clamp01(1 - L.slope / SLOPE_IMPASSABLE_DEG);
  const smooth = 1 - L.rough;
  // mild-thermal favorability: penalize the extremes (deep cold and full
  // sun-baked), favor the moderate rim band.
  const thermal = 1 - Math.abs(L.temp - 0.5) * 2;

  const w = SOFI_WEIGHTS;
  const linear = w.shadowAvoidance * shadowAvoid
               + w.smoothness * smooth
               + w.flatness * flat
               + w.illumination * L.illum
               + w.sunIncidence * L.illum     // sun incidence proxy
               + w.thermalEnv * clamp01(thermal);

  // Correction 2, comms enters as a nonlinear penalty, not a linear term.
  // Subtracts up to 0.30; can push SOFI below zero (a "non-site").
  return linear - commsPenalty(L.earth);
}

// ── IFI: ice favorability ────────────────────────────────────────────────────
export function iceFavorability(L) {
  const cold = 1 - L.temp;                 // 1 = coldest cold-trap
  const psr  = L.psr ? 1 : 0;
  // nested / double-PSR proxy: a PSR that is ALSO deeply un-illuminated is the
  // post's "double PSR" case (a shadow within a shadow). 0 outside PSRs.
  const doublePsr = L.psr ? clamp01(1 - L.illum) : 0;
  const w = IFI_WEIGHTS;
  return w.hydrogen * L.h2
       + w.psrPresence * psr
       + w.iceStability * L.ice
       + w.doublePsr * doublePsr
       + w.coldSunlit * cold
       + w.lowInsolation * clamp01(1 - L.illum)
       + w.summerCold * cold;
}

// ── Precomputed index rasters (for the toggleable map layers) ───────────────
//
// Filled once by computeIndexRasters() after loadMapData has populated the
// terrain buffers. NaN marks pixels with no map data (outside the polar disk),
// so the renderer can skip them instead of painting the empty background as a
// pristine landing site. INDEX_RANGES holds the min/max over valid pixels for
// display normalization. This is the data behind the post's "three maps, one
// terrain" composite (Figure 5: R = LFI, G = SOFI, B = IFI).

export const LFI_MAP  = new Float32Array(W * H);
export const SOFI_MAP = new Float32Array(W * H);
export const IFI_MAP  = new Float32Array(W * H);
export const INDEX_RANGES = {
  lfi:  [0, 1], sofi: [0, 1], ifi: [0, 1],
};

export function computeIndexRasters() {
  let lMin = Infinity, lMax = -Infinity;
  let sMin = Infinity, sMax = -Infinity;
  let iMin = Infinity, iMax = -Infinity;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const psr = PSR_MASK[i] === 1;
      const slope = SLOPE_MAP[i] || 0;
      const illum = ILLUM_MAP[i] || 0;
      const earth = EARTH_VIS_MAP[i] || 0;
      const ice = ICE_DEPTH_MAP[i] || 0;
      const h2 = HYDROGEN_MAP[i] || 0;
      const temp = TEMPERATURE_MAP[i] || 0;
      // No terrain data here (background outside the disk): skip.
      const hasData = psr || slope > 0 || illum > 0 || earth > 0 || ice > 0 || h2 > 0 || temp > 0;
      if (!hasData) { LFI_MAP[i] = NaN; SOFI_MAP[i] = NaN; IFI_MAP[i] = NaN; continue; }
      const L = { psr, slope, illum, earth, ice, h2, temp, rough: localRoughness(x, y) };
      const lfi = landingFavorability(L);
      const sofi = surfaceOpsFavorability(L);
      const ifi = iceFavorability(L);
      LFI_MAP[i] = lfi; SOFI_MAP[i] = sofi; IFI_MAP[i] = ifi;
      if (lfi < lMin) lMin = lfi; if (lfi > lMax) lMax = lfi;
      if (sofi < sMin) sMin = sofi; if (sofi > sMax) sMax = sofi;
      if (ifi < iMin) iMin = ifi; if (ifi > iMax) iMax = ifi;
    }
  }
  if (lMax > lMin) INDEX_RANGES.lfi  = [lMin, lMax];
  if (sMax > sMin) INDEX_RANGES.sofi = [sMin, sMax];
  if (iMax > iMin) INDEX_RANGES.ifi  = [iMin, iMax];
}

// ── Composite site read-out ──────────────────────────────────────────────────
//
// Returns the three indices plus a plain-language verdict that encodes the
// post's argument: which single phase the site favors, whether it is a comms
// "non-site", and whether (it never does) it satisfies all three.
export function siteIndices(x, y, comsats = null) {
  const L = sampleLayers(x, y, comsats);
  if (!L) return null;
  const lfi  = landingFavorability(L);
  const sofi = surfaceOpsFavorability(L);
  const ifi  = iceFavorability(L);
  return { lfi, sofi, ifi, ...classifyIndices(lfi, sofi, ifi) };
}

// Thresholds for the qualitative verdict. Deliberately loose, the post is
// explicit that the weights are unvalidated and the magnitudes are a first
// pass; these only need to separate "viable" from "marginal" from "non-site".
// Exported so UI (ExploreSidebar bars, verdict captions) reads the SAME
// thresholds the classifier uses, rather than re-hardcoding 0.30 / 0.15.
export const VIABLE = 0.30;
export const MARGINAL = 0.15;

export function classifyIndices(lfi, sofi, ifi) {
  const phases = [
    { key: "land", label: "Landing", v: lfi },
    { key: "ops",  label: "Operations", v: sofi },
    { key: "ice",  label: "Ice extraction", v: ifi },
  ];
  const viable = phases.filter((p) => p.v >= VIABLE);
  const best = phases.reduce((a, b) => (b.v > a.v ? b : a));
  const commsNonSite = sofi < 0;

  let verdict;
  if (viable.length >= 3) {
    // The post's headline result: this should never fire on real terrain.
    verdict = "Saturates all three: does not occur on real south-polar terrain.";
  } else if (commsNonSite && ifi >= VIABLE) {
    verdict = "Ice target, but a comms/operations non-site. Robotic prospecting or relay infrastructure only.";
  } else if (viable.length === 0) {
    verdict = `Marginal across all phases; best fit is ${best.label.toLowerCase()}.`;
  } else {
    verdict = `Favors ${viable.map((p) => p.label.toLowerCase()).join(" + ")}, not the other phase(s).`;
  }
  return { best: best.key, viablePhases: viable.map((p) => p.key), commsNonSite, verdict };
}

// ── Blog Post 2 presentation data + planner readouts ─────────────────────────
//
// The three index cards as the post frames them in §1: the mission QUESTION
// each index answers and the headline WEIGHTS it carries, plus the post's
// accent palette (LFI teal, SOFI gold, IFI violet). The detailed internal
// weights above (SOFI_WEIGHTS / IFI_WEIGHTS) are the full methodology; these
// are the reader-facing summary the post prints on its cards.
export const INDEX_CARDS = [
  {
    key: "lfi", abbr: "LFI", name: "Landing favorability",
    question: "Can the lander touch down here without breaking?",
    phase: "Class 2 · descent", accent: "#5DCAA5",
    weights: [["Slope", 0.45], ["Roughness", 0.25], ["Illumination", 0.15], ["Temperature", 0.10], ["Earth visibility", 0.05]],
  },
  {
    key: "sofi", abbr: "SOFI", name: "Surface ops favorability",
    question: "Can the system stay alive and productive here?",
    phase: "Class 3 · surface", accent: "#EF9F27",
    weights: [["Illumination", 0.40], ["Slope", 0.25], ["Temperature", 0.20], ["Earth visibility", 0.15]],
  },
  {
    key: "ifi", abbr: "IFI", name: "Ice favorability",
    question: "Is the water ice here in usable form?",
    phase: "Class 1 · extraction", accent: "#A8A8F0",
    weights: [["PSR coverage", 0.50], ["Neutron (LEND)", 0.25], ["Temperature", 0.15], ["Slope", 0.10]],
  },
];

// The post's "4 classes, low to high" favorability classification, plus an
// explicit non-site class for the negative (comms-dead) SOFI regime.
export function favorabilityClass(v) {
  if (v < 0)        return { label: "Non-site",  t: 0 };
  if (v < MARGINAL) return { label: "Poor",      t: 1 };
  if (v < VIABLE)   return { label: "Marginal",  t: 2 };
  if (v < 0.6)      return { label: "Favorable", t: 3 };
  return { label: "Strong", t: 4 };
}

// ── "Adjacency is the resource" (§6) ─────────────────────────────────────────
//
// No pixel maximizes all three indices, so the planner's real question is not
// "is this the perfect site" but "how far away are the complementary phases".
// Pure ring-search over a favorability raster for the nearest pixel that
// clears `threshold`, capped at `maxR` pixels. Returns the first ring with a
// hit (nearest by Chebyshev radius; close enough to Euclidean for a distance
// readout). Parameterized so it can be tested on a small synthetic grid.
export function nearestFavorableSite(map, w, h, x, y, threshold = VIABLE, maxR = 120) {
  if (x < 0 || x >= w || y < 0 || y >= h) return null;
  if (map[y * w + x] >= threshold) return { x, y, dist: 0, val: map[y * w + x] };
  for (let r = 1; r <= maxR; r++) {
    let best = null;
    const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
    const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
    for (let yy = y0; yy <= y1; yy++) {
      const onYedge = yy === y - r || yy === y + r;
      for (let xx = x0; xx <= x1; xx++) {
        if (!onYedge && xx !== x - r && xx !== x + r) continue; // ring perimeter only
        const v = map[yy * w + xx];
        if (v >= threshold) {
          const d = Math.hypot(xx - x, yy - y);
          if (!best || d < best.dist) best = { x: xx, y: yy, dist: d, val: v };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

// Wrapper over the live LFI/SOFI/IFI rasters: for a given pixel, the nearest
// viable site for each phase, with distance in km. `self` flags which phases
// this very pixel already satisfies (distance 0).
export function adjacencySites(x, y, maxRkm = 60) {
  const maxR = Math.round(maxRkm / MAP_KM_PER_PX);
  const find = (map) => {
    const s = nearestFavorableSite(map, W, H, x, y, VIABLE, maxR);
    if (!s) return null;
    return { x: s.x, y: s.y, km: s.dist * MAP_KM_PER_PX, val: s.val, self: s.dist === 0 };
  };
  return { land: find(LFI_MAP), ops: find(SOFI_MAP), ice: find(IFI_MAP) };
}
