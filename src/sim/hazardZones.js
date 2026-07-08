// ── DLA hazard zones ────────────────────────────────────────────────────────
//
// In-sim port of Aaron Mackey's OLF DLA If/Then Toolkit (the lunar-radius
// framework, v0.5). The standalone tool computes three concentric operational
// zones (core / buffer / coordination) from a hazard input and exports them as
// buffers.json for the simulator. This module brings that computation inside
// the sandbox so a facilitator can derive the live safety zones from hazard
// physics during a workshop, and round-trip buffers.json / GeoJSON with the
// standalone GIS tool.
//
// IMPORTANT scale note. The standalone tool was written against an older 700px
// build of the simulator (700 px / 288.678 km ≈ 2.4248 px/km) and bakes pixel
// values at that scale into buffers.json. THIS sandbox is 1212 px / 606 km =
// 2 px/km (see constants.js). So we never trust the baked `SAFETY_RADIUS`
// pixels from an imported buffers.json; we read the zone values in KILOMETRES
// (physical truth, scale-independent) and reproject with this sim's own
// PIXELS_PER_KM. Same on export: we emit pixels at THIS sim's scale.
//
// Framework-free: no DOM, no React. Pure functions, validated in
// tests/hazardZones.test.js the same way the rest of the sim core is.

import { PIXELS_PER_KM, MAP_KM, W } from "./constants.js";

export const LUNAR_RADIUS_KM = 1737.4;   // mean lunar radius, for geodetic circles

// Hazard metadata: default linear ratio (X input units → Y km core radius).
// `dust` is special-cased to a power law; the rest use the linear ratio.
export const HAZARD_TYPES = {
  dust:      { label: "Dust",            unit: "kg/hr",  defaultRatioIn: 100, defaultRatioOut: 5, powerLaw: true },
  radiation: { label: "Radiation",       unit: "mSv/hr", defaultRatioIn: 10,  defaultRatioOut: 3 },
  rf:        { label: "RF emissions",    unit: "mW",     defaultRatioIn: 50,  defaultRatioOut: 2 },
  thermal:   { label: "Thermal output",  unit: "MW",     defaultRatioIn: 500, defaultRatioOut: 8 },
  ejecta:    { label: "Ejecta / debris", unit: "kg/hr",  defaultRatioIn: 50,  defaultRatioOut: 4 },
  custom:    { label: "Custom",          unit: "units",  defaultRatioIn: 100, defaultRatioOut: 5 },
};

export const CONFIDENCE_OPTIONS = [
  { value: 0.10, label: "High · ±10%" },
  { value: 0.25, label: "Medium · ±25%" },
  { value: 0.50, label: "Low · ±50%" },
  { value: 1.00, label: "Unknown" },
];

export const MITIGATION_OPTIONS = [
  { value: 1.0,  label: "None" },
  { value: 0.6,  label: "Partial · berm / shield" },
  { value: 0.35, label: "Full · enclosure / suppression" },
];

export const DEFAULT_BUFFER_MULT = 2.5;
export const DEFAULT_COORD_MULT  = 5.0;

// Zone → simulator asset class. Matches the standalone tool's mapping table:
// landing pads sit at the innermost core, habitats/rovers at the buffer,
// widely-distributed solar at the coordination ring. Reactor and comsat are
// NOT defined by the framework, so they are intentionally left untouched.
export const ZONE_FOR_ASSET = {
  pad:     { zone: "core",   rationale: "Landing pads: primary source, innermost exclusion" },
  habitat: { zone: "buffer", rationale: "Habitats: sensitive long-duration assets" },
  rover:   { zone: "buffer", rationale: "Rovers: operate in the field" },
  solar:   { zone: "coord",  rationale: "Solar panels: distributed widely, coordination ring" },
};

// Reactors are not part of Aaron's standalone mapping (it predates surface
// fission power in the sandbox), but a reactor is itself a radiation / thermal
// hazard source, so the panel can optionally fold it into a chosen zone. This
// is an explicit, opt-in facilitator choice, default off, and stays out of the
// exported buffers.json so the OLF schema round-trips unchanged.
export const REACTOR_ZONE_OPTIONS = [
  { value: "off",    label: "Keep default" },
  { value: "core",   label: "Core · no entry" },
  { value: "buffer", label: "Buffer · restricted" },
  { value: "coord",  label: "Coordination · notify" },
];

