// ── Orbit / disposal layer (roadmap) ────────────────────────────────────────
//
// A first, pure foundation for the second board: objects in lunar orbit, their
// ground projection onto the surface map, end-of-life disposal (graveyard vs
// crash), the surface keep-out a crash leaves behind, and an ejecta-to-orbit
// coupling. Kept deliberately separate from the React/render layer so the
// mechanics are testable in isolation; the UI overlay and the wiring into the
// satellite_disposal inject and the strategic-reserve scenario are the next
// increments.
//
// PHYSICAL NUMBERS ARE PLACEHOLDERS pending calibration against published
// lunar-ejecta / dust-transport work (e.g. Metzger et al.). They are tuned for
// legible game behavior, not survey accuracy, and are isolated in ORBIT_TUNING
// so a real calibration is a one-place edit. Nothing here asserts a sourced
// figure.

import { W, H, PIXELS_PER_KM } from "./constants.js";

export const ORBIT_TUNING = {
  // Altitude bands (km). Operational orbits sit low; the graveyard band is the
  // safe disposal shelf above the operational regime.
  bands: {
    low:       { label: "Low operational",  altKm: 50  },
    high:      { label: "High operational", altKm: 200 },
    graveyard: { label: "Graveyard",        altKm: 500 },
  },
  // A crash's surface debris keep-out radius (km) = base + scatter * mass(t).
  // Placeholder scaling; the real relationship needs ejecta-model calibration.
  crashDebrisBaseKm:   2.0,
  crashDebrisPerTonKm: 1.5,
  // Fraction of a surface event's energy that lofts material to orbit
  // (ejecta-to-orbit coupling). Placeholder.
  ejectaToOrbitCoupling: 0.04,
  // A lofted-debris cloud in orbit decays (re-impacts / disperses) over this
  // many rounds.
  orbitalDebrisDecayRounds: 6,
};

let _nextId = 1;
function nextId() { return `orb_${_nextId++}`; }
export function _resetOrbitIds() { _nextId = 1; } // test hook

const clampX = (v) => Math.max(0, Math.min(W - 1, v));
const clampY = (v) => Math.max(0, Math.min(H - 1, v));

// Create an orbital object. groundX/groundY is where it currently projects onto
// the surface map (its sub-lunar point), in pixels.
export function makeOrbitalObject({ owner, kind = "comsat", band = "low", massT = 1, groundX = W / 2, groundY = H / 2 }) {
  return {
    id: nextId(),
    owner,                 // player index (0/1) or null
    kind,                  // "comsat" | "debris" | "reserve_depot"
    band,                  // key into ORBIT_TUNING.bands
    massT,                 // tonnes
    groundX: clampX(groundX),
    groundY: clampY(groundY),
    decayRounds: null,     // set for transient debris clouds
    disposed: false,
  };
}

// Disposal decision for an end-of-life object.
//
//  mode "graveyard": boost to the graveyard band. Clean: no surface keep-out.
//  mode "crash":     de-orbit onto a surface target, leaving a debris keep-out
//                    zone {x,y,r} and (optionally) lofting an ejecta cloud back
//                    to orbit. targetX/targetY default to the sub-lunar point.
//
// Returns { object, surfaceZone, ejectaCloud } where surfaceZone is null for a
// graveyard disposal. Pure: returns new objects, does not mutate input.
export function disposeOrbitalObject(obj, { mode, targetX, targetY } = {}) {
  if (mode === "graveyard") {
    return {
      object: { ...obj, band: "graveyard", disposed: true },
      surfaceZone: null,
      ejectaCloud: null,
    };
  }
  // crash
  const tx = clampX(targetX ?? obj.groundX);
  const ty = clampY(targetY ?? obj.groundY);
  const rKm = ORBIT_TUNING.crashDebrisBaseKm + ORBIT_TUNING.crashDebrisPerTonKm * Math.max(0, obj.massT);
  const surfaceZone = { x: tx, y: ty, r: rKm * PIXELS_PER_KM, kind: "crash_debris", owner: obj.owner };
  // Ejecta lofted back to orbit, as a decaying debris cloud over the impact.
  const lofted = ORBIT_TUNING.ejectaToOrbitCoupling * Math.max(0, obj.massT);
  const ejectaCloud = lofted > 0
    ? { ...makeOrbitalObject({ owner: obj.owner, kind: "debris", band: "low", massT: lofted, groundX: tx, groundY: ty }),
        decayRounds: ORBIT_TUNING.orbitalDebrisDecayRounds }
    : null;
  return {
    object: { ...obj, disposed: true, kind: "debris" },
    surfaceZone,
    ejectaCloud,
  };
}

// Loft surface ejecta to orbit from a surface event of the given energy proxy
// (e.g. a heavy landing or a crash). Returns an orbital debris cloud or null.
export function loftEjectaToOrbit({ owner, x, y, energyT }) {
  const lofted = ORBIT_TUNING.ejectaToOrbitCoupling * Math.max(0, energyT || 0);
  if (lofted <= 0) return null;
  return {
    ...makeOrbitalObject({ owner, kind: "debris", band: "low", massT: lofted, groundX: x, groundY: y }),
    decayRounds: ORBIT_TUNING.orbitalDebrisDecayRounds,
  };
}

// Advance transient orbital debris one round; drop fully-decayed clouds.
// Returns a new array (pure).
export function tickOrbitalObjects(objects) {
  return (objects || [])
    .map((o) => (o.decayRounds == null ? o : { ...o, decayRounds: o.decayRounds - 1 }))
    .filter((o) => o.decayRounds == null || o.decayRounds > 0);
}

// All surface keep-out zones currently projected by orbital objects (only crash
// debris projects a surface footprint; operational sats do not). Reuses the
// {x,y,r} zone shape so the existing pointInAnyZone / violation machinery can
// consume it when this layer is wired in.
export function orbitalSurfaceZones(objects) {
  return (objects || [])
    .filter((o) => o.kind === "debris" && o.decayRounds != null)
    .map((o) => ({
      x: o.groundX, y: o.groundY,
      r: (ORBIT_TUNING.crashDebrisBaseKm + ORBIT_TUNING.crashDebrisPerTonKm * Math.max(0, o.massT)) * PIXELS_PER_KM,
      kind: "orbital_debris", owner: o.owner,
    }));
}

// v203 (roadmap orbit item b): operating inside a crash-debris keep-out costs
// score. Counts how many of an actor's surface assets currently sit inside any
// debris zone ({x,y,r}); the caller charges each as a safety violation at
// round end. Pure; owner is NOT exempt, a polluter operating in its own
// debris pays too (the externality is physical, not legal).
export function debrisViolationCount(zones, player) {
  if (!zones || !zones.length || !player) return 0;
  const pts = [];
  const push = (a) => { if (a && Number.isFinite(a.x) && Number.isFinite(a.y)) pts.push(a); };
  for (const key of ["panels", "habitats", "reactors", "landingPads", "extraRovers"]) {
    for (const a of (player[key] || [])) push(a);
  }
  if (Number.isFinite(player.x) && Number.isFinite(player.y)) push({ x: player.x, y: player.y });
  let n = 0;
  for (const p of pts) {
    for (const z of zones) {
      const dx = p.x - z.x, dy = p.y - z.y;
      if (dx * dx + dy * dy <= z.r * z.r) { n += 1; break; } // one charge per asset
    }
  }
  return n;
}
