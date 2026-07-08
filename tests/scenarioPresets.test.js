// Scenario preset tests. Validate the preset table and that the NASA Phase 1
// layout seeds a player into exactly the asset-state shape the live placement
// paths produce (arrays + index-matched structureHealth, habitatPower, rover
// fields, accumulated assetPts). Pure, no DOM.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SCENARIO_PRESETS, PHASE1_LAYOUT, DEFAULT_SCENARIO, GOVERNANCE_ANALOGUES, SCENARIO_BRIEFINGS,
  getScenarioPreset, seedPlayerLayout,
} from "../src/sim/scenarioPresets.js";
import { makePlayer } from "../src/sim/economy.js";
import { ASSET_POINTS, HABITAT_POWER_INIT, POWER_CAP, W, H } from "../src/sim/constants.js";

test("preset table keeps the original five and adds NASA Phase 1", () => {
  const ids = SCENARIO_PRESETS.map((s) => s.id);
  for (const id of ["standard", "longhaul", "sprint", "unevenArrival", "nocombat", "nasaPhase1"]) {
    assert.ok(ids.includes(id), `missing preset ${id}`);
  }
  assert.equal(getScenarioPreset(DEFAULT_SCENARIO).id, "standard");
  assert.equal(getScenarioPreset("nope"), null);
});

test("every preset has the fields the settings UI consumes", () => {
  for (const s of SCENARIO_PRESETS) {
    assert.ok(s.id && s.label && s.desc, `preset ${s.id} missing label/desc`);
    assert.ok(Number.isInteger(s.rounds) && s.rounds > 0, `preset ${s.id} bad rounds`);
  }
  // Only NASA Phase 1 carries a seed layout.
  assert.ok(getScenarioPreset("nasaPhase1").seedLayout === PHASE1_LAYOUT);
  assert.ok(!getScenarioPreset("standard").seedLayout);
});

test("seeding is a no-op without a layout", () => {
  const p = makePlayer({ x: 600, y: 600 }, 1, "#fff");
  assert.equal(seedPlayerLayout(p, null, p.base), p);
  assert.equal(seedPlayerLayout(p, { assets: [] }, p.base), p);
});

test("Phase 1 seeds the full Artemis Base Camp footprint", () => {
  const base = { x: 600, y: 600 };
  const p0 = makePlayer(base, 1, "#fff");
  const ptsBefore = p0.assetPts;
  const p = seedPlayerLayout(p0, PHASE1_LAYOUT, base);

  // Counts match the layout (1 habitat, 1 reactor, 2 pads, 2 solar, 2 rovers, 1 comsat).
  assert.equal(p.habitats.length, 1);
  assert.equal(p.reactors.length, 1);
  assert.equal(p.landingPads.length, 2);
  assert.equal(p.panels.length, 2);
  assert.equal(p.extraRovers.length, 2);
  assert.equal(p.comsats.length, 1);

  // structureHealth is index-matched and full health.
  assert.deepEqual(p.structureHealth.landingPads, [1.0, 1.0]);
  assert.deepEqual(p.structureHealth.panels, [1.0, 1.0]);
  assert.equal(p.structureHealth.habitats.length, 1);
  assert.equal(p.structureHealth.extraRovers.length, 2);

  // Habitat power index-matched.
  assert.deepEqual(p.habitatPower, [HABITAT_POWER_INIT]);

  // Rover objects carry the live shape.
  for (const er of p.extraRovers) {
    assert.equal(er.power, POWER_CAP);
    assert.equal(er.status, "idle");
    assert.deepEqual(er.waypoints, []);
    assert.equal(er.ice, 0);
  }

  // assetPts accumulated correctly.
  const expected = ptsBefore + ASSET_POINTS.habitat + ASSET_POINTS.reactor + 2 * ASSET_POINTS.pad
    + 2 * ASSET_POINTS.solar + 2 * ASSET_POINTS.rover + ASSET_POINTS.comsat;
  assert.equal(p.assetPts, expected);

  // Budget untouched (seeded assets are free / already on the surface).
  assert.equal(p.budget, p0.budget);

  // Habitat sits exactly at base.
  assert.deepEqual(p.habitats[0], { x: 600, y: 600 });
});

