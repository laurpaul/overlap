// ── Pure player-state helpers ───────────────────────────────────────────────
//
// Extracted from App.jsx (v107) so this logic can be unit-tested in Node and
// reused without dragging in React. All four functions are pure: no component
// state, no closures over outer variables, no DOM.
//
//   makeSeededRng    deterministic PRNG (mulberry32) for reproducible runs
//   isMapDepleted    has every crater fallen below the end-of-mission floor?
//   clonePlayerState deep-ish clone of a player so saved / undo / replay
//                    snapshots can't bleed mutations back into live state
//   structureCounts  per-type asset tally for summaries and exports

import { DEPLETION_END_THRESHOLD } from "./constants.js";
import { DEFAULT_PRESET_KEY } from "./economy.js";

// Deterministic PRNG (mulberry32). Same seed -> same sequence, so batch /
// replay runs are reproducible.
export function makeSeededRng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// True once every crater has been mined below the end-of-mission threshold.
export function isMapDepleted(ch) {
  if (!ch) return false;
  for (let i = 0; i < ch.length; i++) {
    if ((ch[i] ?? 0) > DEPLETION_END_THRESHOLD) return false;
  }
  return true;
}

// Deep-clone the mutable parts of a player object. The outer spread copies
// scalars; every array / nested object that downstream code might mutate in
// place is explicitly re-cloned so a saved, undone, or replayed state can never
// bleed back into the live one.
//
// History note: comsats were silently dropped before v27 because the clone
// enumerated structureHealth keys explicitly. The fix (kept here) spreads the
// existing structureHealth first as an "everything else verbatim" catch-all,
// then re-clones the known arrays. New structureHealth keys carry through
// automatically without a clone-function edit.
export function clonePlayerState(player) {
  if (!player) return null;
  return {
    ...player,
    base: player.base ? { ...player.base } : player.base,
    panels: (player.panels || []).map(p => ({ ...p })),
    reactors: (player.reactors || []).map(r => ({ ...r })),
    habitats: (player.habitats || []).map(h => ({ ...h })),
    habitatPower: [...(player.habitatPower || [])],
    extraRovers: (player.extraRovers || []).map(r => ({ ...r, waypoints: (r.waypoints || []).map(w => ({ ...w })) })),
    landingPads: (player.landingPads || []).map(p => ({ ...p })),
    comsats: (player.comsats || []).map(c => ({ ...c })),
    pendingDeliveries: (player.pendingDeliveries || []).map(d => ({ ...d, target: d.target ? { ...d.target } : d.target })),
    carrying: player.carrying ? { ...player.carrying, target: player.carrying.target ? { ...player.carrying.target } : player.carrying.target } : null,
    structureHealth: {
      ...(player.structureHealth || {}),
      panels: [...(player.structureHealth?.panels || [])],
      reactors: [...(player.structureHealth?.reactors || [])],
      habitats: [...(player.structureHealth?.habitats || [])],
      primaryRover: [...(player.structureHealth?.primaryRover || [1.0])],
      extraRovers: [...(player.structureHealth?.extraRovers || [])],
      landingPads: [...(player.structureHealth?.landingPads || [])],
      comsats: [...(player.structureHealth?.comsats || [])],
    },
    waypoints: (player.waypoints || []).map(w => ({ ...w })),
    currentWaypoint: player.currentWaypoint ? { ...player.currentWaypoint } : null,
    mineMap: { ...(player.mineMap || {}) },
    depositLog: [...(player.depositLog || [])],
    alloc: { ...(player.alloc || {}) },
    allocPreset: player.allocPreset || DEFAULT_PRESET_KEY,
    generatorRangeEntries: JSON.parse(JSON.stringify(player.generatorRangeEntries || {})),
    generatorSupplyTotals: { ...(player.generatorSupplyTotals || {}) },
    generatorSupplyByRecipient: { 1: player.generatorSupplyByRecipient?.[1] || 0, 2: player.generatorSupplyByRecipient?.[2] || 0 },
    botMemory: player.botMemory ? JSON.parse(JSON.stringify(player.botMemory)) : undefined,
  };
}

// Per-type asset counts. Rovers = primary + extras.
export function structureCounts(player) {
  return player ? {
    habitats: (player.habitats || []).length,
    panels: (player.panels || []).length,
    reactors: (player.reactors || []).length,
    rovers: 1 + (player.extraRovers || []).length,
    pads: (player.landingPads || []).length,
  } : { habitats: 0, panels: 0, reactors: 0, rovers: 0, pads: 0 };
}

// ── Facilitator god-mode asset grant / remove (v161) ────────────────────────
//
// Pure transforms used by the facilitator's direct asset controls. Extracted so
// the asset-array ↔ structureHealth-array invariant (the off-by-one class of bug
// that bit rover health in v140) is unit-tested, not just eyeballed in App.jsx.
//
// `ASSET_ARRAY` maps a build type to its player-state array; structureHealth
// uses the same key. assetPts/ASSET_POINTS are passed in by the caller (App owns
// the constants) so this module stays free of game-balance imports.

