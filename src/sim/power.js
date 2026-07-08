// ── Daily power allocation ──────────────────────────────────────────────────
//
// Each generator (panel or reactor) routes its output to the lowest-power
// in-range consumer (rover or habitat), with first-seen tie-breaks so
// recipients don't ping-pong between charging sources. With `sharedGrid`,
// both players share one allocation pass; otherwise each player runs
// independently.

import {
  W, H, POWER_CAP, HABITAT_POWER_CAP, HABITAT_POWER_INIT,
  HABITAT_POWER_DRAIN, REACTOR_OUTPUT, PANEL_RIDGE, SAFETY_RADIUS,
} from "./constants.js";
import { ILLUM_MAP } from "./mapData.js";
import { dist, isNight } from "./utils.js";

export function getGeneratorOutput(generator, night) {
  if (generator.kind === "solar" && night) return 0;
  const px = Math.round(generator.y) * W + Math.round(generator.x);
  const illum = (px >= 0 && px < W * H) ? ILLUM_MAP[px] : 1.0;
  return generator.kind === "reactor" ? REACTOR_OUTPUT : PANEL_RIDGE * illum;
}

export function allocateDailyPower(players, globalDay, sharedGrid = false) {
  const night = isNight(globalDay);

  const states = players.map((player, idx) => {
    if (!player || player.active === false || globalDay < (player.arrivalDay ?? 0)) return null;
    return {
      playerId: idx + 1,
      player: { ...player },
      habitatPower: [...(player.habitatPower || (player.habitats || []).map(() => HABITAT_POWER_INIT))],
      extraRovers:  [...(player.extraRovers || [])],
      structureHealth: {
        panels:      [...(player.structureHealth?.panels      || (player.panels      || []).map(() => 1.0))],
        reactors:    [...(player.structureHealth?.reactors    || (player.reactors    || []).map(() => 1.0))],
        habitats:    [...(player.structureHealth?.habitats    || (player.habitats    || []).map(() => 1.0))],
        extraRovers: [...(player.structureHealth?.extraRovers || (player.extraRovers || []).map(() => 1.0))],
        landingPads: [...(player.structureHealth?.landingPads || (player.landingPads || []).map(() => 1.0))],
      },
      generatorRangeEntries:      { ...(player.generatorRangeEntries || {}) },
      generatorSupplyTotals:      { ...(player.generatorSupplyTotals || {}) },
      generatorSupplyByRecipient: {
        1: player.generatorSupplyByRecipient?.[1] || 0,
        2: player.generatorSupplyByRecipient?.[2] || 0,
      },
    };
  });

  // Run allocation across one network of states (one shared grid, or just
  // one player at a time).
  const allocateNetwork = (networkStates, networkTargets) => {
    const generators = networkStates.flatMap((state) => [
      ...(state.player.panels   || []).map((panel,   idx) => ({ ...panel,   kind: "solar",   idx, owner: state })),
      ...(state.player.reactors || []).map((reactor, idx) => ({ ...reactor, kind: "reactor", idx, owner: state })),
    ]);

    for (const generator of generators) {
      const healthKey = generator.kind === "reactor" ? "reactors" : "panels";
      if ((generator.owner.structureHealth[healthKey]?.[generator.idx] ?? 1.0) <= 0) continue;

      const output = getGeneratorOutput(generator, night);
      if (output <= 0) continue;

      const generatorId = `${generator.kind}-${generator.idx}`;
      const previousEntries = { ...(generator.owner.generatorRangeEntries[generatorId] || {}) };
      const currentEntries = {};
      const candidates = [];

      for (const target of networkTargets) {
        if (target.destroyed) continue;
        if (dist(generator, target) > SAFETY_RADIUS[generator.kind]) continue;

        const firstSeen = previousEntries[target.id] ?? globalDay;
        currentEntries[target.id] = firstSeen;

        const currentPower = target.getPower();
        if (currentPower >= target.capacity) continue;
        candidates.push({ target, currentPower, firstSeen });
      }

      generator.owner.generatorRangeEntries[generatorId] = currentEntries;
      if (!candidates.length) continue;

      // Lowest power first, then earliest-seen, then id (stable).
      candidates.sort((a, b) =>
        a.currentPower - b.currentPower
        || a.firstSeen - b.firstSeen
        || a.target.id.localeCompare(b.target.id)
      );

      const chosen = candidates[0];
      const supplied = Math.min(output, Math.max(0, chosen.target.capacity - chosen.currentPower));
      chosen.target.setPower(Math.min(chosen.target.capacity, chosen.currentPower + supplied));
      generator.owner.generatorSupplyTotals[generatorId] = (generator.owner.generatorSupplyTotals[generatorId] || 0) + supplied;
      const recipientId = Number(
        String(chosen.target.id || "").match(/^p(\d+)-/)?.[1] || generator.owner.playerId
      );
      generator.owner.generatorSupplyByRecipient[recipientId] =
        (generator.owner.generatorSupplyByRecipient[recipientId] || 0) + supplied;
    }
  };

  const buildTargets = (networkStates) =>
    networkStates.flatMap((state) => [
      {
        id: `p${state.playerId}-rover-primary`,
        x: state.player.x,
        y: state.player.y,
        capacity: POWER_CAP,
        getPower: () => state.player.power ?? 0,
        setPower: (value) => { state.player.power = value; },
      },
      ...state.extraRovers.map((rover, idx) => ({
        id: `p${state.playerId}-rover-extra-${idx}`,
        x: rover.x,
        y: rover.y,
        capacity: POWER_CAP,
        // v27: a destroyed extra rover (health ≤ 0) shouldn't receive power.
        // Without this gate, generators would still route to a dead rover,
        // wasting their daily output. Primary rover has no such gate
        // because its health is unread (see applyDecay comment in App.jsx).
        destroyed: (state.structureHealth.extraRovers[idx] ?? 1.0) <= 0,
        getPower: () => state.extraRovers[idx].power ?? POWER_CAP,
        setPower: (value) => { state.extraRovers[idx] = { ...state.extraRovers[idx], power: value }; },
      })),
      ...(state.player.habitats || []).map((habitat, idx) => ({
        id: `p${state.playerId}-habitat-${idx}`,
        x: habitat.x,
        y: habitat.y,
        capacity: HABITAT_POWER_CAP,
        destroyed: (state.structureHealth.habitats[idx] ?? 1.0) <= 0,
        getPower: () => state.habitatPower[idx] ?? HABITAT_POWER_INIT,
        setPower: (value) => { state.habitatPower[idx] = value; },
      })),
    ]);

  if (sharedGrid) {
    const activeStates = states.filter(Boolean);
    allocateNetwork(activeStates, buildTargets(activeStates));
  } else {
    states.forEach((state) => {
      if (!state) return;
      allocateNetwork([state], buildTargets([state]));
    });
  }

  // Daily habitat drain (after charging).
  states.forEach((state) => {
    if (!state) return;
    for (let i = 0; i < (state.player.habitats || []).length; i++) {
      if ((state.structureHealth.habitats[i] ?? 1.0) <= 0) continue;
      state.habitatPower[i] = Math.max(
        0,
        Math.min(HABITAT_POWER_CAP, (state.habitatPower[i] ?? HABITAT_POWER_INIT) - HABITAT_POWER_DRAIN)
      );
    }
  });

  return states.map((state, idx) => {
    if (!state) return players[idx];
    return {
      ...state.player,
      habitatPower:               state.habitatPower,
      extraRovers:                state.extraRovers,
      generatorRangeEntries:      state.generatorRangeEntries,
      generatorSupplyTotals:      state.generatorSupplyTotals,
      generatorSupplyByRecipient: state.generatorSupplyByRecipient,
    };
  });
}
