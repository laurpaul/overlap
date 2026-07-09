// ── Scenario presets ────────────────────────────────────────────────────────
//
// The scenario list used by the settings screen, lifted out of App.jsx so the
// data lives in one tested place instead of an inline JSX array. Each preset
// carries the time / economy / physics knobs the UI already consumed (id,
// label, desc, rounds, overrides), plus an optional `seedLayout`: a pre-built
// initial-asset layout dropped in at base placement.
//
// The NASA Phase 1 preset closes a long-standing README TODO. It seeds an
// base-camp style footprint around each actor's chosen base: a
// foundation habitat at the center, a fission surface-power reactor and two
// CLPS / HLS landing pads kept off at plume distance, two solar arrays, two
// field rovers (VIPER + LTV alongside the primary pressurized rover), and a
// communications relay (the orbital relay / CAPSTONE abstraction). It is the
// first preset that varies the starting layout rather than only the clock.
//
// Framework-free: no DOM, no React. `seedPlayerLayout` is pure and validated in
// tests/scenarioPresets.test.js.

import { PIXELS_PER_KM, W, H, HABITAT_POWER_INIT, POWER_CAP, ASSET_POINTS } from "./constants.js";

// Offsets are in kilometres from the actor's base; converted to pixels with the
// sim's own scale. Kept within ~10 km so the footprint stays a cluster around
// the base, with the reactor and pads deliberately offset from the habitat to
// model plume / radiation standoff (and to seed real safety-zone tension).
export const PHASE1_LAYOUT = {
  id: "artemis-base-camp",
  label: "Concordium Base Camp (Phase 1)",
  assets: [
    { type: "habitat", dxKm: 0,  dyKm: 0,  note: "Foundation Surface Habitat" },
    { type: "reactor", dxKm: 6,  dyKm: -3, note: "Fission Surface Power, standoff from habitat" },
    { type: "pad",     dxKm: -7, dyKm: 4,  note: "CLPS landing pad" },
    { type: "pad",     dxKm: 8,  dyKm: 6,  note: "HLS landing zone" },
    { type: "solar",   dxKm: -4, dyKm: -6, note: "Solar array (ridge-seeking)" },
    { type: "solar",   dxKm: -6, dyKm: -4, note: "Solar array (ridge-seeking)" },
    { type: "rover",   dxKm: 3,  dyKm: 5,  note: "VIPER prospecting rover" },
    { type: "rover",   dxKm: -3, dyKm: 6,  note: "LTV unpressurized rover" },
    { type: "comsat",  dxKm: 2,  dyKm: -2, note: "Surface relay (orbital relay abstraction)" },
  ],
};

// ── Terrestrial governance analogues ────────────────────────────────────────
//
// Two scenario templates that port real terrestrial resource-governance regimes
// onto the lunar south pole, so a workshop can run the same map under different
// rule philosophies and compare outcomes. Each carries a `governance` block
// (analogue, premise, the tabletop framing) alongside the usual time/economy
// knobs, and maps its real-world logic onto mechanics the sim already has.
//
// ATCM, Antarctic Treaty Consultative Meeting. Consensus decision-making,
// sovereignty claims set aside, environmental protection and mutual inspection
// over competition. Mapped to a no-interference regime (like the cooperative
// preset) on a longer horizon that gives the consensus/inspection rhythm room,
// framed as the Antarctic tabletop: actors deconflict by agreement, not force.
//
// ITU, International Telecommunication Union radio-regulation logic.
// First-come-first-served registration of a footprint, plus MANDATORY
// coordination between operators whose zones would interfere before either may
// proceed. Interference is left ON (overlapping keep-out zones are the whole
// point), mapped onto the sim's existing safety-zone notification and comms-grid
// coordination. The hazard framework's "coordination zone" is itself ITU-derived
// language, so this analogue ties the two together.
export const GOVERNANCE_ANALOGUES = {
  atcm: {
    analogue: "Antarctic Treaty Consultative Meeting (ATCM)",
    premise: "Consensus governance; sovereignty claims set aside; environmental protection and mutual inspection over competition.",
    tabletop: "Actors deconflict by agreement. No interference is permitted; a breach is resolved by consultation, not force. Cooperation (shared grids, notified zones) is the expected default, and the debrief asks whether consensus held under resource pressure.",
  },
  itu: {
    analogue: "ITU radio-regulation coordination",
    premise: "First-come-first-served registration of a footprint, with mandatory coordination between operators whose zones would interfere.",
    tabletop: "The first actor to register a zone holds priority; a later actor whose keep-out zone would overlap must coordinate (notify and reach agreement) before proceeding. Interference is real and scored, so the discipline is registration order and coordination, mirroring how spectrum and orbital slots are deconflicted on Earth.",
  },
};

// v131 (roadmap): scenario briefings that reframe the objective rather than the
// governance rules. Same shape as GOVERNANCE_ANALOGUES so the settings panel can
// render either through one code path.
export const SCENARIO_BRIEFINGS = {
  strategic_reserve: {
    analogue: "Strategic reserve (ice / propellant)",
    premise: "The objective is not to cash out ice fastest but to build and hold a strategic reserve of water or propellant over a long horizon.",
    tabletop: "Actors are briefed that holding a reserve, not immediate deposit, is the prize: stockpiled and in-transit ice carries weight, and the long horizon rewards patient accumulation over a quick grab. An orbital reserve dimension (propellant cached in orbit) is intended but waits on the orbit / disposal layer; for now the reserve is the surface-and-transit stockpile. The debrief asks who built durable reserve capacity versus who spent it down.",
  },
};

