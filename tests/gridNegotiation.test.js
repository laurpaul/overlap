import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GRID_DEFS, INITIAL_GRID, gridOptions, applyGridAction, isGridShared,
} from "../src/sim/gridNegotiation.js";

test("full lifecycle: independent -> offered -> shared -> independent", () => {
  let grid = { ...INITIAL_GRID };
  // P1 (pi=0) opens
  let r = applyGridAction(grid, 0, "open", GRID_DEFS.power);
  assert.equal(r.grid.mode, "offered");
  assert.equal(r.grid.offeredBy, 1);
  assert.equal(r.grid.offeredTo, 2);
  assert.equal(r.score, 30);
  grid = r.grid;
  // P2 (pi=1) joins
  r = applyGridAction(grid, 1, "join", GRID_DEFS.power);
  assert.equal(r.grid.mode, "shared");
  assert.equal(r.score, 20);
  assert.ok(isGridShared(r.grid));
  grid = r.grid;
  // P1 decouples
  r = applyGridAction(grid, 0, "decouple", GRID_DEFS.power);
  assert.equal(r.grid.mode, "independent");
  assert.equal(r.score, -20);
});

test("comms grid uses its own score weights", () => {
  const r = applyGridAction({ ...INITIAL_GRID }, 0, "open", GRID_DEFS.comms);
  assert.equal(r.score, 25);
  assert.match(r.logVerb, /comms grid/);
});

test("invalid actions return null", () => {
  // join when nothing is offered
  assert.equal(applyGridAction({ ...INITIAL_GRID }, 1, "join", GRID_DEFS.power), null);
  // the non-targeted actor cannot join an offer meant for the other
  const offered = { mode: "offered", offeredBy: 1, offeredTo: 2 };
  assert.equal(applyGridAction(offered, 0, "join", GRID_DEFS.power), null); // pi=0 is actor 1, the offerer
  // decouple when not shared
  assert.equal(applyGridAction({ ...INITIAL_GRID }, 0, "decouple", GRID_DEFS.power), null);
});

test("permanent shared grid cannot be decoupled", () => {
  const shared = { mode: "shared", offeredBy: 1, offeredTo: 2 };
  assert.equal(applyGridAction(shared, 0, "decouple", GRID_DEFS.power, { permanent: true }), null);
  assert.deepEqual(gridOptions(shared, 0, { permanent: true }), []);
  assert.deepEqual(gridOptions(shared, 0, { permanent: false }), [{ type: "decouple", label: "Decouple" }]);
});

test("options reflect state and turn", () => {
  // independent: either actor can open
  assert.equal(gridOptions(INITIAL_GRID, 0)[0].type, "open");
  // offered to P2: P2 sees join, P1 (offerer) sees nothing
  const offered = { mode: "offered", offeredBy: 1, offeredTo: 2 };
  assert.equal(gridOptions(offered, 1)[0].type, "join"); // pi=1 -> actor 2 = offeredTo
  assert.deepEqual(gridOptions(offered, 0), []);          // pi=0 -> actor 1 = offerer
});

test("restriction blocks new offers/joins but not decouple", () => {
  // independent + cannot negotiate -> no open
  assert.deepEqual(gridOptions(INITIAL_GRID, 0, { canNegotiate: false }), []);
  // offered + cannot negotiate -> targeted actor cannot join
  const offered = { mode: "offered", offeredBy: 1, offeredTo: 2 };
  assert.deepEqual(gridOptions(offered, 1, { canNegotiate: false }), []);
  // shared + cannot negotiate -> can still decouple
  const shared = { mode: "shared", offeredBy: 1, offeredTo: 2 };
  assert.deepEqual(gridOptions(shared, 0, { canNegotiate: false }), [{ type: "decouple", label: "Decouple" }]);
});
