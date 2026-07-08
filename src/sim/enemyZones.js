// ── Enemy safety-zone helpers ───────────────────────────────────────────────
//
// Pure helpers for computing and querying opponent safety zones. Used by:
//   - The rover physics injector in App.jsx's stepPlayer (avoids routing
//     a rover into a zone it would immediately violate).
//   - The bot AI for tactical positioning.
//
// "Buffer" is the radius multiplier; we sit 10% outside the strict safety
// radius so numerical jitter doesn't trip a violation right on the edge.

import { TIER_KEYS, ZONE_RADII_PX } from "./constants.js";
import { dist } from "./utils.js";

// v186: resolve an actor's effective per-tier scales (folds the legacy global
// zoneScale/safetyMult into every tier). Kept local to avoid a circular import
// with economy.js; mirrors economy.effectiveTierScales.
function tierScalesOf(p) {
  const ts = (p && p.tierScale) || { core: 1, harmonization: 1, coordination: 1 };
  const legacy = ((Number.isFinite(p?.safetyMult) && p.safetyMult > 0) ? p.safetyMult : 1)
               * ((Number.isFinite(p?.zoneScale)  && p.zoneScale  > 0) ? p.zoneScale  : 1);
  const out = {};
  for (const k of TIER_KEYS) {
    const t = (Number.isFinite(ts[k]) && ts[k] > 0) ? ts[k] : 1;
    out[k] = t * legacy;
  }
  return out;
}
// The scale that governs the CORE exclusion, the only ring that scores a
// violation. Others (harmonization/coordination) are advisory buffers.
const coreScaleOf = (p) => tierScalesOf(p).core;

const ZONE_BUFFER = 1.10;

// Threshold below which a structure is considered destroyed and no longer
// enforces its safety zone. Matches the threshold used by simDay's deposit
// logic and the canvas safety-ring renderer.
const DESTROYED_HEALTH = 0.1;

/**
 * Build a list of opponent safety zones. Each zone is `{x, y, r}`.
 *
 * Destroyed structures (health <= DESTROYED_HEALTH) are excluded.
 *
 * @param {object|null} foe - Opponent player state.
 * @returns {Array<{x:number, y:number, r:number}>}
 */
export function buildEnemyZones(foe) {
  if (!foe) return [];
  const zones = [];
  const sh = foe.structureHealth || {};
  // v127/v186: the keep-out (violation) radius follows the CORE tier scale,
  // which now folds in the legacy safetyMult/zoneScale. Defaults to 1 so
  // existing behavior and tests are unchanged.
  const mult = coreScaleOf(foe);

  // v190: every asset's keep-out (violation) ring is the SAME uniform DLA Core
  // (0.1 km, ZONE_RADII_PX.core) regardless of type, a safety zone is a hazard
  // property, not a sprite property. The CORE tier scale still folds in the
  // legacy safetyMult/zoneScale via `mult`.
  const CORE = ZONE_RADII_PX.core;
  const addStructure = (point, rKey, healthArr, idx) => {
    const h = (healthArr?.[idx] ?? 1.0);
    if (h <= DESTROYED_HEALTH) return;
    zones.push({ x: point.x, y: point.y, r: CORE * ZONE_BUFFER * mult });
  };

  // Legacy single landingPad field (some older save games).
  if (foe.landingPad) {
    zones.push({ x: foe.landingPad.x, y: foe.landingPad.y, r: CORE * ZONE_BUFFER * mult });
  }
  (foe.landingPads || []).forEach((p, i) => addStructure(p, "pad",     sh.landingPads, i));
  (foe.panels      || []).forEach((p, i) => addStructure(p, "solar",   sh.panels,      i));
  (foe.reactors    || []).forEach((p, i) => addStructure(p, "reactor", sh.reactors,    i));
  (foe.habitats    || []).forEach((p, i) => addStructure(p, "habitat", sh.habitats,    i));

  // Primary rover (always projects a zone if it has a position).
  if (foe.x != null && foe.y != null) {
    zones.push({ x: foe.x, y: foe.y, r: CORE * ZONE_BUFFER * mult });
  }
  // Extra rovers (gated on health).
  (foe.extraRovers || []).forEach((er, i) => {
    if (!er) return;
    const h = (sh.extraRovers?.[i] ?? 1.0);
    if (h <= DESTROYED_HEALTH) return;
    zones.push({ x: er.x, y: er.y, r: CORE * ZONE_BUFFER * mult });
  });

  return zones;
}

