// ── Map data ────────────────────────────────────────────────────────────────
//
// LRO polar-stereographic layers, co-registered to the 80°S polar circle.
// All masks are W × H typed arrays held as live module bindings so the
// renderer + simulation share the same buffers.
//
// Loading: call `loadMapData()` on app boot. It reads every JPEG from
// /public/maps/, fills the typed arrays in place, and reassigns
// CRATER_DATA (only the variable that grows by export).

import { W, H, MAP_KM_PER_PX, POLE_PX, COMMS_BLACKOUT_THRESHOLD, COMSAT_RELAY_RADIUS, COMSAT_COVERAGE_BOOST } from "./constants.js";
// Runtime import (called inside loadMapData, never at module-eval) so the
// indices <-> mapData buffer cycle resolves cleanly.
import { computeIndexRasters } from "./indices.js";

// ── Layer manifest ──────────────────────────────────────────────────────────
//
// v52: `annual_illum.jpg` is now REAL LROC south-polar illumination data,
// exported from QuickMap and registered into the sandbox's polar-
// stereographic frame by scripts/process_quickmap_illum.py. The projection
// was measured deterministically from the export's own graticule overlay
// (pole at source-px 746,396; 12.9 px/degree co-latitude, verified against
// the 60 S and 70 S circles). This replaces the v51 synthetic proxy and the
// earlier single-instant LRO snapshots that were mislabeled "annual."
//
// The PSR mask (`psr_mask_clean.png`) is now DERIVED from this same real
// illumination (scripts/derive_psr_from_illum.py: PSRs = the persistently-
// shadowed dark tail), so the illumination layer and the cold-trap game
// logic finally share one consistent, correctly-registered geometry.
// Validated against craters.json: Shoemaker/Haworth/Faustini/Cabeus PSR
// positions all land on their listed coordinates.
//
// The runtime ILLUM_MAP (which RIDGE_MASK derives from, and which drives
// solar-siting gameplay) loads `annual_illum`. The `basemap_illum` and
// `sunlit_max` keys remain as aliases pointing at the same file so saved
// games / replays referencing them by key still resolve.
//
// PROVENANCE CAVEAT: the QuickMap layer used is a shaded-relief illumination
// visualization -- real, correctly georeferenced, but not a Mazarico annual
// integral. To upgrade to the true Mazarico average-illumination product,
// swap the source file in public/maps/source/ and re-run the same
// registration script; the geometry math is unchanged.
export const MAP_LAYERS = {
  // Base maps -- mutually exclusive, pick one as the canvas backdrop.
  // v73: QuickMap LROC mosaic, geo-registered to the sim polar frame,
  // colour-treated for cartoony depth. New default.
  basemap_quickmap:        "/maps/basemap_quickmap.jpg",          // QuickMap LROC (DEFAULT)
  // v71: real LROC/LOLA shaded relief (QuickMap export), cropped to the 80°S
  // polar circle and registered to the sim frame (pole at center, disk edge =
  // 80°S), graticule + labels removed, de-noised and sharpened. Real data,
  // co-registered to the PSR / slope / ice layers.
  basemap_lroc_relief:     "/maps/basemap_lroc_relief.jpg",        // Real LROC relief (DEFAULT)
  // v69 synthetic clean relief (kept as an option).
  basemap_topo_bw:         "/maps/basemap_topo_bw.jpg",            // Clean B&W synthetic relief
  basemap_topo_contour:    "/maps/basemap_topo_contour.jpg",       // LROC shaded-relief contours (raster)
  basemap_topo_vector:     "/maps/basemap_topo_vector.svg",        // TRUE VECTOR topo contours (synthetic)
  // v104: published true-vector figure plates, registered to the polar disk.
  // These render via the DOM <img> path so they stay crisp at any zoom.
  basemap_fig_topo:        "/maps/fig_topo_basemap.svg",           // Published topographic contours (DEFAULT)
  basemap_fig_composite:   "/maps/fig_composite_basemap.svg",      // Published favorability composite
  basemap_fig_lfi:         "/maps/fig_lfi_basemap.svg",            // Published LFI landing
  basemap_fig_sofi:        "/maps/fig_sofi_basemap.svg",           // Published SOFI surface ops
  basemap_fig_ifi:         "/maps/fig_ifi_basemap.svg",            // Published IFI ice
  basemap_fig_clear:       "/maps/fig_clear_basemap.svg",          // Published illumination
  basemap_bw_overlays:     "/maps/basemap_bw_overlays.svg",        // B&W terrain + bright physics burned in (legacy)
  basemap_mega:            "/maps/basemap_mega.svg",               // Periwinkle composite vector
  basemap_periwinkle_topo: "/maps/basemap_periwinkle_topo.svg",    // USGS-style topographic
  basemap_periwinkle:      "/maps/basemap_periwinkle.svg",         // Vector elevation (dark)
  basemap_dramatic:        "/maps/basemap_dramatic_clean.jpg",
  basemap_rainbow:         "/maps/basemap_rainbow_clean.jpg",
  basemap_psr_clean:       "/maps/basemap_psr_clean_clean.jpg",
  // Annual illumination basemap: new authoritative file. The legacy
  // `basemap_illum` key resolves to the same file for backwards compat.
  annual_illum:            "/maps/annual_illum.jpg",
  basemap_illum:           "/maps/annual_illum.jpg",
  // Stackable overlay layers
  overlay_slope:    "/maps/overlay_slope.svg",
  overlay_earth:    "/maps/overlay_earth.svg",
  overlay_sun:      "/maps/overlay_sun.svg",
  // v51: graticule-cleaned mask. The legacy `psr_mask.jpg` had the polar
  // graticule baked in at luminance ~115; though that's under the >128
  // classification threshold today, it created latent fragility (any
  // lowered threshold would merge PSRs via graticule bridges) and
  // antialiasing notches at PSR-graticule crossings. The cleaned version
  // is generated by scripts/clean_psr_mask.py and saved as PNG to avoid
  // JPG compression-artifact rings at the cleaned positions.
  psr:              "/maps/psr_mask_clean.png",
  ice_depth:        "/maps/ice_depth.jpg",
  water_hydrogen:   "/maps/water_hydrogen.jpg",
  temperature:      "/maps/temperature.jpg",
  sun_incidence:    "/maps/sun_incidence.jpg",
  // `sunlit_max` key kept for backwards compat; points at the new annual
  // file. Previously this loaded a single-instant snapshot.
  sunlit_max:       "/maps/annual_illum.jpg",
  shadows_min:      "/maps/shadows_min.jpg",
  terrain_shadows:  "/maps/terrain_shadows.jpg",
  earth_visibility: "/maps/earth_visibility.jpg",
  slope:            "/maps/slope.jpg",
  roughness:        "/maps/roughness.jpg",
};

