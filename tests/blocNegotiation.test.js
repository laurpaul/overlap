// Bloc disaggregation + internal negotiation tests (roadmap). Pure foundation:
// sub-actors blend into a bloc position with a cohesion/tension metric and a
// named dissenter. Weights are tunable defaults; these lock the MECHANICS.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BLOC_SUBACTORS, BLOC_AXES, negotiateBlocPosition, negotiateBloc, describeBlocPosition,
} from "../src/sim/blocNegotiation.js";

test("Artemis disaggregates into science + commercial constituencies", () => {
  const subs = BLOC_SUBACTORS.artemis;
  assert.equal(subs.length, 2);
  assert.ok(subs.find((s) => s.id === "artemis_science"));
  assert.ok(subs.find((s) => s.id === "artemis_commercial"));
  // Influence sums to 1.
  assert.equal(subs.reduce((s, a) => s + a.influence, 0), 1);
});

test("bloc position is an influence-weighted blend within [0,1]", () => {
  const { position } = negotiateBloc("artemis");
  for (const axis of BLOC_AXES) {
    assert.ok(position[axis] >= 0 && position[axis] <= 1, `${axis} in range`);
  }
  // Science wants ice (0.9), commercial less (0.4); 50/50 blend ~ 0.65.
  assert.ok(Math.abs(position.ice - 0.65) < 1e-9, "ice blends to the influence-weighted mean");
  // Commercial wants throughput (0.95), science less (0.3); blend ~0.625.
  assert.ok(Math.abs(position.throughput - 0.625) < 1e-9);
});

test("a divided bloc has lower cohesion and a named dissenter", () => {
  const divided = negotiateBlocPosition([
    { id: "a", label: "Doves", influence: 0.5, priorities: { ice: 1, throughput: 0, safety: 1, speed: 0 } },
    { id: "b", label: "Hawks", influence: 0.5, priorities: { ice: 0, throughput: 1, safety: 0, speed: 1 } },
  ]);
  assert.ok(divided.cohesion < 0.2, "maximally opposed factions -> very low cohesion");
  assert.ok(divided.dissenter, "a dissenter is identified");
  assert.ok(divided.spread > 0.9, "spread reflects the deep disagreement");
});

test("a unified bloc is unanimous with full cohesion and no dissenter", () => {
  const same = { ice: 0.6, throughput: 0.6, safety: 0.6, speed: 0.6 };
  const unified = negotiateBlocPosition([
    { id: "a", label: "A", influence: 0.5, priorities: same },
    { id: "b", label: "B", influence: 0.5, priorities: { ...same } },
  ]);
  assert.equal(unified.cohesion, 1);
  assert.equal(unified.dissenter, null);
});

test("influence is normalized even if it does not sum to 1", () => {
  const r = negotiateBlocPosition([
    { id: "a", label: "A", influence: 3, priorities: { ice: 1, throughput: 0, safety: 0, speed: 0 } },
    { id: "b", label: "B", influence: 1, priorities: { ice: 0, throughput: 0, safety: 0, speed: 0 } },
  ]);
  // 3:1 weighting -> ice = 0.75.
  assert.ok(Math.abs(r.position.ice - 0.75) < 1e-9);
});

test("ILRS also disaggregates (symmetry) and describes its position", () => {
  const r = negotiateBloc("ilrs");
  assert.equal(BLOC_SUBACTORS.ilrs.length, 2);
  const desc = describeBlocPosition("ILRS", r);
  assert.ok(typeof desc === "string" && desc.length > 0);
});