const round2 = (x) => parseFloat(x.toFixed(2));

// ── Radius computation: DUST mode (power law) ────────────────────────────────
// core = 0.5 × effective^0.55, clamped to [0.5, 30] km. Coefficients are the
// framework's placeholders pending calibration against dust-transport models.
export function computeDustRadii(dustKgHr, confidence, mitigationFactor) {
  const worstCase = (dustKgHr || 0) * (1 + (confidence || 0));
  const effective = worstCase * (mitigationFactor ?? 1);
  const core   = round2(Math.min(30, Math.max(0.5, 0.5 * Math.pow(Math.max(0, effective), 0.55))));
  const buffer = round2(core * DEFAULT_BUFFER_MULT);
  const coord  = round2(core * DEFAULT_COORD_MULT);
  return { core, buffer, coord, worstCase, effective };
}

// ── Radius computation: MANUAL mode (linear ratio) ───────────────────────────
// core = (effective / ratioIn) × ratioOut. Buffer / coord are user multipliers.
export function computeManualRadii(value, confidence, mitigationFactor, ratioIn, ratioOut, bufMult, coordMult) {
  const worstCase = (value || 0) * (1 + (confidence || 0));
  const effective = worstCase * (mitigationFactor ?? 1);
  const ri = ratioIn || 1;
  const core   = round2(Math.max(0.1, (effective / ri) * (ratioOut || 0)));
  const buffer = round2(core * (bufMult ?? DEFAULT_BUFFER_MULT));
  const coord  = round2(core * (coordMult ?? DEFAULT_COORD_MULT));
  return { core, buffer, coord, worstCase, effective };
}

// ── Hazard classification ────────────────────────────────────────────────────
export function classifyHazard(core) {
  if (core < 2) return { cls: "low",    text: "Low hazard · standard notification sufficient" };
  if (core < 8) return { cls: "medium", text: "Moderate hazard · coordination zone required" };
  return { cls: "high", text: "High hazard · full exclusion and buffer zones required" };
}

// ── Zone → per-asset km map ──────────────────────────────────────────────────
export function zonesToSafetyRadiusKm({ core, buffer, coord }) {
  const z = { core, buffer, coord };
  const out = {};
  for (const [asset, { zone }] of Object.entries(ZONE_FOR_ASSET)) out[asset] = z[zone];
  return out; // { pad, habitat, rover, solar } in km
}

// ── Apply / restore against a live SAFETY_RADIUS object ──────────────────────
// Mutates `target` in place (so every module that imported the same object
// reference sees the change) for ONLY the framework-mapped asset classes.
// Returns a snapshot of the prior pixel values so it can be reverted exactly.
// Mutates `target` in place (so every module that imported the same object
// reference sees the change) for whichever asset classes appear in `kmMap`.
// The canonical framework map covers pad / habitat / rover / solar; the panel
// may additionally include `reactor` as an explicit facilitator choice.
// Returns a snapshot of the prior pixel values so it can be reverted exactly.
export function applySafetyRadius(target, kmMap, pixelsPerKm = PIXELS_PER_KM) {
  const prior = {};
  for (const asset of Object.keys(kmMap)) {
    if (kmMap[asset] == null || !(asset in target)) continue;
    prior[asset] = target[asset];
    target[asset] = kmMap[asset] * pixelsPerKm;
  }
  return prior;
}

export function restoreSafetyRadius(target, snapshot) {
  for (const [asset, px] of Object.entries(snapshot || {})) target[asset] = px;
}

// ── buffers.json: parse (import) ─────────────────────────────────────────────
// Robustly extract zone radii in KM from an OLF-DLA buffers.json. Prefers
// zones_km; falls back to per-asset mapping km; ignores baked pixels because
// of the cross-build scale mismatch documented at the top of this file.
export function parseBuffersJson(data) {
  if (!data || typeof data !== "object") throw new Error("not an object");
  let core, buffer, coord;
  if (data.zones_km && typeof data.zones_km === "object") {
    core = data.zones_km.core;
    buffer = data.zones_km.buffer;
    coord = data.zones_km.coordination ?? data.zones_km.coord;
  } else if (data.mapping) {
    core   = data.mapping.pad?.km;
    buffer = data.mapping.habitat?.km ?? data.mapping.rover?.km;
    coord  = data.mapping.solar?.km;
  }
  if (![core, buffer, coord].every((v) => Number.isFinite(v) && v > 0)) {
    throw new Error("could not read zones_km (core / buffer / coordination) in km");
  }
  return {
    zones: { core: round2(core), buffer: round2(buffer), coord: round2(coord) },
    meta: data._meta || {},
  };
}