export const BASEMAP_OPTIONS = [
  // v120 (item 3): curated to the basemaps that earn their place. Removed nine
  // stale / redundant / blurry entries (legacy B&W-with-burned-in-physics, the
  // three periwinkle/mega cartographic variants, dramatic relief, raster topo
  // contours, PSR-clean raster, rainbow ramp, mono B&W) now that the published
  // true-vector plates are the standard and stay crisp at any zoom. Kept: the
  // real-data LROC rasters (the genuine mosaics worth having), the published
  // vector favorability/topo plates, and the synthetic vector topo.
  { key: "basemap_quickmap",     label: "QuickMap LROC",        subtitle: "Real LROC mosaic, geo-registered and colour-treated · warm highlands, deep crater shadows" },
  { key: "basemap_lroc_relief",  label: "LROC Relief",          subtitle: "Real LROC/LOLA shaded relief from QuickMap, registered to the 80°S polar circle" },
  { key: "basemap_fig_topo",        label: "Topography (published)",     subtitle: "Published true-vector south-polar shaded-relief contours · crisp at any zoom · the dark base for favorability overlays · default" },
  { key: "basemap_fig_composite",   label: "Favorability Composite",     subtitle: "Published true-vector LFI/SOFI/IFI composite · the post's Figure 5 as a crisp vector plate" },
  { key: "basemap_fig_lfi",         label: "LFI · Landing",              subtitle: "Published true-vector landing-favorability plate" },
  { key: "basemap_fig_sofi",        label: "SOFI · Surface Ops",         subtitle: "Published true-vector surface-ops favorability plate" },
  { key: "basemap_fig_ifi",         label: "IFI · Ice",                  subtitle: "Published true-vector ice-favorability plate" },
  { key: "basemap_fig_clear",       label: "Illumination (published)",   subtitle: "Published true-vector sustained-illumination plate" },
  { key: "basemap_topo_vector",     label: "Topographic Vector (synthetic)", subtitle: "Synthetic true-vector elevation contours · crisp at any zoom" },
  { key: "annual_illum",            label: "Illumination (LROC)",    subtitle: "Real LROC south-polar illumination (QuickMap), registered to the polar frame. Dark = persistently shadowed, bright = sustained sunlight." },
];

