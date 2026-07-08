import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDetailedCsv, actorMetricSnapshot } from "../src/sim/exports.js";

function actor(over = {}) {
  return {
    stakeholderName: "ARTEMIS", iceDeposited: 142, ice: 12, volatiles: 0, budget: 380,
    econ: 6.4, rdAccum: 5, milStock: 2, assetPts: 9, safetyViolations: 2,
    allocPreset: "economic", zoneScale: 1.3, easements: [2], treatyFloor: 1,
    x: 980, y: 1020, foundingSeq: 1,
    panels: [{ x: 1, y: 1, seq: 3 }], reactors: [{ x: 2, y: 2, seq: 6 }], habitats: [{ x: 3, y: 3, seq: 4 }],
    landingPads: [{ x: 4, y: 4, seq: 7 }], comsats: [], extraRovers: [{ x: 5, y: 5, seq: 5, ice: 8 }],
    structureHealth: {}, ...over,
  };
}

test("actorMetricSnapshot captures the full metric set", () => {
  const s = actorMetricSnapshot(actor());
  assert.equal(s.stakeholder, "ARTEMIS");
  assert.equal(s.iceDeposited_kg, 142);
  assert.equal(s.iceCarried_kg, 20);   // 12 primary + 8 extra
  assert.equal(s.budget_cr, 380);
  assert.equal(s.stance, "economic");
  assert.equal(s.zoneScale, 1.3);
  assert.equal(s.easementsGranted, "2");
  assert.equal(s.reactors, 1);
  assert.equal(s.rovers, 2);          // primary + 1 extra
  assert.ok(s.score_penalty < 0);
});

test("buildDetailedCsv is a single flat table (one header, no section markers)", () => {
  const csv = buildDetailedCsv({
    history: [], p1: actor(), p2: actor({ stakeholderName: "ILRS" }),
    round: 2, day: 1, globalDay: 7, simMode: "standard", scenarioPreset: "baseline",
    version: "2.7.173", powerGridState: { mode: "shared" }, commsGridState: { mode: "independent" },
  });
  const lines = csv.split("\n");
  assert.ok(!csv.includes("# ==="), "no section markers, it's one flat table");
  assert.ok(lines[0].startsWith("round,phase,day,globalDay,actor,stakeholder,score"));
  // one header + two current rows
  assert.equal(lines.length, 3);
  assert.ok(lines[1].startsWith("2,current,1,7,ACTOR_I,ARTEMIS"));
  assert.ok(lines[2].includes("ILRS"));
  assert.ok(lines[1].includes("shared"));      // powerGrid column
});

test("buildDetailedCsv emits one row per (round, actor) from history + current", () => {
  const history = [
    { r: 1, m1: actorMetricSnapshot(actor()), m2: actorMetricSnapshot(actor({ stakeholderName: "ILRS" })), adv1: 0, adv2: 1, powerGrid: "independent", commsGrid: "independent" },
  ];
  const csv = buildDetailedCsv({ history, p1: actor(), p2: actor({ stakeholderName: "ILRS" }), round: 2, day: 0, globalDay: 4, powerGridState: {}, commsGridState: {} });
  const lines = csv.split("\n");
  // header + 2 historical (round 1) + 2 current (round 2) = 5
  assert.equal(lines.length, 5);
  assert.ok(lines[1].startsWith("1,round_end,,,ACTOR_I"));
  assert.ok(lines[3].startsWith("2,current,0,4,ACTOR_I"));
});

test("buildDetailedCsv falls back to legacy ice+budget for pre-upgrade history rows", () => {
  const history = [{ r: 1, d1: 50, d2: 30, bud1: 300, bud2: 280 }];  // no m1/m2
  const csv = buildDetailedCsv({ history, p1: actor(), p2: null, round: 2, day: 0, globalDay: 4, powerGridState: {}, commsGridState: {} });
  const lines = csv.split("\n");
  const a1 = lines.find(l => l.startsWith("1,round_end,,,ACTOR_I"));
  // iceDeposited_kg column carries 50, budget_cr carries 300; other metric cols blank
  const cells = a1.split(",");
  // columns: round,phase,day,globalDay,actor,stakeholder,score,...,iceDeposited_kg(idx12),iceCarried_kg,budget_cr(idx14)
  assert.equal(cells[12], "50");
  assert.equal(cells[14], "300");
});

test("buildDetailedCsv handles single actor (no p2) cleanly", () => {
  const csv = buildDetailedCsv({ history: [], p1: actor(), p2: null, round: 1, day: 0, globalDay: 0, powerGridState: {}, commsGridState: {} });
  const lines = csv.split("\n");
  assert.equal(lines.length, 2);  // header + ACTOR_I only
});
