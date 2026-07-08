// Tests for the public-claims / propaganda module (v181).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeClaim, verifyClaim, resolveClaim, setClaimStance,
  credibilityOf, credibilityLabel, tallyStances, CLAIM_METRICS,
} from "../src/sim/claims.js";

const player = (over = {}) => ({
  iceDeposited: 250, assetPts: 12,
  reactors: [{}, {}], habitats: [{}], landingPads: [], panels: [{}, {}, {}],
  extraRovers: [{}],
  structureHealth: { reactors: [1, 1], habitats: [1], panels: [1, 1, 0.05], extraRovers: [1] },
  ...over,
});

test("makeClaim: production claim auto-writes readable text", () => {
  const c = makeClaim({ author: 0, round: 2, metric: "ice", op: ">=", value: 200 });
  assert.equal(c.kind, "production");
  assert.equal(c.author, 0);
  assert.equal(c.value, 200);
  assert.match(c.text, /at least 200/);
  assert.equal(c.status, "unverified");
});

test("makeClaim: pledge keeps free text and is unverifiable", () => {
  const c = makeClaim({ author: 1, round: 1, kind: "pledge", text: "We won't expand south" });
  assert.equal(c.kind, "pledge");
  assert.equal(verifyClaim(c, player()), "unverifiable");
});

test("verifyClaim: true and false production claims", () => {
  const p = player();
  assert.equal(verifyClaim(makeClaim({ author: 0, round: 1, metric: "ice", op: ">=", value: 200 }), p), "true");
  assert.equal(verifyClaim(makeClaim({ author: 0, round: 1, metric: "ice", op: ">=", value: 400 }), p), "false");
  // counts exclude destroyed assets (the third panel is destroyed → 2 live).
  assert.equal(CLAIM_METRICS.panels.get(p), 2);
  assert.equal(verifyClaim(makeClaim({ author: 0, round: 1, metric: "panels", op: "==", value: 2 }), p), "true");
  assert.equal(verifyClaim(makeClaim({ author: 0, round: 1, metric: "panels", op: "==", value: 3 }), p), "false");
});

test("verifyClaim: rovers count includes the primary rover", () => {
  // one extra rover + the primary = 2
  assert.equal(CLAIM_METRICS.rovers.get(player()), 2);
});

test("resolveClaim: stamps status + the actual value", () => {
  const c = resolveClaim(makeClaim({ author: 0, round: 1, metric: "reactors", op: ">=", value: 3 }), player());
  assert.equal(c.status, "false");
  assert.equal(c.verifiedActual, 2);
});

test("setClaimStance: records and clears believe/doubt", () => {
  let c = makeClaim({ author: 0, round: 1, metric: "ice", op: ">=", value: 200 });
  c = setClaimStance(c, 1, "doubt");
  assert.equal(c.stances[1], "doubt");
  c = setClaimStance(c, 1, "believe");
  assert.equal(c.stances[1], "believe");
  c = setClaimStance(c, 1, null);
  assert.equal(c.stances[1], undefined);
});

test("tallyStances: counts believe vs doubt", () => {
  let c = makeClaim({ author: 0, round: 1, metric: "ice", op: ">=", value: 200 });
  c = setClaimStance(c, 1, "believe");
  c = setClaimStance(c, 2, "doubt");
  c = setClaimStance(c, 3, "doubt");
  assert.deepEqual(tallyStances(c), { believe: 1, doubt: 2 });
});

test("credibilityOf: ratio over verified claims, null when untested", () => {
  const claims = [
    { author: 0, status: "true" }, { author: 0, status: "false" }, { author: 0, status: "true" },
    { author: 0, status: "unverified" }, // not counted
    { author: 1, status: "false" },
  ];
  const a0 = credibilityOf(claims, 0);
  assert.equal(a0.verified, 3);
  assert.equal(a0.trueCount, 2);
  assert.ok(Math.abs(a0.ratio - 2 / 3) < 1e-9);
  assert.equal(credibilityOf(claims, 2).ratio, null); // no claims → untested
});

test("credibilityLabel: tiers", () => {
  assert.equal(credibilityLabel([], 0).tier, "unknown");
  assert.equal(credibilityLabel([{ author: 0, status: "true" }], 0).tier, "good");
  assert.equal(credibilityLabel([{ author: 0, status: "true" }, { author: 0, status: "false" }], 0).tier, "mixed");
  assert.equal(credibilityLabel([{ author: 0, status: "false" }], 0).tier, "bad");
});