// v192: union of every foe's keep-out zones, for N-actor avoidance (a rover
// must steer clear of ALL other actors' cores, not just one opponent's).
export function buildEnemyZonesMulti(foes) {
  const out = [];
  for (const f of (foes || [])) { if (f) out.push(...buildEnemyZones(f)); }
  return out;
}

/**
 * Return the first zone containing the point, or null.
 *
 * @param {Array<{x,y,r}>} zones
 * @param {number} px
 * @param {number} py
 * @returns {object|null}
 */
export function pointInAnyZone(zones, px, py) {
  for (const z of zones) {
    const dx = px - z.x;
    const dy = py - z.y;
    if (dx * dx + dy * dy < z.r * z.r) return z;
  }
  return null;
}

// Whether a structure's safety zone is exempt from counting as a violation
// under the current power-grid state. A shared grid means co-located solar and
// reactor generators are deconflicted by agreement, so their zones don't fire.
// Single source of truth shared by the scoring pass (applySafetyDecay) and the
// live render-loop BREACH halo, so the HUD and the score can never disagree.
export function isZoneExempt(type, sharedGridActive) {
  return !!sharedGridActive && (type === "solar" || type === "reactor");
}

// ── Safety-zone decay + violation counting ──────────────────────────────────
//
// The per-turn pass that decays each of an owner's structures by whether an
// enemy asset sits inside its safety zone, and tallies the owner's safety
// violations for scoring. This was duplicated almost verbatim in two ~70-line
// blocks in App.jsx (the live applyDay path and the headless bot-sim path);
// the inline comments there documented several past divergences that had to be
// hand-re-synced. Extracted here so both paths call ONE implementation and can
// never drift again.
//
// Structures whose health is at or below DESTROYED_HEALTH project no zone (no
// violation) but still take passive decay toward 0. Shared power grids exempt
// solar/reactor zones from counting as violations (generatorSharedSafe).
//
// The owner's primary rover is iterated as a rover-typed structure: its zone
// contributes to the owner's violation count, but its computed health is
// written to structureHealth.primaryRover, which no other code reads, so the
// primary rover is effectively invincible to decay (preserved behavior).
//
// Pure: all tunables are passed in. Returns the updated owner (new object,
// structureHealth merged so non-decayed fields like comsats survive) plus the
// damage dealt this pass.
//
// @param owner            player state
// @param enemyPositions   [{x,y}] all enemy asset positions to test against
// @param opts             { passiveDecay, hostileDecayEff, sharedGridActive }
export function applySafetyDecay(owner, enemyPositions, opts) {
  // v160: `countViolations` (default true) lets a caller take ONLY the physical
  // structure decay from this pass and tally the scoring `safetyViolations`
  // elsewhere. The live + headless resolution paths now attribute violations to
  // the SECOND ARRIVER (see attributeSafetyViolations below) instead of always
  // charging the zone owner, so they call this with countViolations:false and
  // add the attributed count themselves. Default stays true so existing callers
  // and the enemyZones tests are byte-identical.
  const { passiveDecay, hostileDecayEff, sharedGridActive, countViolations = true } = opts;
  const sh = { ...owner.structureHealth };
  const structTypes = [
    { key: "panels",       list: owner.panels || [],                type: "solar"   },
    { key: "reactors",     list: owner.reactors || [],              type: "reactor" },
    { key: "habitats",     list: owner.habitats || [],              type: "habitat" },
    { key: "primaryRover", list: [{ x: owner.x, y: owner.y }],      type: "rover"   },
    { key: "extraRovers",  list: owner.extraRovers || [],           type: "rover"   },
    { key: "landingPads",  list: owner.landingPads || [],           type: "pad"     },
  ];
  const newSH = {};
  let damageDone = 0;
  let violationCount = 0;

  for (const { key, list, type } of structTypes) {
    const healths = [...(sh[key] || list.map(() => 1.0))];
    for (let idx = 0; idx < list.length; idx++) {
      const struct = list[idx];
      // v190: uniform DLA Core keep-out for every asset, scaled by the owner's
      // declared core-ring size (so shrinking/expanding the Core ring changes
      // exactly the boundary that scores).
      const radius = ZONE_RADII_PX.core * coreScaleOf(owner);
      const ownerHealth = healths[idx] ?? 1.0;
      // Destroyed structures project no zone but keep decaying toward 0.
      if (ownerHealth <= DESTROYED_HEALTH) {
        healths[idx] = Math.max(0, ownerHealth - passiveDecay);
        continue;
      }
      const generatorSharedSafe = isZoneExempt(type, sharedGridActive);
      const inZone = !generatorSharedSafe && enemyPositions.some(ep => dist(ep, struct) < radius);
      const decay = inZone ? hostileDecayEff : passiveDecay;
      if (inZone) {
        damageDone += hostileDecayEff;
        if (countViolations) violationCount += 1;
      }
      healths[idx] = Math.max(0, ownerHealth - decay);
    }
    newSH[key] = healths;
  }

  return {
    updatedOwner: {
      ...owner,
      structureHealth: { ...sh, ...newSH },
      safetyViolations: (owner.safetyViolations ?? 0) + violationCount,
    },
    damageDone,
    violationCount,
  };
}

