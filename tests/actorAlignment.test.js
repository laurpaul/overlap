// Locks the actor model to the brief packet: display names use the obscured
// vocabulary, all five brief actors exist, the blocs map to Concordium / LRC,
// and the cohesion figures the briefs quote (~44% / ~69%) still hold. Mechanics
// (budget/cost/footprint mods, ids) are covered by sim.test.js; this guards the
// brief alignment specifically so a future rename can't silently drift the two
// artifacts apart.
import { test } from "node:test";
import assert from "node:assert/strict";
import { STAKEHOLDER_DEFS, getStakeholderDef } from "../src/sim/stakeholders.js";
import { negotiateBloc, describeBlocPosition, BLOC_LABELS } from "../src/sim/blocNegotiation.js";

test("display names use the obscured brief vocabulary", () => {
  const name = (id) => getStakeholderDef(id).name;
  assert.equal(name("artemis"), "Vanguard");
  assert.equal(name("aurelian"), "The Aurelian Union");
  assert.equal(name("large_commercial"), "Halcyon Aerospace");
  assert.equal(name("ilrs"), "LRC");
  assert.equal(name("small_commercial"), "The Ascendant Initiative");
});

test("all five brief actors are present (plus the observer)", () => {
  const names = STAKEHOLDER_DEFS.map((s) => s.name);
  for (const n of ["Vanguard", "The Aurelian Union", "Halcyon Aerospace", "LRC", "The Ascendant Initiative"]) {
    assert.ok(names.includes(n), `missing brief actor: ${n}`);
  }
});

test("no real-agency names leak into player-facing identity fields", () => {
  const leaked = ["NASA", "ESA", "SpaceX", "ISRO", "JAXA", "Artemis", "ILRS"];
  for (const s of STAKEHOLDER_DEFS) {
    const surface = `${s.name} ${s.short} ${s.blurb} ${s.workPackage}`;
    for (const term of leaked) {
      assert.ok(!surface.includes(term), `"${term}" leaked into ${s.id} identity text`);
    }
  }
});

test("blocs carry the obscured names; the Ascendant Initiative is the light-footprint prospector", () => {
  assert.equal(BLOC_LABELS.artemis, "Concordium");
  assert.equal(BLOC_LABELS.ilrs, "LRC");
  // The hedging actor is the small-footprint prospector, per its brief.
  const asc = getStakeholderDef("small_commercial");
  assert.ok(asc.footprintMod < 1 && asc.disturbanceMod < 1, "Ascendant keeps a light footprint");
});

test("the Concordium consortium is a selectable board actor that disaggregates into its members", () => {
  const con = getStakeholderDef("concordium");
  assert.equal(con.name, "Concordium");
  assert.equal(BLOC_LABELS.concordium, "Concordium");
  // Selecting the consortium surfaces the same 44% cohesion + named factions.
  const r = negotiateBloc("concordium");
  assert.equal(Math.round(r.cohesion * 100), 44);
  assert.ok(r.factions.some((f) => /vanguard/i.test(f.label)) && r.factions.some((f) => /halcyon/i.test(f.label)),
    "consortium members are named in the disaggregation");
});

test("cohesion matches the figures the briefs quote (~44% Concordium, ~69% LRC)", () => {
  const concordium = negotiateBloc("artemis");
  const lrc = negotiateBloc("ilrs");
  assert.equal(Math.round(concordium.cohesion * 100), 44);
  assert.equal(Math.round(lrc.cohesion * 100), 69);
  // The framing line names Concordium; with a symmetric 50/50 split the science
  // wing reads as the swing, exactly as the briefs describe ("science wing usually the swing").
  const line = describeBlocPosition("artemis", concordium);
  assert.ok(line.startsWith("Concordium:"), "framing names the bloc Concordium");
  assert.ok(/science/i.test(line), "the swing faction is named (the science wing)");
});