export const VECTOR_OVERLAYS = [
  { key: "overlay_slope", label: "Slope hazards",  color: "#FF5050", description: "Moderate slopes (10°-25°, amber) and steep slopes (>25°, red) hazardous for landing or traversal",
    bands: [
      { label: "Moderate (10°-25°)", color: "rgba(255,170,0,0.75)",  border: "#FFB52E" },
      { label: "Steep (>25°)",       color: "rgba(240,60,40,0.75)",  border: "#FF5050" },
    ],
  },
  { key: "overlay_earth", label: "Comms blackout", color: "#40A0FF", description: "Earth visibility under 30%, DTE comms unreliable; comsat relay required for operations",
    bands: [
      { label: "Earth vis. < 30%",   color: "rgba(40,80,200,0.65)",  border: "#40A0FF" },
    ],
  },
  { key: "overlay_sun",   label: "Solar potential", color: "#A8E028", description: "Annual illumination fraction: >50% broadly sunlit, >70% good solar siting, >85% prime near-continuous sun",
    bands: [
      { label: ">50% illuminated",     color: "rgba(140,190,40,0.55)", border: "#8AB828" },
      { label: ">70% illuminated",     color: "rgba(168,224,40,0.65)", border: "#A8E028" },
      { label: ">85% (prime solar)",   color: "rgba(200,255,60,0.80)", border: "#C8FF3C" },
    ],
  },
];