// ── buffers.json: build (export) ─────────────────────────────────────────────
// Emits the OLF-DLA-buffers-v1 schema, but with pixel values at THIS sim's
// scale (PIXELS_PER_KM) rather than the standalone tool's legacy 2.4248.
export function buildBuffersJson({ core, buffer, coord, meta = {}, pixelsPerKm = PIXELS_PER_KM, mapKm = MAP_KM, canvasPx = W }) {
  const toPx = (km) => parseFloat((km * pixelsPerKm).toFixed(3));
  const radiusMap = zonesToSafetyRadiusKm({ core, buffer, coord });
  const SAFETY_RADIUS = {};
  for (const [asset, km] of Object.entries(radiusMap)) SAFETY_RADIUS[asset] = toPx(km);
  const mapping = {};
  for (const [asset, { zone, rationale }] of Object.entries(ZONE_FOR_ASSET)) {
    mapping[asset] = { zone: zone === "coord" ? "coordination" : zone, km: radiusMap[asset], px: toPx(radiusMap[asset]), rationale };
  }
  return {
    _meta: {
      schema: "OLF-DLA-buffers-v1",
      description: "Safety radii for the OLF lunar policy sandbox. Pixel values at the sandbox's native scale.",
      generated: new Date().toISOString(),
      framework: "Open Lunar Foundation · DLA Hazard Framework (in-sandbox port)",
      site: meta.siteName || meta.site || null,
      coordinates: (meta.lat != null && meta.lon != null) ? { lat: meta.lat, lon: meta.lon } : null,
      input_mode: meta.inputMode || null,
      hazard_type: meta.hazardType || null,
      simulator: {
        map_km: mapKm,
        canvas_px: canvasPx,
        pixels_per_km: parseFloat(pixelsPerKm.toFixed(4)),
        note: "Multiply km values by pixels_per_km to get pixel radii at this sim's scale",
      },
    },
    zones_km: { core, buffer, coordination: coord },
    SAFETY_RADIUS,
    mapping,
  };
}

// ── GeoJSON (GIS export) ─────────────────────────────────────────────────────
function circlePolygon(centerLat, centerLon, radiusKm, steps = 72) {
  const coords = [];
  const ang = radiusKm / LUNAR_RADIUS_KM;
  const lat = (centerLat * Math.PI) / 180;
  const lon = (centerLon * Math.PI) / 180;
  for (let i = 0; i <= steps; i++) {
    const b = ((i * 360) / steps) * (Math.PI / 180);
    const pLat = Math.asin(Math.sin(lat) * Math.cos(ang) + Math.cos(lat) * Math.sin(ang) * Math.cos(b));
    const pLon = lon + Math.atan2(Math.sin(b) * Math.sin(ang) * Math.cos(lat), Math.cos(ang) - Math.sin(lat) * Math.sin(pLat));
    coords.push([parseFloat(((pLon * 180) / Math.PI).toFixed(6)), parseFloat(((pLat * 180) / Math.PI).toFixed(6))]);
  }
  coords.push(coords[0]);
  return coords;
}

export function buildGeoJson({ lat = -89.9, lon = 0, siteName = null, core, buffer, coord, properties = {} }) {
  const ring = (km) => ({ type: "Polygon", coordinates: [circlePolygon(lat, lon, km)] });
  const feat = (name, km, fill, op) => ({
    type: "Feature",
    properties: { zone: name, radius_km: km, fill, "fill-opacity": op, stroke: fill, "stroke-width": 1.5 },
    geometry: ring(km),
  });
  return {
    type: "FeatureCollection",
    properties: { framework: "Open Lunar Foundation · DLA Hazard Framework", version: "0.5", crs: "IAU:30100", site: siteName, ...properties },
    features: [
      feat("coordination", coord, "#3460A8", 0.10),
      feat("buffer", buffer, "#A8A8F0", 0.18),
      feat("core", core, "#E89BB5", 0.30),
      { type: "Feature", properties: { zone: "source", site: siteName }, geometry: { type: "Point", coordinates: [lon, lat] } },
    ],
  };
}
