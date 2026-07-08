// Tests for computeAutoFitViewport -- pure auto-fit camera calculation.

import { test } from "node:test";
import assert from "node:assert/strict";

import { computeAutoFitViewport } from "../src/sim/viewport.js";
import { W, H, PHASE } from "../src/sim/constants.js";

// ── Focus pulse override ────────────────────────────────────────────────────

test("computeAutoFitViewport: active focusPulse overrides everything", () => {
  const result = computeAutoFitViewport({
    phase: PHASE.PLAYING,
    p1: { x: 100, y: 100, active: true },
    p2: { x: 900, y: 900, active: true },
    focusPulse: { x: 500, y: 500, until: 1000 },
    now: 500,  // pulse still active
  });
  assert.equal(result.zoom, 2.6);  // TIGHT_ZOOM constant
  assert.equal(result.panX, 500 - W / 2);
  assert.equal(result.panY, 500 - H / 2);
});

test("computeAutoFitViewport: expired focusPulse falls through to normal framing", () => {
  const result = computeAutoFitViewport({
    phase: PHASE.PLAYING,
    p1: { x: 100, y: 100, active: true },
    p2: null,
    focusPulse: { x: 500, y: 500, until: 1000 },
    now: 2000,  // pulse expired
  });
  // Should NOT be the tight zoom anymore; should be auto-fit.
  assert.notEqual(result.zoom, 2.6);
});

// ── Empty / null cases ─────────────────────────────────────────────────────

test("computeAutoFitViewport: no players returns null", () => {
  const result = computeAutoFitViewport({
    phase: PHASE.PLAYING,
    p1: null,
    p2: null,
    focusPulse: null,
  });
  assert.equal(result, null);
});

test("computeAutoFitViewport: inactive players skipped", () => {
  const result = computeAutoFitViewport({
    phase: PHASE.PLAYING,
    p1: { x: 100, y: 100, active: false },
    p2: null,
    focusPulse: null,
  });
  // p1 is inactive, no other players → null.
  assert.equal(result, null);
});

// ── Setup-phase focus ──────────────────────────────────────────────────────

test("computeAutoFitViewport: SETUP1 phase frames only p1", () => {
  // p1 in corner, p2 far away -- under SETUP1, the result should ignore p2.
  const result = computeAutoFitViewport({
    phase: PHASE.SETUP1,
    p1: { x: 100, y: 100, active: true },
    p2: { x: 900, y: 900, active: true },
    focusPulse: null,
  });
  // pan should center near p1 (100, 100), not the midpoint (500, 500).
  // panX = cx - W/2, so cx = panX + W/2
  const cx = result.panX + W / 2;
  const cy = result.panY + H / 2;
  // Centroid should be ~100, not ~500.
  assert.ok(cx < 250, `cx should be near p1 (100), got ${cx}`);
  assert.ok(cy < 250, `cy should be near p1 (100), got ${cy}`);
});

test("computeAutoFitViewport: SETUP2 phase frames only p2", () => {
  const result = computeAutoFitViewport({
    phase: PHASE.SETUP2,
    p1: { x: 100, y: 100, active: true },
    p2: { x: 900, y: 900, active: true },
    focusPulse: null,
  });
  const cx = result.panX + W / 2;
  const cy = result.panY + H / 2;
  // Centroid should be ~900, not ~500.
  assert.ok(cx > 750, `cx should be near p2 (900), got ${cx}`);
  assert.ok(cy > 750, `cy should be near p2 (900), got ${cy}`);
});

// ── Weighted centroid: rovers (weight 3) outweigh generators (weight 1) ───

test("computeAutoFitViewport: rovers (weight 3) pull centroid harder than panels (weight 1)", () => {
  const result = computeAutoFitViewport({
    phase: PHASE.PLAYING,
    p1: {
      x: 100, y: 500, active: true,
      panels: [{ x: 900, y: 500 }, { x: 900, y: 500 }, { x: 900, y: 500 }],
    },
    p2: null,
    focusPulse: null,
  });
  // The rover at (100, 500) has weight 3 and the 3 panels at (900, 500)
  // have total weight 3. So the centroid should be at (500, 500).
  const cx = result.panX + W / 2;
  assert.ok(Math.abs(cx - 500) < 5, `weighted centroid should be ~500, got ${cx}`);
});