export const LAYER_INFO = [
  { key: "psr",              label: "PSR mask",            color: "#FF5FCB", group: "ice",     desc: "Permanently shadowed regions (no direct sunlight in any season)" },
  { key: "ice_depth",        label: "Ice depth proxy",     color: "#3FB6FF", group: "ice",     desc: "Estimated burial depth of water ice" },
  { key: "water_hydrogen",   label: "Water / hydrogen",    color: "#34F0DE", group: "ice",     desc: "LEND / LCROSS epithermal neutron suppression, hydrogen enrichment proxy" },
  { key: "sunlit_max",       label: "Illumination (LROC)", color: "#FFD93B", group: "illum",   desc: "Real LROC south-polar illumination (QuickMap), registered to the polar frame; dark = persistently shadowed, bright = sustained sunlight. Drives RIDGE_MASK and solar-siting." },
  { key: "sun_incidence",    label: "Sun incidence",       color: "#FFAE2E", group: "illum",   desc: "Solar incidence angle; lower angle = more grazing illumination" },
  { key: "shadows_min",      label: "Minimum shadow",      color: "#B07CFF", group: "illum",   desc: "Minimum shadowed fraction over the year, identifies near-PSR terrain" },
  { key: "terrain_shadows",  label: "Terrain shadows",     color: "#C9A4FF", group: "illum",   desc: "Topographic shadow extent, cast shadow footprints from crater rims" },
  { key: "temperature",      label: "Surface temperature", color: "#FF6450", group: "thermal", desc: "Annual mean surface temperature (Diviner LRO radiometer)" },
  { key: "earth_visibility", label: "Earth visibility",    color: "#54EC6A", group: "comms",   desc: "Direct-to-Earth line-of-sight fraction; below 30% = unreliable DTE comms" },
  { key: "slope",            label: "Slope",               color: "#FFB52E", group: "terrain", desc: "Local surface slope (LOLA-derived); above 15° hazardous for landing/traversal" },
  { key: "roughness",        label: "Roughness",           color: "#E6A86A", group: "terrain", desc: "Sub-resolution terrain roughness, affects rover mobility and landing safety" },
  // v70: computed favorability layers (Blog Post 2). Painted from the LFI /
  // SOFI / IFI rasters, not from an image (no MAP_LAYERS url). `computed: true`
  // routes them through the buffer renderer instead of the image overlay path.
  { key: "idx_composite", label: "Favorability composite",          color: "#FFFFFF", group: "favorability", computed: true, desc: "RGB composite of the three mission-phase indices (R = landing, G = operations, B = ice), the post's Figure 5. Yellow = landable + operable, blue = ice-only PSRs, red = landable but comms-dead. No pixel saturates all three." },
  { key: "idx_lfi",       label: "Landing favorability (LFI)",       color: "#FF5A52", group: "favorability", computed: true, desc: "Where it is safe to land. Slope-dominated. PSR floors read as dark voids." },
  { key: "idx_sofi",      label: "Operations favorability (SOFI)",   color: "#54EC6A", group: "favorability", computed: true, desc: "Where solar-powered surface ops are viable. Drops out hard inside PSRs and in the comms-blackout zone. A deployed comsat relay raises it." },
  { key: "idx_ifi",       label: "Ice favorability (IFI)",           color: "#3FB6FF", group: "favorability", computed: true, desc: "Where the ice is. Hydrogen, PSR presence, and cold-trap dominated. Concentrates in PSR-anchored zones near the pole." },
  // v125 (item 8): per-asset placement feasibility layers. Each shows where one
  // buildable asset is viable to place, computed from slope / illumination /
  // Earth-visibility / PSR. `computed: true` routes them through the same buffer
  // renderer as the favorability layers.
  { key: "feas_solar",   label: "Solar feasibility",       color: "#FFC440", group: "feasibility", computed: true, desc: "Where solar panels are viable: sustained illumination on buildable (low-slope) ground. Ridge crests and peaks of near-eternal light." },
  { key: "feas_reactor", label: "Reactor feasibility",     color: "#FF6E5A", group: "feasibility", computed: true, desc: "Where a reactor can sit: flat, stable ground clear of permanently shadowed floors. Sunlight is irrelevant; standoff and slope dominate." },
  { key: "feas_habitat", label: "Habitat feasibility",     color: "#78DC96", group: "feasibility", computed: true, desc: "Where a habitat is safe: moderate slope with some illumination for thermal/power, not a PSR floor." },
  { key: "feas_pad",     label: "Landing-pad feasibility", color: "#A0C8FF", group: "feasibility", computed: true, desc: "Where a pad can land cargo: flat, low-slope touchdown ground." },
  { key: "feas_rover",   label: "Rover feasibility",       color: "#C8AAFF", group: "feasibility", computed: true, desc: "Where a rover can operate: traversable slope. Reaches almost anywhere except impassably steep terrain." },
  { key: "feas_comsat",  label: "Comsat feasibility",      color: "#80E6E8", group: "feasibility", computed: true, desc: "Where a comsat relay helps: strong direct-to-Earth visibility for its ground-projection footprint." },
];

