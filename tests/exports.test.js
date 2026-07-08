// Tests for the round-summary text builder. Pure function, no React, so we
// can directly assert on the output text.

import { test } from "node:test";
import assert from "node:assert";
import { buildRoundSummaryText, buildMissionLogCsv, buildMissionStateJson } from "../src/sim/index.js";

const samplePlayer = (overrides = {}) => ({
  x: 0, y: 0,
  ice: 0,
  iceDeposited: 0,
  assetPts: 0,
  budget: 100,
  safetyViolations: 0,
  panels: [],
  reactors: [],
  habitats: [],
  extraRovers: [],
  landingPads: [],
  comsats: [],
  stakeholderName: null,
  ...overrides,
});

test("buildRoundSummaryText: header includes round + day", () => {
  const text = buildRoundSummaryText({
    round: 4,
    day: 2,
    globalDay: 30,
    p1: samplePlayer(),
    p2: samplePlayer(),
    activeViolations: [],
    missionLog: [],
  });
  assert.ok(text.includes("ROUND 4 SUMMARY"));
  // Day labels are 1-indexed in the display ("D3" for day=2).
  assert.ok(text.includes("Day 3"));
  assert.ok(text.includes("Global day 31"));
});

test("buildRoundSummaryText: skips ACTOR II when p2 is null", () => {
  const text = buildRoundSummaryText({
    round: 1, day: 0, globalDay: 0,
    p1: samplePlayer(),
    p2: null,
    activeViolations: [],
    missionLog: [],
  });
  assert.ok(text.includes("ACTOR I"));
  assert.ok(!text.includes("ACTOR II"));
});

test("buildRoundSummaryText: includes both players when both present", () => {
  const text = buildRoundSummaryText({
    round: 1, day: 0, globalDay: 0,
    p1: samplePlayer({ iceDeposited: 50, stakeholderName: "Open Lunar" }),
    p2: samplePlayer({ iceDeposited: 30, stakeholderName: "Nation State A" }),
    activeViolations: [],
    missionLog: [],
  });
  assert.ok(text.includes("ACTOR I (Open Lunar)"));
  assert.ok(text.includes("ACTOR II (Nation State A)"));
  assert.ok(text.includes("50 kg"));
  assert.ok(text.includes("30 kg"));
});

test("buildRoundSummaryText: active violations section appears when any present", () => {
  const text = buildRoundSummaryText({
    round: 1, day: 0, globalDay: 0,
    p1: samplePlayer(),
    p2: samplePlayer(),
    activeViolations: [
      { owner: "ACTOR I", type: "habitat", radiusKm: 14, violatorCount: 2 },
    ],
    missionLog: [],
  });
  assert.ok(text.includes("ACTIVE AREA VIOLATIONS (1)"));
  assert.ok(text.includes("ACTOR I habitat zone (14 km) -- 2 breaches"));
});

test("buildRoundSummaryText: single-violation is singular 'breach' not 'breaches'", () => {
  const text = buildRoundSummaryText({
    round: 1, day: 0, globalDay: 0,
    p1: samplePlayer(),
    p2: samplePlayer(),
    activeViolations: [
      { owner: "ACTOR I", type: "habitat", radiusKm: 14, violatorCount: 1 },
    ],
    missionLog: [],
  });
  assert.ok(text.includes("1 breach"), "should say '1 breach' not '1 breaches'");
  // Make sure we don't accidentally match "1 breaches" or stray "breach es".
  assert.ok(!text.includes("1 breaches"));
});

test("buildRoundSummaryText: violations section absent when no violations", () => {
  const text = buildRoundSummaryText({
    round: 1, day: 0, globalDay: 0,
    p1: samplePlayer(),
    p2: samplePlayer(),
    activeViolations: [],
    missionLog: [],
  });
  assert.ok(!text.includes("ACTIVE AREA VIOLATIONS"));
});