// ── Second-arriver violation attribution ─────────────────────────────────────
//
// v160. The reported rule: "whoever put their rover down first in that area is
// NOT the violator, the violation hurts the SECOND arriver." The old model
// (applySafetyDecay with countViolations) always charged the ZONE OWNER, i.e.
// the actor who was there FIRST, which is exactly backwards.
//
// A violation is one of an actor's keep-out zones (anchored to any non-destroyed
// structure or rover) being breached by an OPPOSING rover. We keep the existing
// "one violation per breached anchor" unit, but attribute it to the second
// arriver: of the two assets forming the overlap, whichever was PLACED LATER
// (higher `seq`) earns the violation; the earlier one is innocent.
//
// Placement order comes from an optional monotonic `seq` stamped at placement
// (App.jsx). Missing seq is treated as "newest" (+Infinity), so with no stamping
// at all the rule degrades to the intuitive default: the intruding (mobile)
// rover is the violator, because the owner's fixed anchor defines the location.
// Equal seq also charges the intruder for the same reason.
//
// Pure. Returns { v1, v2 } = violations to ADD to p1 and p2 this turn.

const SEQ_NEWEST = Number.POSITIVE_INFINITY;
const seqOf = (a) => (a && Number.isFinite(a.seq) ? a.seq : SEQ_NEWEST);

// The founding seq for a player's primary rover / base presence. Stamped as
// `foundingSeq` at base placement; absent → newest.
const foundingSeqOf = (p) =>
  p && Number.isFinite(p.foundingSeq) ? p.foundingSeq : SEQ_NEWEST;

// All of a player's opposing-rover intruders: primary + extras, non-destroyed,
// each carrying its placement seq.
function roverIntruders(p) {
  if (!p) return [];
  const sh = p.structureHealth || {};
  const out = [];
  if (p.x != null && p.y != null) out.push({ x: p.x, y: p.y, seq: foundingSeqOf(p) });
  (p.extraRovers || []).forEach((er, i) => {
    if (!er) return;
    if ((sh.extraRovers?.[i] ?? 1.0) <= DESTROYED_HEALTH) return;
    out.push({ x: er.x, y: er.y, seq: seqOf(er) });
  });
  return out;
}

// All of a player's keep-out anchors (zone-projecting assets), each with its
// radius and placement seq. Mirrors applySafetyDecay's structure list + the
// strict (unbuffered) SAFETY_RADIUS it scores against.
function zoneAnchors(p) {
  if (!p) return [];
  const sh = p.structureHealth || {};
  const scale = coreScaleOf(p); // v186: core tier drives violation scoring
  const out = [];
  const add = (pt, type, seq, healthArr, idx) => {
    if (!pt) return;
    const h = idx == null ? 1.0 : (healthArr?.[idx] ?? 1.0);
    if (h <= DESTROYED_HEALTH) return;
    out.push({ x: pt.x, y: pt.y, r: ZONE_RADII_PX.core * scale, type, seq });
  };
  (p.panels      || []).forEach((s, i) => add(s, "solar",   seqOf(s), sh.panels,      i));
  (p.reactors    || []).forEach((s, i) => add(s, "reactor", seqOf(s), sh.reactors,    i));
  (p.habitats    || []).forEach((s, i) => add(s, "habitat", seqOf(s), sh.habitats,    i));
  (p.landingPads || []).forEach((s, i) => add(s, "pad",     seqOf(s), sh.landingPads, i));
  // Primary rover anchor (its own zone can be breached by an enemy rover).
  if (p.x != null && p.y != null) add({ x: p.x, y: p.y }, "rover", foundingSeqOf(p), null, null);
  (p.extraRovers || []).forEach((er, i) => add(er, "rover", seqOf(er), sh.extraRovers, i));
  return out;
}