// ── Curated layer presets (v182) ────────────────────────────────────────────
// Playtests found the full LAYER_INFO list overwhelming, "players only ever
// used ice / slope / comms and forgot comms existed at first." These presets put
// a few one-tap curated views up front; the full grouped list stays below for
// advanced users. Each preset replaces the active data overlays with its set
// (and optionally flips a base showLayers flag). Every `overlays` key must exist
// in LAYER_INFO (asserted in tests). Edit freely, this is the curated set.
export const LAYER_PRESETS = [
  { key: "ice",   label: "Ice",          color: "#3FB6FF",
    overlays: ["psr", "ice_depth", "water_hydrogen", "idx_ifi"],
    showLayers: { psr: true },
    desc: "Where the ice is: PSRs, burial depth, hydrogen, and the ice-favorability index." },
  { key: "slope", label: "Terrain",      color: "#FFB52E",
    overlays: ["slope", "roughness", "feas_rover", "feas_pad"],
    desc: "Trafficability & landing: slope, roughness, and where rovers and pads can operate." },
  { key: "comms", label: "Comms",        color: "#54EC6A",
    overlays: ["earth_visibility", "feas_comsat"],
    showLayers: { comms_blackout: true },
    desc: "Direct-to-Earth visibility, the blackout zone, and where a relay helps." },
  { key: "illum", label: "Illumination", color: "#FFD93B",
    overlays: ["sunlit_max", "shadows_min", "feas_solar"],
    desc: "Power siting: sustained sunlight, near-PSR shadow, and solar feasibility." },
  { key: "clear", label: "Clear",        color: "#8B86B0",
    overlays: [],
    desc: "Hide all data overlays, back to the base map." },
];

// ── Named-feature label layer (v26) ─────────────────────────────────────────
// Crater names and graticule labels stripped from baked SVGs so we can
// counter-scale them with zoom and keep on-screen text size constant.
// Coords in source-pixel space (1212×1212).
export const CRATER_LABELS = [
  { name: "Shackleton",  x: 622.0,  y: 619.0 },
  { name: "de Gerlache", x: 515.1,  y: 603.6 },
  { name: "Sverdrup",    x: 648.0,  y: 686.7 },
  { name: "Shoemaker",   x: 687.3,  y: 524.4 },
  { name: "Faustini",    x: 768.9,  y: 588.9 },
  { name: "Haworth",     x: 619.2,  y: 454.9 },
  { name: "Cabeus",      x: 426.3,  y: 354.0 },
  { name: "Nobile",      x: 840.1,  y: 432.7 },
  { name: "Amundsen",    x: 925.1,  y: 565.7 },
  { name: "Idel'son",    x: 1088.5, y: 790.2 },
  { name: "Slater",      x: 712.1,  y: 547.2 },
  { name: "Malapert",    x: 606.0,  y: 296.5 },
  { name: "Scott",       x: 965.4,  y: 288.0 },
  { name: "Cabeus B",    x: 232.9,  y: 344.7 },
  { name: "Wiechert",    x: 692.4,  y: 928.4 },
  { name: "Kuhn",        x: 575.5,  y: 1042.2 },
  { name: "Ashbrook",    x: 125.0,  y: 810.2 },
  { name: "Hedervari",   x: 1089.3, y: 555.2 },
  { name: "Nefed'ev",    x: 1034.3, y: 965.4 },
];

export const GRATICULE_LABELS = [
  { name: "85°S",  x: 612.0,  y: 298.6  },
  { name: "87°S",  x: 612.0,  y: 420.0  },
  { name: "89°S",  x: 612.0,  y: 541.4  },
  { name: "0°E",   x: 590.0,  y: 20.0   },
  { name: "90°E",  x: 1157.0, y: 596.0  },
  { name: "180°E", x: 586.0,  y: 1197.0 },
  { name: "270°E", x: 20.0,   y: 596.0  },
];

// ── Mutable singleton buffers ───────────────────────────────────────────────
// These are live `let` bindings. Consumers should import them and access
// values directly. `loadMapData()` fills them in place.
export const PSR_MASK   = new Uint8Array(W * H);
export const RIDGE_MASK = new Uint8Array(W * H);
export let   TOTAL_PSR  = 0;

export const ILLUM_MAP       = new Float32Array(W * H);
export const ICE_DEPTH_MAP   = new Float32Array(W * H);
export const HYDROGEN_MAP    = new Float32Array(W * H);
export const TEMPERATURE_MAP = new Float32Array(W * H);
export const EARTH_VIS_MAP   = new Float32Array(W * H);
export const SLOPE_MAP       = new Float32Array(W * H);