test("seeded coordinates stay within map bounds", () => {
  // Base near the edge: offsets must clamp, not run off-map or go negative.
  const base = { x: 6, y: H - 6 };
  const p = seedPlayerLayout(makePlayer(base, 1, "#fff"), PHASE1_LAYOUT, base);
  const all = [...p.reactors, ...p.landingPads, ...p.panels, ...p.comsats, ...p.extraRovers, ...p.habitats];
  for (const a of all) {
    assert.ok(a.x >= 4 && a.x <= W - 4, `x out of bounds: ${a.x}`);
    assert.ok(a.y >= 4 && a.y <= H - 4, `y out of bounds: ${a.y}`);
  }
});

test("ridgeAt predicate tags solar panels", () => {
  const base = { x: 600, y: 600 };
  const p = seedPlayerLayout(makePlayer(base, 1, "#fff"), PHASE1_LAYOUT, base, { ridgeAt: () => true });
  assert.ok(p.panels.every((pan) => pan.onRidge === true));
});

test("seeding does not mutate the input player", () => {
  const base = { x: 600, y: 600 };
  const p0 = makePlayer(base, 1, "#fff");
  seedPlayerLayout(p0, PHASE1_LAYOUT, base);
  assert.equal(p0.habitats.length, 0, "input player left untouched");
  assert.equal(p0.extraRovers.length, 0);
});

// v118: terrestrial governance analogues (ATCM, ITU) as scenario templates.
test("ATCM and ITU governance-analogue presets exist with correct shape", () => {
  const atcm = getScenarioPreset("atcm");
  const itu = getScenarioPreset("itu");
  assert.ok(atcm && itu, "both governance-analogue presets present");

  // ATCM: Antarctic-Treaty consensus, no interference, longer horizon.
  assert.equal(atcm.rounds, 16);
  assert.equal(atcm.overrides.HOSTILE_DECAY, 0);
  assert.equal(atcm.overrides.MIL_DAMAGE_SCALE, 0);
  assert.equal(atcm.governance, GOVERNANCE_ANALOGUES.atcm);
  assert.match(atcm.governance.analogue, /Antarctic Treaty/);

  // ITU: coordination logic, interference LEFT ON (overlap is the point).
  assert.equal(itu.rounds, 12);
  assert.ok(!itu.overrides, "ITU keeps interference on (no nocombat overrides)");
  assert.equal(itu.governance, GOVERNANCE_ANALOGUES.itu);
  assert.match(itu.governance.analogue, /ITU/);
});

test("governance analogues carry premise + tabletop framing", () => {
  for (const key of ["atcm", "itu"]) {
    const g = GOVERNANCE_ANALOGUES[key];
    assert.ok(g.analogue && g.premise && g.tabletop, `${key} has full framing`);
    assert.ok(g.tabletop.length > 40, `${key} tabletop framing is substantive`);
  }
});

test("non-governance presets have no governance block", () => {
  for (const id of ["standard", "longhaul", "sprint", "nasaPhase1"]) {
    assert.equal(getScenarioPreset(id).governance, undefined);
  }
});

// v131 (roadmap): strategic-reserve scenario.
test("strategic-reserve scenario exists with a long horizon and a briefing", () => {
  const sr = getScenarioPreset("strategic_reserve");
  assert.ok(sr, "strategic_reserve preset present");
  assert.equal(sr.rounds, 20, "long horizon for patient accumulation");
  assert.equal(sr.governance, SCENARIO_BRIEFINGS.strategic_reserve, "carries the reserve briefing");
  assert.match(sr.governance.analogue, /reserve/i);
  assert.ok(sr.governance.premise && sr.governance.tabletop, "briefing has premise + tabletop framing");
  // The briefing is honest that the orbital dimension is not yet built.
  assert.match(sr.governance.tabletop, /orbit/i);
});

test("scenario briefings are shaped like governance analogues (one render path)", () => {
  for (const key of Object.keys(SCENARIO_BRIEFINGS)) {
    const b = SCENARIO_BRIEFINGS[key];
    assert.ok(b.analogue && b.premise && b.tabletop, `${key} briefing has all three fields`);
  }
});