export const GOD_ASSET_ARRAY = {
  solar: "panels", reactor: "reactors", habitat: "habitats",
  pad: "landingPads", rover: "extraRovers",
};

// Grant one asset of `type` to `player` at (x,y). `assetPts` is the score points
// that asset is worth (added to player.assetPts). `habitatInit` seeds
// habitatPower for a habitat. Returns a NEW player; never mutates the input.
export function grantAssetToPlayer(player, type, { x, y, seq, onRidge = false, assetPts = 0, habitatInit = 0, roverPower = 100 } = {}) {
  if (!player) return player;
  const arrKey = GOD_ASSET_ARRAY[type];
  if (!arrKey) return player;
  const sh = { ...(player.structureHealth || {}) };
  const next = { ...player, assetPts: (player.assetPts ?? 0) + assetPts };
  const health = [...(sh[arrKey] || (player[arrKey] || []).map(() => 1.0)), 1.0];
  if (type === "rover") {
    next.extraRovers = [...(player.extraRovers || []), { x, y, waypoints: [], currentWaypoint: null, ice: 0, carrying: null, status: "idle", power: roverPower, seq }];
  } else if (type === "solar") {
    next.panels = [...(player.panels || []), { x, y, onRidge, seq }];
  } else if (type === "reactor") {
    next.reactors = [...(player.reactors || []), { x, y, seq }];
  } else if (type === "habitat") {
    next.habitats = [...(player.habitats || []), { x, y, seq }];
    next.habitatPower = [...(player.habitatPower || []), habitatInit];
  } else if (type === "pad") {
    next.landingPads = [...(player.landingPads || []), { x, y, seq }];
  }
  next.structureHealth = { ...sh, [arrKey]: health };
  return next;
}

// Remove the LAST asset of array `kind` (e.g. "habitats"). `assetPts` is the
// points to claw back. Returns a NEW player; no-op (returns input) if empty.
export function removeLastAsset(player, kind, { assetPts = 0 } = {}) {
  if (!player) return player;
  const list = player[kind] || [];
  if (list.length === 0) return player;
  const sh = { ...(player.structureHealth || {}) };
  const next = { ...player, [kind]: list.slice(0, -1), assetPts: Math.max(0, (player.assetPts ?? 0) - assetPts) };
  if (sh[kind]) next.structureHealth = { ...sh, [kind]: sh[kind].slice(0, -1) };
  if (kind === "habitats" && player.habitatPower) next.habitatPower = player.habitatPower.slice(0, -1);
  return next;
}

// ── Facilitator maintenance transforms (v163) ───────────────────────────────
//
// Pure "reset" helpers for the god-mode panel: wipe a player's accrued safety
// violations, repair every asset to full health, and top up all stored power.
// Used to recover table state between scenarios or after a punishing round. All
// pure; never mutate the input.

export function clearViolations(player) {
  if (!player) return player;
  return { ...player, safetyViolations: 0 };
}

// Rebuild every structureHealth array from the matching asset array at full
// health, so counts can never drift out of alignment (the v140 class of bug),
// and restore any other tracked health field (e.g. primaryRover) to 1.0.
export function repairAllAssets(player) {
  if (!player) return player;
  const sh = { ...(player.structureHealth || {}) };
  const ARR = ["panels", "reactors", "habitats", "landingPads", "extraRovers", "comsats"];
  for (const key of ARR) {
    const len = (player[key] || []).length;
    if (len > 0) sh[key] = new Array(len).fill(1.0);
  }
  for (const key of Object.keys(sh)) {
    if (!ARR.includes(key)) sh[key] = (sh[key] || []).map(() => 1.0);
  }
  return { ...player, structureHealth: sh };
}

// Top up stored power: primary rover, every extra rover, and every habitat.
export function rechargeAll(player, { roverPower = 100, habitatPower = 80 } = {}) {
  if (!player) return player;
  const next = { ...player, power: roverPower };
  next.extraRovers = (player.extraRovers || []).map((er) => (er ? { ...er, power: roverPower } : er));
  if ((player.habitats || []).length) {
    next.habitatPower = player.habitats.map(() => habitatPower);
  }
  return next;
}

// Count a player's still-functional landing pads (health above the destroyed
// floor). Drives the v164 pad benefits: equipment cost discount and dust
// mitigation scale with how many working pads an actor operates.
export function functionalPadCount(player) {
  if (!player) return 0;
  const sh = player.structureHealth?.landingPads;
  return (player.landingPads || []).reduce(
    (n, _p, i) => n + ((sh?.[i] ?? 1.0) > 0.1 ? 1 : 0),
    0
  );
}