export const PIXEL_CRATER = new Int16Array(W * H).fill(-1);
// CRATER_DATA is reassigned during load -- exported as `let` so imports see
// the live binding after `loadMapData` completes.
export let CRATER_DATA = [];

// Visual-only loaded image elements, key → HTMLImageElement.
export const LAYER_IMAGES = {};

// ── Geographic helpers ──────────────────────────────────────────────────────
// r_px ≈ 2 * R_moon * tan(co_lat / 2). Solve for latitude.
export const MAP_LAT_PROJ = (rPx) => {
  const R = 1737.4;
  const r_km = rPx * MAP_KM_PER_PX;
  const co_lat = 2 * Math.atan2(r_km, 2 * R);
  return -(90 - (co_lat * 180) / Math.PI);  // °S, returned as negative
};

export const pxToLatLon = (x, y) => {
  const dx = x - POLE_PX.x;
  const dy = y - POLE_PX.y;
  const r  = Math.sqrt(dx * dx + dy * dy);
  const lat = MAP_LAT_PROJ(r);
  // 0°E at +x, 90°E at +y, 180°E at -x, 270°E at -y.
  const lon = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
  return { lat, lon };
};

// ── Sampling helpers ────────────────────────────────────────────────────────
export function earthVisAt(x, y) {
  const xi = Math.max(0, Math.min(W - 1, Math.round(x)));
  const yi = Math.max(0, Math.min(H - 1, Math.round(y)));
  return EARTH_VIS_MAP[yi * W + xi] || 0;
}

export function isInCommsBlackout(x, y) {
  return earthVisAt(x, y) < COMMS_BLACKOUT_THRESHOLD;
}

// Effective DTE Earth visibility at (x, y) given an array of friendly
// comsats. Each comsat within COMSAT_RELAY_RADIUS adds COMSAT_COVERAGE_BOOST
// with linear falloff, capped at 1.0.
export function effectiveEarthVis(x, y, comsats) {
  let ev = earthVisAt(x, y);
  if (Array.isArray(comsats) && comsats.length > 0) {
    for (const c of comsats) {
      if (!c) continue;
      const d = Math.hypot(x - c.x, y - c.y);
      if (d < COMSAT_RELAY_RADIUS) {
        const k = 1 - d / COMSAT_RELAY_RADIUS;
        ev += COMSAT_COVERAGE_BOOST * k;
      }
    }
  }
  return Math.max(0, Math.min(1.0, ev));
}

export function isInCommsBlackoutFor(x, y, comsats) {
  return effectiveEarthVis(x, y, comsats) < COMMS_BLACKOUT_THRESHOLD;
}

// v106: relay coverage available to one actor, given whether the comms grid is
// shared. Independent comms = just the actor's own comsats; a shared comms grid
// pools both actors' comsats so each benefits from the other's relays. Pure so
// the live sim, the map overlay, and tests all agree.
export function pooledComsats(ownComsats, otherComsats, commsShared) {
  const own = Array.isArray(ownComsats) ? ownComsats : [];
  if (!commsShared) return own;
  const other = Array.isArray(otherComsats) ? otherComsats : [];
  return [...own, ...other];
}

// ── Loaders ─────────────────────────────────────────────────────────────────
export function pixLum(px, i) {
  return px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114;
}

export function loadImagePixels(src) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, W, H);
      LAYER_IMAGES[src] = img;
      resolve(ctx.getImageData(0, 0, W, H).data);
    };
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

