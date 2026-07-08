// ── Rover power + slope physics ─────────────────────────────────────────────
//
// Curves match the published VIPER trafficability charts (NASA Glenn rover
// ops, Pranzitelli et al.):
//
//   slope_factor(s°) = max(0, min(1, 1 - s/25))   for speed
//   power_factor(s°) = 1 + (s/15)²                for power draw
//
// So a rover on a 15° slope moves at 40% nominal speed at 2× nominal power.
// Slope ≥ 25° → impassable (factor 0).

export function roverSlopeFactor(slopeDeg) {
  if (!Number.isFinite(slopeDeg)) return 1.0;
  const f = 1 - slopeDeg / 25;
  return Math.max(0, Math.min(1, f));
}

export function roverPowerFactor(slopeDeg) {
  if (!Number.isFinite(slopeDeg)) return 1.0;
  const s = Math.max(0, slopeDeg) / 15;
  return 1 + s * s;
}

// ── Per-pixel terrain analysis ──────────────────────────────────────────────
// Returns a structured assessment with equipment recommendations.
// Used by the Explore Terrain panel and the placement-readiness checks.
//
//   { lat, lon, psr, slope, illum, earth, ice, h2, temp,
//     recs: [{ asset, verdict: "good" | "ok" | "bad", reason }] }

import { W, H } from "./constants.js";
import {
  PSR_MASK, SLOPE_MAP, ILLUM_MAP, EARTH_VIS_MAP,
  ICE_DEPTH_MAP, HYDROGEN_MAP, TEMPERATURE_MAP,
  pxToLatLon,
} from "./mapData.js";
import { siteIndices } from "./indices.js";

// `comsats` (optional) lets a deployed relay raise the comms-dependent SOFI
// term, mirroring effectiveEarthVis in the live sim.
export function analyzePixel(x, y, comsats = null) {
  if (x < 0 || x >= W || y < 0 || y >= H) return null;
  const i = y * W + x;
  const { lat, lon } = pxToLatLon(x, y);
  const psr   = PSR_MASK[i] === 1;
  const slope = SLOPE_MAP[i];
  const illum = ILLUM_MAP[i];
  const earth = EARTH_VIS_MAP[i];
  const ice   = ICE_DEPTH_MAP[i];
  const h2    = HYDROGEN_MAP[i];
  const temp  = TEMPERATURE_MAP[i];

  const recs = [];

  // Solar: sustained illumination, low slope.
  if (slope > 20) {
    recs.push({ asset: "solar", verdict: "bad", reason: `Slope ${slope.toFixed(0)}° -- too steep for panels` });
  } else if (illum > 0.7) {
    recs.push({ asset: "solar", verdict: "good", reason: `${(illum * 100).toFixed(0)}% annual sunlight -- excellent siting` });
  } else if (illum > 0.4) {
    recs.push({ asset: "solar", verdict: "ok", reason: `${(illum * 100).toFixed(0)}% sunlight -- marginal, plan storage` });
  } else {
    recs.push({ asset: "solar", verdict: "bad", reason: `${(illum * 100).toFixed(0)}% sunlight -- needs battery or reactor` });
  }

  // Habitat: reasonably flat, prefer some Earth visibility.
  if (slope > 15) {
    recs.push({ asset: "habitat", verdict: "bad", reason: `Slope ${slope.toFixed(0)}° -- crew habitat needs flat terrain` });
  } else if (earth > 0.5 && slope < 8) {
    recs.push({ asset: "habitat", verdict: "good", reason: `Flat (${slope.toFixed(0)}°), ${(earth * 100).toFixed(0)}% Earth visibility -- good DTE comms` });
  } else if (earth < 0.2) {
    recs.push({ asset: "habitat", verdict: "ok", reason: `Slope ${slope.toFixed(0)}° fine but only ${(earth * 100).toFixed(0)}% Earth vis -- comms blackout risk` });
  } else {
    recs.push({ asset: "habitat", verdict: "ok", reason: `Slope ${slope.toFixed(0)}° workable, ${(earth * 100).toFixed(0)}% Earth visibility` });
  }

  // Reactor: flat terrain.
  if (slope > 12) {
    recs.push({ asset: "reactor", verdict: "bad", reason: `Slope ${slope.toFixed(0)}° -- reactor needs <12° for stable mounting` });
  } else if (slope < 5) {
    recs.push({ asset: "reactor", verdict: "good", reason: `Slope ${slope.toFixed(0)}° -- ideal for fission surface power` });
  } else {
    recs.push({ asset: "reactor", verdict: "ok", reason: `Slope ${slope.toFixed(0)}° acceptable` });
  }

  // Landing pad: very flat, reasonable Earth visibility.
  if (slope > 8) {
    recs.push({ asset: "pad", verdict: "bad", reason: `Slope ${slope.toFixed(0)}° -- landing pad needs <8° gradient` });
  } else if (earth > 0.3 && slope < 4) {
    recs.push({ asset: "pad", verdict: "good", reason: `Flat (${slope.toFixed(0)}°) with ${(earth * 100).toFixed(0)}% Earth comms` });
  } else {
    recs.push({ asset: "pad", verdict: "ok", reason: `Slope ${slope.toFixed(0)}° workable` });
  }

  // Rover trafficability.
  if (slope > 20) {
    recs.push({ asset: "rover", verdict: "bad", reason: `Slope ${slope.toFixed(0)}° -- impassable for surface rovers` });
  } else if (slope > 12) {
    recs.push({ asset: "rover", verdict: "ok", reason: `Slope ${slope.toFixed(0)}° -- traversable but slow` });
  } else {
    recs.push({ asset: "rover", verdict: "good", reason: `Slope ${slope.toFixed(0)}° -- rover-trafficable` });
  }

  // Mining (PSR only).
  if (psr) {
    if (ice > 0.4) {
      recs.push({ asset: "mining", verdict: "good", reason: `PSR with ${(ice * 100).toFixed(0)}% ice signature -- high-yield extraction target` });
    } else if (ice > 0.15) {
      recs.push({ asset: "mining", verdict: "ok", reason: `PSR but only ${(ice * 100).toFixed(0)}% ice -- modest yield` });
    } else {
      recs.push({ asset: "mining", verdict: "bad", reason: `PSR but low ice signature -- not worth extraction` });
    }
  } else {
    recs.push({ asset: "mining", verdict: "bad", reason: `Not a PSR -- no trapped volatiles` });
  }

  return { lat, lon, psr, slope, illum, earth, ice, h2, temp, recs,
           indices: siteIndices(x, y, comsats) };
}