test("buildRoundSummaryText: round events only show entries from current round", () => {
  const text = buildRoundSummaryText({
    round: 3, day: 0, globalDay: 24,
    p1: samplePlayer(),
    p2: samplePlayer(),
    activeViolations: [],
    missionLog: [
      { round: 1, day: 2, label: "old event 1", type: "deposit" },
      { round: 2, day: 4, label: "old event 2", type: "place" },
      { round: 3, day: 0, label: "this-round event", type: "turn" },
      { round: 3, day: 1, label: "this-round event 2", type: "deposit" },
    ],
  });
  assert.ok(text.includes("EVENTS THIS ROUND (2)"));
  assert.ok(text.includes("this-round event"));
  assert.ok(text.includes("this-round event 2"));
  assert.ok(!text.includes("old event 1"));
  assert.ok(!text.includes("old event 2"));
});

test("buildRoundSummaryText: truncates round events to last 20 with notice", () => {
  const events = [];
  for (let i = 0; i < 30; i++) {
    events.push({ round: 1, day: i % 7, label: `event ${i}`, type: "deposit" });
  }
  const text = buildRoundSummaryText({
    round: 1, day: 6, globalDay: 6,
    p1: samplePlayer(),
    p2: samplePlayer(),
    activeViolations: [],
    missionLog: events,
  });
  assert.ok(text.includes("EVENTS THIS ROUND (30)"));
  assert.ok(text.includes("… 10 earlier events truncated"));
  // Last 20 events are visible; first 10 are truncated.
  assert.ok(text.includes("event 29"));
  assert.ok(text.includes("event 10"));
  assert.ok(!text.includes("event 0\n")); // boundary: event 0 truncated
});

test("buildRoundSummaryText: footer includes Open Lunar attribution + v2.7", () => {
  const text = buildRoundSummaryText({
    round: 1, day: 0, globalDay: 0,
    p1: samplePlayer(),
    p2: samplePlayer(),
    activeViolations: [],
    missionLog: [],
  });
  assert.ok(text.includes("Open Lunar Foundation"));
  assert.ok(text.includes("v2.7"));
});

test("buildRoundSummaryText: infrastructure row formatted with all asset counts", () => {
  const text = buildRoundSummaryText({
    round: 1, day: 0, globalDay: 0,
    p1: samplePlayer({
      panels: [{}, {}, {}],          // 3
      reactors: [{}],                // 1
      habitats: [{}, {}],            // 2
      extraRovers: [{}],             // 1 + primary = 2 total
      landingPads: [{}, {}],         // 2
      comsats: [{}],                 // 1
    }),
    p2: null,
    activeViolations: [],
    missionLog: [],
  });
  assert.ok(text.includes("3 panel"));
  assert.ok(text.includes("1 reactor"));
  assert.ok(text.includes("2 habitat"));
  assert.ok(text.includes("2 rover")); // 1 primary + 1 extra
  assert.ok(text.includes("2 pad"));
  assert.ok(text.includes("1 comsat"));
});

// ── buildMissionLogCsv ──────────────────────────────────────────────────────

test("buildMissionLogCsv: header row + zero events produces just the header", () => {
  const csv = buildMissionLogCsv([]);
  const lines = csv.split("\n");
  assert.equal(lines.length, 1);
  // v172: enriched, stable preferred column order
  assert.equal(lines[0], "round,day,globalDay,type,actor,itemType,cost,kg,craterIdx,x,y,seq,label");
});

test("buildMissionLogCsv: null missionLog is treated as empty", () => {
  const csv = buildMissionLogCsv(null);
  assert.equal(csv.split("\n").length, 1);
});

test("buildMissionLogCsv: kg formatted to 2 decimal places", () => {
  const csv = buildMissionLogCsv([
    { round: 1, day: 2, globalDay: 9, type: "deposit", kg: 8.6, craterIdx: 3, label: "P1 deposited" },
  ]);
  const lines = csv.split("\n");
  assert.equal(lines.length, 2);
  assert.ok(lines[1].includes("8.60"), `expected "8.60" formatting, got: ${lines[1]}`);
});