// Crater extraction from the PSR mask: each connected component of "white"
// pixels (PSR-classified) is one crater for depletion tracking.
export function extractCratersFromPSR(psrPx) {
  // v51 note on the >128 threshold: the upstream `psr_mask_clean.png` has
  // had its baked graticule lines (which sat at luminance ~115) zeroed out
  // by scripts/clean_psr_mask.py. Real PSR pixels are >= 200, well above
  // the 128 split. The 128 threshold was originally chosen because it sits
  // safely between the graticule band and the PSR band in the dirty raster;
  // even with the cleaned input, keep it at 128 -- noise specks in the
  // 50-128 band exist from JPG compression of the original source and
  // should NOT be classified as PSR.
  //
  // If you ever want to lower this threshold (say, to pick up faint PSR
  // boundary pixels), make sure to verify against the cleaned mask
  // specifically -- on the legacy `psr_mask.jpg` a lowered threshold would
  // merge most south-polar PSRs into a single component via the graticule.
  const visited = new Uint8Array(W * H);
  const craters = [];
  const FG = (i) => pixLum(psrPx, i) > 128;  // bright = PSR

  for (let i = 0; i < W * H; i++) {
    if (visited[i] || !FG(i)) continue;
    const stack = [i];
    visited[i] = 1;
    const component = [];
    while (stack.length) {
      const idx = stack.pop();
      component.push(idx);
      const x = idx % W, y = (idx / W) | 0;
      if (x > 0     && !visited[idx - 1] && FG(idx - 1)) { visited[idx - 1] = 1; stack.push(idx - 1); }
      if (x < W - 1 && !visited[idx + 1] && FG(idx + 1)) { visited[idx + 1] = 1; stack.push(idx + 1); }
      if (y > 0     && !visited[idx - W] && FG(idx - W)) { visited[idx - W] = 1; stack.push(idx - W); }
      if (y < H - 1 && !visited[idx + W] && FG(idx + W)) { visited[idx + W] = 1; stack.push(idx + W); }
    }
    if (component.length < 6) continue;  // ignore noise specks

    let sumX = 0, sumY = 0;
    for (const idx of component) {
      sumX += idx % W;
      sumY += (idx / W) | 0;
    }
    const cx = Math.round(sumX / component.length);
    const cy = Math.round(sumY / component.length);

    // v69: mining anchor = the interior-most PSR pixel (the "PSR floor"),
    // i.e. the pixel with the largest inscribed radius before hitting the
    // shadow boundary. The previous "nearest the centroid" anchor still fell
    // near an edge on C-/kidney-shaped craters, and because a rover settles
    // ROVER_REACH short of its target it could end up just OUTSIDE the mask.
    // An interior anchor means a rover stopping short still lands on PSR, and
    // it matches the post's framing that the deep, cold crater FLOOR is the
    // ice target. (Derivation-only change; the map image assets are untouched.)
    const member = new Set(component);
    const RCAP = 16;  // bound the ring search; anything deeper is "deep enough"
    const interiorRadius = (idx) => {
      const px0 = idx % W, py0 = (idx / W) | 0;
      for (let r = 1; r <= RCAP; r++) {
        for (let o = -r; o <= r; o++) {
          // square ring at offset r: top, bottom, left, right edges
          if (!member.has((py0 - r) * W + (px0 + o))) return r - 1;
          if (!member.has((py0 + r) * W + (px0 + o))) return r - 1;
          if (!member.has((py0 + o) * W + (px0 - r))) return r - 1;
          if (!member.has((py0 + o) * W + (px0 + r))) return r - 1;
        }
      }
      return RCAP;
    };
    let bestPx = component[0], bestR = -1, bestD = Infinity;
    for (const idx of component) {
      const ir = interiorRadius(idx);
      if (ir > bestR) { bestR = ir; bestPx = idx; bestD = Infinity; }
      if (ir === bestR) {
        // tie-break: closest to centroid keeps the anchor central
        const px = idx % W, py = (idx / W) | 0;
        const d = (px - cx) ** 2 + (py - cy) ** 2;
        if (d < bestD) { bestD = d; bestPx = idx; }
      }
    }
    craters.push({
      cx, cy,
      mineX: bestPx % W,
      mineY: (bestPx / W) | 0,
      size: component.length,
      pixels: component,
    });
  }
  // Headline craters first.
  craters.sort((a, b) => b.size - a.size);
  return craters;
}