// ── Zoom clamping ──────────────────────────────────────────────────────────

test("computeAutoFitViewport: never zooms tighter than MAX (4.5) for a single point", () => {
  const result = computeAutoFitViewport({
    phase: PHASE.PLAYING,
    p1: { x: 500, y: 500, active: true },
    p2: null,
    focusPulse: null,
  });
  // A single point would in principle allow infinite zoom; we cap at 4.5.
  assert.ok(result.zoom <= 4.5, `zoom capped at 4.5, got ${result.zoom}`);
});

test("computeAutoFitViewport: never zooms looser than MIN (1.05) for sprawling activity", () => {
  // Two players in far corners with lots of assets each.
  const result = computeAutoFitViewport({
    phase: PHASE.PLAYING,
    p1: {
      x: 50, y: 50, active: true,
      panels: [{ x: 100, y: 100 }, { x: 150, y: 150 }],
      habitats: [{ x: 100, y: 200 }],
    },
    p2: {
      x: 1150, y: 1150, active: true,
      panels: [{ x: 1100, y: 1100 }, { x: 1050, y: 1050 }],
      habitats: [{ x: 1100, y: 1000 }],
    },
    focusPulse: null,
  });
  assert.ok(result.zoom >= 1.05, `zoom floor 1.05, got ${result.zoom}`);
});

// ── Pan centering ──────────────────────────────────────────────────────────

test("computeAutoFitViewport: pan offset positions centroid at canvas center", () => {
  // Single rover at (300, 400) → cx=300, cy=400.
  // panX = cx - W/2, panY = cy - H/2.
  const result = computeAutoFitViewport({
    phase: PHASE.PLAYING,
    p1: { x: 300, y: 400, active: true },
    p2: null,
    focusPulse: null,
  });
  assert.equal(result.panX, 300 - W / 2);
  assert.equal(result.panY, 400 - H / 2);
});

// ── Asset-type variants supported ──────────────────────────────────────────

test("computeAutoFitViewport: handles all expected asset arrays without throwing", () => {
  // A "rich" player with every kind of asset.
  const result = computeAutoFitViewport({
    phase: PHASE.PLAYING,
    p1: {
      x: 400, y: 400, active: true,
      extraRovers: [{ x: 410, y: 400 }],
      landingPad: { x: 400, y: 410 },
      landingPads: [{ x: 415, y: 420 }],
      extraPads: [{ x: 405, y: 425 }],
      habitat: { x: 395, y: 395 },
      habitats: [{ x: 398, y: 392 }],
      panels: [{ x: 388, y: 388 }],
      solarPanels: [{ x: 389, y: 389 }],
      reactors: [{ x: 380, y: 380 }],
      miners: [{ x: 375, y: 375 }],
      waypoints: [{ x: 500, y: 500 }],
    },
    p2: null,
    focusPulse: null,
  });
  assert.ok(result, "should return a valid viewport");
  assert.ok(Number.isFinite(result.zoom));
  assert.ok(Number.isFinite(result.panX));
  assert.ok(Number.isFinite(result.panY));
});

test("computeAutoFitViewport: skips non-finite coordinates", () => {
  const result = computeAutoFitViewport({
    phase: PHASE.PLAYING,
    p1: {
      x: 300, y: 400, active: true,
      extraRovers: [{ x: NaN, y: 400 }, { x: 500, y: Infinity }],
    },
    p2: null,
    focusPulse: null,
  });
  // The bad points should be silently skipped; the valid (300, 400) still anchors.
  const cx = result.panX + W / 2;
  const cy = result.panY + H / 2;
  assert.ok(Math.abs(cx - 300) < 5);
  assert.ok(Math.abs(cy - 400) < 5);
});
