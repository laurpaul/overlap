// Tests for the buildPlotDefinitions pure function. Validates the shape
// and core invariants without trying to exhaustively check every plot's
// numerics (the function is 440 lines of data shuffling -- a full equation-
// level check would be brittle and overlap heavily with the source).

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPlotDefinitions } from "../src/sim/plotData.js";

// ── Empty inputs ──────────────────────────────────────────────────────────

test("buildPlotDefinitions -- empty input returns empty array", () => {
  assert.deepEqual(buildPlotDefinitions({ frames: [], log: [] }), []);
});

test("buildPlotDefinitions -- missing frames returns empty array", () => {
  assert.deepEqual(buildPlotDefinitions({}), []);
  assert.deepEqual(buildPlotDefinitions({ log: [] }), []);
});

// ── Minimal valid input ──────────────────────────────────────────────────

const baseFrame = {
  globalDay: 0,
  logLength: 0,
  p1: {
    x: 500, y: 500,
    panels: [], reactors: [], habitats: [], extraRovers: [],
    iceDeposited: 0, assetPts: 0, ice: 0,
    budget: 100,
    safetyViolations: 0,
    status: "idle",
    structureHealth: {},
    habitatPower: [],
  },
  p2: null,
  powerGridState: { mode: "independent", offeredBy: null, offeredTo: null },
};

test("buildPlotDefinitions -- one frame, one player returns plots array", () => {
  const result = buildPlotDefinitions({ frames: [baseFrame], log: [] });
  assert.ok(Array.isArray(result));
  assert.ok(result.length > 0, "should produce at least one plot");
});

test("buildPlotDefinitions -- each plot has required schema", () => {
  const result = buildPlotDefinitions({ frames: [baseFrame], log: [] });
  for (const plot of result) {
    assert.ok(plot.id,        "plot has id");
    assert.ok(plot.title,     "plot has title");
    assert.ok(Array.isArray(plot.series), "plot.series is array");
    assert.ok(Array.isArray(plot.xLabels), "plot.xLabels is array");
    assert.equal(typeof plot.width, "number");
    assert.equal(typeof plot.height, "number");
    assert.equal(typeof plot.legendCols, "number");
  }
});

test("buildPlotDefinitions -- produces the canonical set of plot ids", () => {
  const result = buildPlotDefinitions({ frames: [baseFrame], log: [] });
  const ids = result.map((p) => p.id).sort();
  // The set should include the well-known plot ids the UI references.
  const expectedSubset = [
    "power-state-over-time",
    "power-supplied-over-time",
    "ice-by-rover",
    "ice-delivered-by-rover",
    "movement-by-rover",
    "score-over-time",
    "violations-over-time",
    "budget-over-time",
  ];
  for (const id of expectedSubset) {
    assert.ok(ids.includes(id), `expected plot id "${id}" to be present, got ${ids.join(", ")}`);
  }
});

// ── Per-day collapse ──────────────────────────────────────────────────────

test("buildPlotDefinitions -- collapses multiple frames at the same globalDay", () => {
  // Three frames at day 0 (e.g. from intra-day re-renders), should collapse
  // to one. Last frame wins.
  const frameA = { ...baseFrame, globalDay: 0, p1: { ...baseFrame.p1, iceDeposited: 5 } };
  const frameB = { ...baseFrame, globalDay: 0, p1: { ...baseFrame.p1, iceDeposited: 15 } };
  const frameC = { ...baseFrame, globalDay: 0, p1: { ...baseFrame.p1, iceDeposited: 25 } };

  const result = buildPlotDefinitions({ frames: [frameA, frameB, frameC], log: [] });
  // One x-axis tick (D1), not three.
  for (const plot of result) {
    assert.equal(plot.xLabels.length, 1, `plot ${plot.id} should have 1 x-label, got ${plot.xLabels.length}`);
  }
});

test("buildPlotDefinitions -- x-labels are 'D1'..'DN' (1-indexed)", () => {
  const frames = [
    { ...baseFrame, globalDay: 0 },
    { ...baseFrame, globalDay: 1 },
    { ...baseFrame, globalDay: 2 },
  ];
  const result = buildPlotDefinitions({ frames, log: [] });
  // Inspect the first plot's xLabels.
  const labels = result[0].xLabels;
  assert.deepEqual(labels, ["D1", "D2", "D3"]);
});

// ── Score series sanity ───────────────────────────────────────────────────

test("buildPlotDefinitions -- score-over-time data tracks iceDeposited", () => {
  // One player gradually deposits more ice each day. Score should rise.
  const frames = [
    { ...baseFrame, globalDay: 0, p1: { ...baseFrame.p1, iceDeposited: 0 } },
    { ...baseFrame, globalDay: 1, p1: { ...baseFrame.p1, iceDeposited: 50 } },
    { ...baseFrame, globalDay: 2, p1: { ...baseFrame.p1, iceDeposited: 100 } },
  ];
  const result = buildPlotDefinitions({ frames, log: [] });
  const scorePlot = result.find((p) => p.id === "score-over-time");
  assert.ok(scorePlot);
  // Find P1's series.
  const p1Series = scorePlot.series.find((s) => s.key === "score-p1");
  assert.ok(p1Series);
  // Score = iceDeposited (+ other terms that are zero here).
  assert.equal(p1Series.data[0], 0);
  assert.equal(p1Series.data[1], 50);
  assert.equal(p1Series.data[2], 100);
});

// ── Two-player ─────────────────────────────────────────────────────────────

test("buildPlotDefinitions -- two-player frame yields both P1 and P2 series", () => {
  const twoPlayerFrame = {
    ...baseFrame,
    p2: { ...baseFrame.p1, x: 600, y: 600 },
  };
  const result = buildPlotDefinitions({ frames: [twoPlayerFrame], log: [] });
  // Score plot should have score-p1 and score-p2.
  const scorePlot = result.find((p) => p.id === "score-over-time");
  const keys = scorePlot.series.map((s) => s.key);
  assert.ok(keys.includes("score-p1"));
  assert.ok(keys.includes("score-p2"));
});

// ── Log-driven series (mining events) ─────────────────────────────────────

test("buildPlotDefinitions -- ice-by-rover accumulates from mine events", () => {
  // Single frame with a mine event in the log.
  const frame = {
    ...baseFrame,
    globalDay: 0,
    logLength: 1,
  };
  const log = [
    { type: "mine", actor: 1, roverId: 1, kg: 25 },
  ];
  const result = buildPlotDefinitions({ frames: [frame], log });
  const iceByRover = result.find((p) => p.id === "ice-by-rover");
  assert.ok(iceByRover);
  // P1 Rover 1 should have 25 kg recorded for day 0.
  const series = iceByRover.series.find((s) => s.key === "P1-rover-1");
  assert.ok(series, `expected P1-rover-1 series; got keys ${iceByRover.series.map(s=>s.key).join(",")}`);
  assert.equal(series.data[0], 25);
});
