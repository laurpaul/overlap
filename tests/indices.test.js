// Favorability index tests. These assert the qualitative structure the blog
// post argues for, not specific magnitudes (the post is explicit that the
// weights are unvalidated and the numbers are a first pass):
//
//   • PSRs score worst on LFI and SOFI, best on IFI.
//   • Sunlit rims score well on LFI/SOFI, poorly on IFI.
//   • A comms-dead PSR floor scores NEGATIVE SOFI (a "non-site").
//   • Deploying a comsat relay raises SOFI at a comms-dead site.
//   • No site saturates all three indices at once (the headline result).

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  landingFavorability, surfaceOpsFavorability, iceFavorability,
  siteIndices, sampleLayers, commsViability, commsPenalty,
  classifyIndices, computeIndexRasters, LFI_MAP, SOFI_MAP, IFI_MAP, INDEX_RANGES,
} from "../src/sim/indices.js";
import {
  PSR_MASK, SLOPE_MAP, ILLUM_MAP, EARTH_VIS_MAP,
  ICE_DEPTH_MAP, HYDROGEN_MAP, TEMPERATURE_MAP,
  pooledComsats, effectiveEarthVis,
} from "../src/sim/mapData.js";
import { W } from "../src/sim/constants.js";

// Two test sites.
const PSR = { x: 600, y: 520 };   // deep PSR floor: dark, cold, ice-rich, comms-dead, flat
const RIM = { x: 300, y: 300 };   // sunlit rim: bright, warm, no ice, comms-visible, gentle

function setPixel(p, { psr, slope, illum, earth, ice, h2, temp }) {
  const i = p.y * W + p.x;
  PSR_MASK[i] = psr ? 1 : 0;
  SLOPE_MAP[i] = slope;
  ILLUM_MAP[i] = illum;
  EARTH_VIS_MAP[i] = earth;
  ICE_DEPTH_MAP[i] = ice;
  HYDROGEN_MAP[i] = h2;
  TEMPERATURE_MAP[i] = temp;
}

beforeEach(() => {
  // Clear a neighborhood around each site so the roughness proxy is clean.
  for (const p of [PSR, RIM]) {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const i = (p.y + dy) * W + (p.x + dx);
        PSR_MASK[i] = 0; SLOPE_MAP[i] = 0; ILLUM_MAP[i] = 0;
        EARTH_VIS_MAP[i] = 0; ICE_DEPTH_MAP[i] = 0;
        HYDROGEN_MAP[i] = 0; TEMPERATURE_MAP[i] = 0;
      }
  }
  setPixel(PSR, { psr: true,  slope: 3,  illum: 0.0,  earth: 0.05, ice: 0.85, h2: 0.9, temp: 0.05 });
  setPixel(RIM, { psr: false, slope: 4,  illum: 0.9,  earth: 0.8,  ice: 0.05, h2: 0.1, temp: 0.75 });
});

test("PSR is landing-hostile: LFI(rim) > LFI(psr)", () => {
  const psr = landingFavorability(sampleLayers(PSR.x, PSR.y));
  const rim = landingFavorability(sampleLayers(RIM.x, RIM.y));
  assert.ok(rim > psr, `expected rim LFI ${rim} > psr LFI ${psr}`);
});

test("PSR is operations-hostile: SOFI(rim) > SOFI(psr) and PSR floor is a non-site (<0)", () => {
  const psr = surfaceOpsFavorability(sampleLayers(PSR.x, PSR.y));
  const rim = surfaceOpsFavorability(sampleLayers(RIM.x, RIM.y));
  assert.ok(rim > psr, `expected rim SOFI ${rim} > psr SOFI ${psr}`);
  assert.ok(psr < 0, `expected comms-dead PSR floor SOFI < 0, got ${psr}`);
});

test("PSR is the ice target: IFI(psr) > IFI(rim)", () => {
  const psr = iceFavorability(sampleLayers(PSR.x, PSR.y));
  const rim = iceFavorability(sampleLayers(RIM.x, RIM.y));
  assert.ok(psr > rim, `expected psr IFI ${psr} > rim IFI ${rim}`);
});

test("a comsat relay lifts a comms-dead site out of negative SOFI", () => {
  const without = surfaceOpsFavorability(sampleLayers(PSR.x, PSR.y, null));
  // A relay within range at the same spot pushes effectiveEarthVis to ~1.
  const relayed = sampleLayers(PSR.x, PSR.y, [{ x: PSR.x, y: PSR.y }]);
  const withRelay = surfaceOpsFavorability(relayed);
  assert.ok(withRelay > without, `relay should raise SOFI: ${withRelay} > ${without}`);
});

test("no site saturates all three indices at once (the headline result)", () => {
  for (const p of [PSR, RIM]) {
    const { viablePhases } = siteIndices(p.x, p.y);
    assert.ok(viablePhases.length < 3, `site at ${p.x},${p.y} should not be viable for all three: ${viablePhases}`);
  }
});

test("comms penalty is monotonic and bounded by 0.30", () => {
  assert.ok(commsPenalty(0) > 0.27, "near-max penalty at zero Earth vis");
  assert.ok(commsPenalty(1) < 0.03, "near-zero penalty at full Earth vis");
  assert.ok(commsPenalty(0.1) > commsPenalty(0.6), "penalty decreases as Earth vis rises");
  assert.ok(commsViability(0.325) > 0.49 && commsViability(0.325) < 0.51, "sigmoid centered ~0.325");
});