export function attributeSafetyViolations(p1, p2, opts = {}) {
  // Back-compat 2-actor wrapper over the N-actor attribution.
  const v = attributeSafetyViolationsN([p1, p2], opts);
  return { v1: v[0] || 0, v2: v[1] || 0 };
}

// v192: N-actor safety-violation attribution. For every ORDERED pair
// (owner O, breacher B ≠ O): each of O's keep-out anchors that a B rover sits
// inside earns one violation, charged to whichever of the two arrived SECOND
// (the innocent first-mover is never the violator). Owners waive violations
// against any actor they've granted a safety easement. Returns an array of
// per-actor violation counts (index = actor 0-based). With exactly two actors
// this is identical to the old pairwise rule.
export function attributeSafetyViolationsN(players, opts = {}) {
  const sharedGridActive = !!opts.sharedGridActive;
  // v206: governance regimes weight the violation increment. Under an
  // ITU-style registration regime the late party's breach costs double;
  // under an ATCM inspection regime every breach is observed (×1.5). The
  // weight flows through every downstream consumer (scoring, treaty-floor
  // multipliers, CSV exports) because it scales the attributed count itself.
  const vioWeight = opts.violationWeight ?? 1.0;
  const list = players || [];
  const v = list.map(() => 0);
  const rovers = list.map((p) => roverIntruders(p));
  for (let oi = 0; oi < list.length; oi++) {
    const owner = list[oi];
    if (!owner) continue;
    const anchors = zoneAnchors(owner);
    if (!anchors.length) continue;
    for (let bi = 0; bi < list.length; bi++) {
      if (bi === oi || !list[bi]) continue;
      // Owner waives all violations against an actor it granted an easement to.
      if ((owner.easements || []).includes(bi + 1)) continue;
      for (const anchor of anchors) {
        if (isZoneExempt(anchor.type, sharedGridActive)) continue;
        let minBreacherSeq = SEQ_NEWEST, breached = false;
        for (const r of rovers[bi]) {
          const dx = r.x - anchor.x, dy = r.y - anchor.y;
          if (dx * dx + dy * dy < anchor.r * anchor.r) {
            breached = true;
            if (r.seq < minBreacherSeq) minBreacherSeq = r.seq;
          }
        }
        if (!breached) continue;
        const ownerIsSecond = anchor.seq > minBreacherSeq;
        v[ownerIsSecond ? oi : bi] += vioWeight;
      }
    }
  }
  return v;
}

// ── Coordination-tier advisories (v171) ─────────────────────────────────────
// The Open Lunar 3-ring framework's MIDDLE tier ("coordinate before entry").
// This counts, per owner, how many of their zones have an enemy rover sitting in
// the coordination band, inside the coordination radius but OUTSIDE the inner
// exclusion (rovers in the exclusion are already counted as violations, not
// advisories). Purely informational: it drives a soft on-board cue and a
// facilitator tally, never the score. Honors easements and zoneScale (via
// zoneAnchors) and skips grid-exempt zones when the grid is shared.
export function coordinationIntrusions(p1, p2, { coordMult = 1.7, sharedGridActive = false } = {}) {
  let a1 = 0, a2 = 0;
  const scan = (owner, enemyRovers, oi) => {
    if (!owner) return;
    const enemyActorId = oi === 0 ? 2 : 1;
    if ((owner.easements || []).includes(enemyActorId)) return; // waived → no advisory
    for (const anchor of zoneAnchors(owner)) {
      if (isZoneExempt(anchor.type, sharedGridActive)) continue;
      const rEx2 = anchor.r * anchor.r;
      const rCo = anchor.r * coordMult, rCo2 = rCo * rCo;
      let inBand = false;
      for (const r of enemyRovers) {
        const dx = r.x - anchor.x, dy = r.y - anchor.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rEx2 && d2 < rCo2) { inBand = true; break; }
      }
      if (inBand) { if (oi === 0) a1 += 1; else a2 += 1; }
    }
  };
  scan(p1, roverIntruders(p2), 0);
  if (p2) scan(p2, roverIntruders(p1), 1);
  return { a1, a2 };
}
