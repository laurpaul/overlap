import { test } from "node:test";
import assert from "node:assert/strict";
import { blocSpoilerRisk, spoilerComparison } from "../src/sim/blocNegotiation.js";

test("the US-led bloc is the harder actor to trust to hold a coordinated line", () => {
  const concordium = blocSpoilerRisk("concordium");
  const lrc = blocSpoilerRisk("ilrs");
  assert.ok(concordium.risk > lrc.risk, `Concordium spoiler risk (${concordium.risk}) > LRC (${lrc.risk})`);
  assert.ok(concordium.harderToTrust, "Concordium reads as hard to trust");
  assert.ok(!lrc.harderToTrust, "LRC reads as the more predictable partner");
});

test("spoiler risk is driven by cohesion, an act-ahead member, and principal override", () => {
  const c = blocSpoilerRisk("concordium");
  assert.ok(c.drivers.lowCohesion > 0);
  assert.ok(c.drivers.unboundActor > 0, "the act-ahead commercial member adds risk");
  assert.ok(c.drivers.principalOverride > 0, "the founder-can-override-agency structure adds risk");
  // the counter-coalition has little of the latter two
  const l = blocSpoilerRisk("ilrs");
  assert.ok(l.drivers.unboundActor < c.drivers.unboundActor);
  assert.ok(l.drivers.principalOverride < c.drivers.principalOverride);
});

test("spoilerComparison names the US-led bloc as the harder actor to trust", () => {
  const r = spoilerComparison();
  assert.equal(r.harder, "concordium");
  assert.match(r.note, /US-led/);
});

test("the consortium board-actor id resolves to the same Concordium trust profile", () => {
  // 'concordium' and 'artemis' both denote the US-led coalition
  assert.equal(blocSpoilerRisk("concordium").risk, blocSpoilerRisk("artemis").risk);
});