test("classifyIndices flags an ice-only comms non-site", () => {
  const c = classifyIndices(0.18, -0.05, 0.85);
  assert.equal(c.best, "ice");
  assert.ok(c.commsNonSite);
  assert.match(c.verdict, /non-site/);
});

test("computeIndexRasters fills buffers: ice raster high at PSR, NaN where no data", () => {
  computeIndexRasters();
  const iPSR = PSR.y * W + PSR.x;
  const iRIM = RIM.y * W + RIM.x;
  assert.ok(IFI_MAP[iPSR] > IFI_MAP[iRIM], "IFI raster should be higher at the PSR floor");
  assert.ok(LFI_MAP[iRIM] > LFI_MAP[iPSR], "LFI raster should be higher at the sunlit rim");
  // a far-off empty pixel has no terrain data -> NaN, so the renderer skips it
  const iEmpty = 50 * W + 50;
  assert.ok(Number.isNaN(LFI_MAP[iEmpty]), "empty background should be NaN in the raster");
  assert.ok(INDEX_RANGES.ifi[1] >= INDEX_RANGES.ifi[0], "ice range populated");
});

// ── Blog Post 2 presentation + adjacency additions ──────────────────────────
import {
  INDEX_CARDS, favorabilityClass, nearestFavorableSite,
} from "../src/sim/indices.js";

test("INDEX_CARDS: three cards with questions and weights that sum to ~1", () => {
  assert.equal(INDEX_CARDS.length, 3);
  const keys = INDEX_CARDS.map((c) => c.key);
  assert.deepEqual(keys, ["lfi", "sofi", "ifi"]);
  for (const c of INDEX_CARDS) {
    assert.ok(c.question.endsWith("?"), `${c.abbr} should pose a question`);
    assert.ok(c.accent && c.weights.length >= 4);
    const sum = c.weights.reduce((s, [, w]) => s + w, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${c.abbr} weights sum ${sum}`);
  }
});

test("favorabilityClass: negative is a non-site, ramps to Strong", () => {
  assert.equal(favorabilityClass(-0.1).label, "Non-site");
  assert.equal(favorabilityClass(0.05).label, "Poor");
  assert.equal(favorabilityClass(0.2).label, "Marginal");
  assert.equal(favorabilityClass(0.45).label, "Favorable");
  assert.equal(favorabilityClass(0.8).label, "Strong");
  // monotonic non-decreasing tier
  let prev = -1;
  for (const v of [-0.5, 0, 0.16, 0.31, 0.61, 0.9]) {
    const t = favorabilityClass(v).t;
    assert.ok(t >= prev, "tier should not decrease with value");
    prev = t;
  }
});

test("nearestFavorableSite: finds the nearest viable pixel, capped", () => {
  // 5x5 grid, viable (1.0) only at (4,0); everything else 0.
  const w = 5, h = 5;
  const m = new Float32Array(w * h);
  m[0 * w + 4] = 1.0; // (x=4,y=0)
  // From (0,0): nearest viable is (4,0), dist 4.
  const s = nearestFavorableSite(m, w, h, 0, 0, 0.3, 10);
  assert.deepEqual([s.x, s.y], [4, 0]);
  assert.equal(s.dist, 4);
  // Self-hit returns dist 0.
  const self = nearestFavorableSite(m, w, h, 4, 0, 0.3, 10);
  assert.equal(self.dist, 0);
  // Cap shorter than the distance returns null.
  assert.equal(nearestFavorableSite(m, w, h, 0, 0, 0.3, 2), null);
  // No viable pixel anywhere returns null.
  assert.equal(nearestFavorableSite(new Float32Array(w * h), w, h, 2, 2, 0.3, 10), null);
});

// ── v106: shared comms grid pools relay coverage ────────────────────────────

test("pooledComsats: independent comms uses only own relays", () => {
  const own = [{ x: 100, y: 100 }];
  const other = [{ x: 500, y: 500 }];
  assert.deepEqual(pooledComsats(own, other, false), own);
});

test("pooledComsats: shared comms pools both actors' relays", () => {
  const own = [{ x: 100, y: 100 }];
  const other = [{ x: 500, y: 500 }];
  const pooled = pooledComsats(own, other, true);
  assert.equal(pooled.length, 2);
  assert.ok(pooled.includes(own[0]) && pooled.includes(other[0]));
});

test("pooledComsats: null-safe", () => {
  assert.deepEqual(pooledComsats(null, null, true), []);
  assert.deepEqual(pooledComsats(null, [{ x: 1, y: 1 }], false), []);
});

test("shared comms lifts a rover into coverage via the partner's relay", () => {
  // A site with no own relay nearby; the partner has a relay right on it.
  const site = { x: 600, y: 520 };
  const own = [];
  const partner = [{ x: 600, y: 520 }];
  const independent = effectiveEarthVis(site.x, site.y, pooledComsats(own, partner, false));
  const shared      = effectiveEarthVis(site.x, site.y, pooledComsats(own, partner, true));
  assert.ok(shared > independent,
    `sharing comms should raise effective Earth visibility: ${shared} > ${independent}`);
});