export const SCENARIO_PRESETS = [
  { id: "standard",      label: "Standard Allotment", desc: "Default governance · 12 rounds · balanced economy",         rounds: 12 },
  { id: "longhaul",      label: "Long Horizon",       desc: "20 rounds · long-run crater depletion dynamics",            rounds: 20 },
  { id: "sprint",        label: "First-Mover Test",   desc: "4 rounds · early-arrival advantage focus",                  rounds: 4 },
  { id: "unevenArrival", label: "Asymmetric Arrival", desc: "20 rounds · delayed Actor II deployment",                   rounds: 20 },
  { id: "nocombat",      label: "Cooperative Regime", desc: "No interference · pure ISRU optimization",                  rounds: 12, overrides: { HOSTILE_DECAY: 0, MIL_DAMAGE_SCALE: 0 } },
  { id: "nasaPhase1",    label: "Concordium Phase 1", desc: "Concordium Base Camp · pre-built starting footprint",      rounds: 12, seedLayout: PHASE1_LAYOUT },
  // Terrestrial governance analogues (see GOVERNANCE_ANALOGUES above).
  { id: "atcm",          label: "Antarctic Treaty (ATCM)", desc: "Consensus · no interference · inspection regime · 16 rounds", rounds: 16, overrides: { HOSTILE_DECAY: 0, MIL_DAMAGE_SCALE: 0 }, governance: GOVERNANCE_ANALOGUES.atcm },
  { id: "itu",           label: "ITU Coordination",        desc: "First-come registration · coordinate overlapping zones · 12 rounds", rounds: 12, governance: GOVERNANCE_ANALOGUES.itu },
  // v131: strategic-reserve scenario. Long horizon, reserve-holding objective.
  // v212: the reserve is now MECHANICAL, not just a briefing, the July 6
  // battery proved this preset ran byte-identical to Long Horizon. Under the
  // regime, RESERVE_ESCROW_FRAC of every deposit is sequestered into a
  // strategic reserve ledger (player.reserveKg) instead of the market ledger;
  // reserve kilograms score at ×RESERVE_END_MULT (economy.js), patience pays,
  // but the escrowed share is worth nothing until it does.
  { id: "strategic_reserve", label: "Strategic Reserve", desc: "Hold ice / propellant as a reserve · 20-round patient accumulation · 25% of every deposit escrowed, reserve scores ×1.5", rounds: 20, governance: SCENARIO_BRIEFINGS.strategic_reserve, overrides: { RESERVE_ESCROW_FRAC: 0.25 } },
];

export const DEFAULT_SCENARIO = "standard";

export function getScenarioPreset(id) {
  return SCENARIO_PRESETS.find((s) => s.id === id) || null;
}

const clampPx = (v, max) => Math.max(4, Math.min(max - 4, Math.round(v)));

// Seed a freshly-made player with a starting layout. Pure: returns a new player
// object with the layout's assets appended, mirroring exactly the state shape
// the live placement paths in App.jsx produce (arrays + index-matched
// structureHealth, habitatPower for habitats, full power for rovers, and
// accumulated assetPts). Seeded assets are free (they model a mission that is
// already on the surface at start), so budget is untouched.
//
//   player   the result of makePlayer(base, ...)
//   layout   one of the PHASE*_LAYOUT objects (or { assets: [...] })
//   base     { x, y } in pixels (the player's base)
//   opts.ridgeAt(x, y) -> bool   optional; tags solar panels on a ridge
//   opts.pixelsPerKm             optional scale override (defaults to sim scale)
export function seedPlayerLayout(player, layout, base, opts = {}) {
  if (!player || !layout?.assets?.length) return player;
  const ppk = opts.pixelsPerKm ?? PIXELS_PER_KM;
  const ridgeAt = typeof opts.ridgeAt === "function" ? opts.ridgeAt : () => false;

  const p = {
    ...player,
    panels: [...(player.panels || [])],
    reactors: [...(player.reactors || [])],
    habitats: [...(player.habitats || [])],
    habitatPower: [...(player.habitatPower || [])],
    extraRovers: [...(player.extraRovers || [])],
    landingPads: [...(player.landingPads || [])],
    comsats: [...(player.comsats || [])],
    structureHealth: {
      panels: [...(player.structureHealth?.panels || [])],
      reactors: [...(player.structureHealth?.reactors || [])],
      habitats: [...(player.structureHealth?.habitats || [])],
      extraRovers: [...(player.structureHealth?.extraRovers || [])],
      landingPads: [...(player.structureHealth?.landingPads || [])],
      comsats: [...(player.structureHealth?.comsats || [])],
    },
    assetPts: player.assetPts ?? 0,
  };

  for (const a of layout.assets) {
    const x = clampPx(base.x + a.dxKm * ppk, W);
    const y = clampPx(base.y + a.dyKm * ppk, H);
    const at = { x, y };
    const pts = ASSET_POINTS[a.type] ?? 0;
    switch (a.type) {
      case "habitat":
        p.habitats.push(at);
        p.habitatPower.push(HABITAT_POWER_INIT);
        p.structureHealth.habitats.push(1.0);
        break;
      case "reactor":
        p.reactors.push(at);
        p.structureHealth.reactors.push(1.0);
        break;
      case "pad":
        p.landingPads.push(at);
        p.structureHealth.landingPads.push(1.0);
        break;
      case "solar":
        p.panels.push({ x, y, onRidge: !!ridgeAt(x, y) });
        p.structureHealth.panels.push(1.0);
        break;
      case "comsat":
        p.comsats.push(at);
        p.structureHealth.comsats.push(1.0);
        break;
      case "rover":
        p.extraRovers.push({ x, y, waypoints: [], currentWaypoint: null, ice: 0, carrying: null, status: "idle", power: POWER_CAP });
        p.structureHealth.extraRovers.push(1.0);
        break;
      default:
        continue;
    }
    p.assetPts += pts;
  }
  return p;
}