test("buildMissionLogCsv: missing optional fields render as empty string", () => {
  const csv = buildMissionLogCsv([
    { round: 1, day: 0, globalDay: 0, type: "turn" },  // no kg, actor, label, etc.
  ]);
  const lines = csv.split("\n");
  // v172: absent kg is now empty (not "0.00"); all other absent cols are empty.
  // columns: round,day,globalDay,type,actor,itemType,cost,kg,craterIdx,x,y,seq,label
  assert.equal(lines[1], "1,0,0,turn,,,,,,,,,");
});

// ── buildMissionStateJson ───────────────────────────────────────────────────

test("buildMissionStateJson: meta block populated correctly", () => {
  const obj = buildMissionStateJson({
    round: 4, day: 2, globalDay: 30,
    totalRounds: 12, simMode: "two",
    p1: null, p2: null,
    history: [], missionLog: [], annotations: [],
    powerGridState: { mode: "independent", offeredBy: null, offeredTo: null },
    cratersTotal: 100,
    craterHealth: new Float32Array(100).fill(1.0),
    physOverrides: {},
  });
  assert.equal(obj.meta.round, 4);
  assert.equal(obj.meta.day, 2);
  assert.equal(obj.meta.globalDay, 30);
  assert.equal(obj.meta.totalRounds, 12);
  assert.equal(obj.meta.simMode, "two");
  assert.ok(typeof obj.meta.timestamp === "string");
});

test("buildMissionStateJson: null p1/p2 stay null in the digest", () => {
  const obj = buildMissionStateJson({
    round: 1, day: 0, globalDay: 0, totalRounds: 12, simMode: "solo",
    p1: null, p2: null,
    history: [], missionLog: [], annotations: [],
    powerGridState: {},
    cratersTotal: 0,
    craterHealth: new Float32Array(0),
    physOverrides: {},
  });
  assert.equal(obj.p1, null);
  assert.equal(obj.p2, null);
});

test("buildMissionStateJson: player digest flattens asset arrays to counts", () => {
  const p1 = {
    iceDeposited: 50, assetPts: 12, budget: 200,
    econ: 1.5, rdAccum: 8, milStock: 1.0,
    panels: [{}, {}, {}],
    reactors: [{}],
    habitats: [{}, {}],
    extraRovers: [{}],         // 1 + primary = 2 total
    landingPads: [{}, {}, {}],
  };
  const obj = buildMissionStateJson({
    round: 1, day: 0, globalDay: 0, totalRounds: 12, simMode: "two",
    p1, p2: null,
    history: [], missionLog: [], annotations: [],
    powerGridState: {},
    cratersTotal: 0,
    craterHealth: new Float32Array(0),
    physOverrides: {},
  });
  assert.equal(obj.p1.iceDeposited, 50);
  assert.equal(obj.p1.assetPts, 12);
  assert.equal(obj.p1.panels, 3);
  assert.equal(obj.p1.reactors, 1);
  assert.equal(obj.p1.habitats, 2);
  assert.equal(obj.p1.rovers, 2);  // primary + 1 extra
  assert.equal(obj.p1.pads, 3);
});

test("buildMissionStateJson: cratersHeavilyDepleted counts health < 0.2", () => {
  const craterHealth = new Float32Array([1.0, 0.5, 0.19, 0.05, 0.0, 0.2, 0.21]);
  const obj = buildMissionStateJson({
    round: 1, day: 0, globalDay: 0, totalRounds: 12, simMode: "two",
    p1: null, p2: null,
    history: [], missionLog: [], annotations: [],
    powerGridState: {},
    cratersTotal: craterHealth.length,
    craterHealth,
    physOverrides: {},
  });
  // 0.19, 0.05, 0.0 → 3 craters under threshold
  assert.equal(obj.cratersHeavilyDepleted, 3);
  assert.equal(obj.cratersTotal, 7);
});

test("buildMissionStateJson: missing craterHealth defaults to 0 depleted", () => {
  const obj = buildMissionStateJson({
    round: 1, day: 0, globalDay: 0, totalRounds: 12, simMode: "two",
    p1: null, p2: null,
    history: [], missionLog: [], annotations: [],
    powerGridState: {},
    cratersTotal: 0,
    craterHealth: null,
    physOverrides: {},
  });
  assert.equal(obj.cratersHeavilyDepleted, 0);
});