export async function loadMapData() {
  // v51: was loading MAP_LAYERS.sunlit_max -- the file underneath that key
  // used to be a single-instant LRO snapshot, not annual data, which made
  // ILLUM_MAP and the derived RIDGE_MASK semi-arbitrary. Now reads from
  // `annual_illum` directly. (The `sunlit_max` key still resolves to the
  // same file for backwards compat.)
  const [psrPx, illumPx, icePx, h2Px, tempPx, earthPx, slopePx] = await Promise.all([
    loadImagePixels(MAP_LAYERS.psr),
    loadImagePixels(MAP_LAYERS.annual_illum),
    loadImagePixels(MAP_LAYERS.ice_depth),
    loadImagePixels(MAP_LAYERS.water_hydrogen),
    loadImagePixels(MAP_LAYERS.temperature),
    loadImagePixels(MAP_LAYERS.earth_visibility),
    loadImagePixels(MAP_LAYERS.slope),
  ]);

  TOTAL_PSR = 0;
  for (let i = 0; i < W * H; i++) {
    if (pixLum(psrPx, i) > 128) {
      PSR_MASK[i] = 1;
      TOTAL_PSR++;
    }
  }

  for (let i = 0; i < W * H; i++) {
    ILLUM_MAP[i] = pixLum(illumPx, i) / 255;
  }

  // Ridge = top-quartile sustained sunlight (best solar siting).
  for (let i = 0; i < W * H; i++) {
    if (ILLUM_MAP[i] > 0.65) RIDGE_MASK[i] = 1;
  }

  // Slope source PNG is inverted (white = flat, black = steep). Convert
  // to degrees on a 0..30° scale (LRO LOLA polar slope standard).
  for (let i = 0; i < W * H; i++) {
    ICE_DEPTH_MAP[i]   = pixLum(icePx, i)   / 255;
    HYDROGEN_MAP[i]    = pixLum(h2Px, i)    / 255;
    TEMPERATURE_MAP[i] = pixLum(tempPx, i)  / 255;
    EARTH_VIS_MAP[i]   = pixLum(earthPx, i) / 255;
    SLOPE_MAP[i]       = ((255 - pixLum(slopePx, i)) / 255) * 30;
  }

  CRATER_DATA = extractCratersFromPSR(psrPx);
  PIXEL_CRATER.fill(-1);
  CRATER_DATA.forEach((c, ci) => {
    for (const px of c.pixels) PIXEL_CRATER[px] = ci;
  });

  // Quality: ice 50%, hydrogen 30%, coldness 20%. Renormalised so avg = 1.0.
  let qSum = 0, qCount = 0;
  for (const c of CRATER_DATA) {
    let ice = 0, h2 = 0, tcold = 0;
    for (const px of c.pixels) {
      ice += ICE_DEPTH_MAP[px];
      h2  += HYDROGEN_MAP[px];
      tcold += 1 - TEMPERATURE_MAP[px];
    }
    const n = c.pixels.length;
    c.meanIce      = ice / n;
    c.meanHydrogen = h2 / n;
    c.coldness     = tcold / n;
    const raw = c.meanIce * 0.5 + c.meanHydrogen * 0.3 + c.coldness * 0.2;
    c.quality = 0.25 + raw * 1.15;
    qSum += c.quality;
    qCount++;
  }
  const avgQ = qCount > 0 ? qSum / qCount : 1.0;
  for (const c of CRATER_DATA) {
    c.quality = c.quality / Math.max(0.01, avgQ);
  }

  // v70: derive the LFI / SOFI / IFI favorability rasters from the now-filled
  // terrain layers, so the three indices (and the RGB composite) can render as
  // toggleable map layers. Imported at runtime to avoid an import-order cycle.
  computeIndexRasters();
  // v125 (item 8): per-asset placement feasibility rasters, computed once from
  // the same static terrain so each buildable asset has a toggleable "where can
  // I put this" layer. Runtime import to avoid an import-order cycle.
  const { computeFeasibilityRasters } = await import("./feasibility.js");
  computeFeasibilityRasters();

  // Pre-warm visual-only layer images (fire-and-forget).
  for (const [, src] of Object.entries(MAP_LAYERS)) {
    if (!LAYER_IMAGES[src]) {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { LAYER_IMAGES[src] = img; };
      img.src = src;
    }
  }
}
