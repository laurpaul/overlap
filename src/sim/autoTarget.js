// ── Rover auto-targeting ────────────────────────────────────────────────────
//
// Pure function. Given a rover, its owner's state, and current crater
// health, returns a synthetic waypoint (or null if the rover should stay
// put). Rules in priority order:
//
//   0. CRITICAL: low battery → return to recharge before stranding.
//      Hysteresis: a rover already in recharge mode stays charging until
//      power > ROVER_RECHARGE_HIGH. A rover not in recharge mode only
//      starts when power < ROVER_RECHARGE_LOW. Eliminates the 49↔51%
//      bounce that happened with a single threshold.
//   1. Ice ≥ ICE_DEPOSIT_RETURN_FRAC of capacity → route to nearest functional
//      landing pad (well, habitat, see below).
//   2. User-set aimDirection → snap onto the closest PSR along that
//      bearing (forward + 1.5×lateral); fall through to a distant point
//      if no PSR matches.
//   3. Idle → aim at nearest unmined PSR via its mineX/mineY (a real PSR
//      pixel, not the geometric centroid which can fall outside C-shaped
//      craters).
//   4. None of the above → null.
//
// Each returned waypoint has a `reason` tag: "recharge" | "return" |
// "aim" | "autoseek". simDay reads `_recharge` (set by the caller from
// reason === "recharge") to engage the dwell branch.

import {
  W, H, POWER_CAP, ICE_CAP, ROVER_RECHARGE_LOW, ROVER_RECHARGE_HIGH,
  ROVER_STEP, POWER_BASE_DRAIN, POWER_MOVE_DRAIN, POWER_MINE_DRAIN,
} from "./constants.js";
import { CRATER_DATA } from "./mapData.js";
import { daysUntilNight } from "./utils.js";

// v174 (ice-flow fix): a rover used to only head home to deposit at 95% of its
// hopper. With the old ~0.8 kg/day mine rate vs an 800 kg hopper that point was
// never reached, so ice never banked. Now the hopper is 80 kg and a rover runs
// a PARTIAL load home once it's half full, so ice flows steadily and a stalled
// rover never sits on a near-full load forever. Lowered to 0.5.
const ICE_DEPOSIT_RETURN_FRAC = 0.5;
// A rover holding at least this fraction of a hopper will bank it even if it
// can't find a fresh crater to keep mining (rather than idling on the ice with
// a partial load it never delivers).
const ICE_BANK_MIN_FRAC = 0.15;

// v206: collect the rover's recharge destinations, generators first (the
// only ACTUAL supply sources under allocateDailyPower), pads/habitats as a
// fallback. Extracted from rule 0 so the energy-feasibility check below can
// reuse the same list.
export function collectRechargeHomes(playerState, opts = {}) {
  // v207: night-aware. During the night cycle solar panels output nothing
  // (power.js getGeneratorOutput, and as of v207 the dwell trickle too), so
  // routing a dying rover to a dark panel is routing it to a dead charger.
  // At night, reactors are the only true generators; panels join the pad/
  // habitat fallback tier instead of the primary tier.
  const night = !!opts.night;
  const homes = [];
  const padHealths = playerState.structureHealth?.landingPads || [];
  const habHealths = playerState.structureHealth?.habitats    || [];
  const panHealths = playerState.structureHealth?.panels      || [];
  const reaHealths = playerState.structureHealth?.reactors    || [];
  if (!night) {
    (playerState.panels || []).forEach((p, i) => {
      if ((panHealths[i] ?? 1.0) > 0.1) homes.push({ x: p.x, y: p.y });
    });
  }
  (playerState.reactors || []).forEach((p, i) => {
    if ((reaHealths[i] ?? 1.0) > 0.1) homes.push({ x: p.x, y: p.y });
  });
  if (homes.length === 0) {
    if (playerState.landingPad) {
      homes.push({ x: playerState.landingPad.x, y: playerState.landingPad.y });
    }
    (playerState.landingPads || []).forEach((p, i) => {
      if ((padHealths[i] ?? 1.0) > 0.1) homes.push({ x: p.x, y: p.y });
    });
    (playerState.habitats || []).forEach((h, i) => {
      if ((habHealths[i] ?? 1.0) > 0.1) homes.push({ x: h.x, y: h.y });
    });
    if (night) {
      // Last resort at night: a dark panel. It charges nothing until dawn,
      // but parking beside a future generator beats dying mid-regolith.
      (playerState.panels || []).forEach((p, i) => {
        if ((panHealths[i] ?? 1.0) > 0.1) homes.push({ x: p.x, y: p.y });
      });
    }
  }
  return homes;
}

// ── v206: round-trip energy budget ──────────────────────────────────────────
//
// The July pilot Monte Carlo measured the failure the July 1 call complained
// about: 52-95% of bot sessions stranded a rover, because autoseek happily
// dispatched a 41%-battery rover (just above the recharge trigger) to a PSR
// it could reach but never leave. Before committing to an outbound mining
// target, estimate the full trip:
//
//   out:   distance / ROVER_STEP travel-days at (base + move) drain,
//          padded ×TERRAIN_MARGIN for slope power multipliers;
//   dwell: MINE_DWELL_DAYS of mining at (base + mine) drain;
//   back:  target → nearest recharge home, padded ×LOADED_MARGIN because
//          the return leg is uphill-and-loaded (load factor scales with ice);
//   plus a flat RESERVE_FRAC of POWER_CAP.
//
// Deliberately conservative: a false "infeasible" costs one recharge detour,
// a false "feasible" strands the rover for the rest of the session.
const TERRAIN_MARGIN  = 1.35;
const LOADED_MARGIN   = 1.55;
const MINE_DWELL_DAYS = 3;
const RESERVE_FRAC    = 0.08;

export function estimateRoundTripNeed(from, target, homes) {
  const dOut = Math.hypot(target.x - from.x, target.y - from.y);
  let dBack = dOut; // no homes → assume symmetric return to start
  if (homes && homes.length > 0) {
    dBack = Infinity;
    for (const h of homes) {
      const d = Math.hypot(target.x - h.x, target.y - h.y);
      if (d < dBack) dBack = d;
    }
  }
  const perTravelDay = POWER_BASE_DRAIN + POWER_MOVE_DRAIN;
  const outCost   = (dOut  / ROVER_STEP) * perTravelDay * TERRAIN_MARGIN;
  const backCost  = (dBack / ROVER_STEP) * perTravelDay * TERRAIN_MARGIN * LOADED_MARGIN;
  const dwellCost = MINE_DWELL_DAYS * (POWER_BASE_DRAIN + POWER_MINE_DRAIN);
  return outCost + dwellCost + backCost + RESERVE_FRAC * POWER_CAP;
}

// v206: the recharge trigger, shared by pickRoverTarget's rule 0 and the
// per-day injectAutoTarget gate in App.jsx (whose own fixed hysteresis was
// the actual stranding trap: bots mined until the flat 40% line while the
// LOADED trip home cost more than 40%). The trigger is the max of the
// hysteresis threshold and the estimated cost home ×margins +reserve,
// clamped to 0.9·POWER_CAP so an out-of-range long-hauler doesn't park in
// a permanent recharge spiral.
export function rechargeTriggerThreshold(rover, playerState, rx = rover?.x, ry = rover?.y, opts = {}) {
  const alreadyRecharging = !!rover?._recharging;
  const hysteresisThreshold = alreadyRecharging
    ? POWER_CAP * ROVER_RECHARGE_HIGH
    : POWER_CAP * ROVER_RECHARGE_LOW;
  // v209: PREDICTIVE night handling. v208's reserve only engaged once it was
  // already dark, but the cause-attributed telemetry shows rovers dying when
  // night FALLS mid-operation, the trip home is longer than the daylight
  // left. The cycle is deterministic (7 light / 7 dark), so estimate the trip
  // home first, and if night would begin before the rover could complete it
  // (+1 day of slack), treat the situation as night NOW: reactor-first home
  // tiering plus the night reserve. Two-pass because the home tier depends
  // on the night flag and the flag depends on the trip length.
  const dayHomes = collectRechargeHomes(playerState, { ...opts, night: false });
  let tripDays = 0;
  if (dayHomes.length > 0 && Number.isFinite(rx) && Number.isFinite(ry)) {
    let dHomeDay = Infinity;
    for (const h of dayHomes) {
      const d = Math.hypot(h.x - rx, h.y - ry);
      if (d < dHomeDay) dHomeDay = d;
    }
    tripDays = (dHomeDay / ROVER_STEP) * TERRAIN_MARGIN;
  }
  const nightSoon = opts.globalDay != null
    ? daysUntilNight(opts.globalDay) <= tripDays + 1
    : false;
  const effectiveNight = !!opts.night || nightSoon;
  const homes = effectiveNight === !!opts.night
    ? (opts.night ? collectRechargeHomes(playerState, opts) : dayHomes)
    : collectRechargeHomes(playerState, { ...opts, night: effectiveNight });
  let dynamicNeed = 0;
  if (homes.length > 0 && Number.isFinite(rx) && Number.isFinite(ry)) {
    let dHome = Infinity;
    for (const h of homes) {
      const d = Math.hypot(h.x - rx, h.y - ry);
      if (d < dHome) dHome = d;
    }
    const perTravelDay = POWER_BASE_DRAIN + POWER_MOVE_DRAIN;
    // v208: night reserve, head home earlier, sit out the dark. v209: also
    // applied when night is merely IMMINENT relative to the trip home.
    const nightReserve = effectiveNight ? POWER_CAP * 0.12 : 0;
    dynamicNeed = Math.min(
      POWER_CAP * 0.9,
      (dHome / ROVER_STEP) * perTravelDay * TERRAIN_MARGIN * LOADED_MARGIN
        + RESERVE_FRAC * POWER_CAP + nightReserve
    );
  }
  return Math.max(hysteresisThreshold, dynamicNeed);
}

export function shouldRecharge(rover, playerState, opts = {}) {
  return (rover?.power ?? 1.0) < rechargeTriggerThreshold(rover, playerState, rover?.x, rover?.y, opts);
}

// v208: deposit-destination picker. The v207 analyzer surfaced a 17-30%
// deposit-block rate; the cause is here, the "return" rules picked the
// nearest HEALTHY habitat and ignored habitatPower, so rovers hauled full
// hoppers to browned-out habs where simDay refuses the deposit. Deposits
// only score at habitats that are both intact AND powered, so route there
// first; an unpowered-but-healthy hab is the fallback (it may re-power by
// arrival), and only then pads.
export function pickDepositHabitat(playerState, rx, ry) {
  const habHealths = playerState.structureHealth?.habitats || [];
  const habPower = playerState.habitatPower || [];
  const nearest = (list) => {
    let best = null, bestD = Infinity;
    for (const h of list) {
      const d = (h.x - rx) ** 2 + (h.y - ry) ** 2;
      if (d < bestD) { bestD = d; best = h; }
    }
    return best;
  };
  const healthy = (playerState.habitats || []).filter((_, i) => (habHealths[i] ?? 1.0) > 0.1);
  const powered = (playerState.habitats || []).filter((_, i) =>
    (habHealths[i] ?? 1.0) > 0.1 && (habPower[i] ?? 1) > 0);
  return nearest(powered) || nearest(healthy);
}

export function pickRoverTarget(rover, playerState, craterHealthArr, opts = {}) {
  if (!rover) return null;
  const { x: rx, y: ry, ice: rIce, aimDirection } = rover;
  const rPower = rover.power ?? 1.0;

  // 0. Recharge with hysteresis, v206: plus a DYNAMIC floor.
  // The A/B batch on identical seeds showed the stranding trap is not the
  // outbound dispatch: bots mine until the fixed 40% trigger, and the LOADED
  // trip home from deep in a PSR costs more than 40% of the battery. The
  // trigger is now max(hysteresis threshold, estimated cost home ×margins
  // +reserve), clamped to 0.9·POWER_CAP so an out-of-range long-hauler (which
  // could never afford the trip home from here at ANY charge) doesn't park
  // in a permanent recharge spiral.
  const triggerThreshold = rechargeTriggerThreshold(rover, playerState, rx, ry, opts);
  if (rPower < triggerThreshold) {
    const homes = collectRechargeHomes(playerState, opts);
    if (homes.length > 0) {
      let best = null, bestD = Infinity;
      for (const h of homes) {
        const d = (h.x - rx) ** 2 + (h.y - ry) ** 2;
        if (d < bestD) { bestD = d; best = h; }
      }
      if (best) return { x: best.x, y: best.y, reason: "recharge" };
    }
  }

  // 1. Full → nearest functional habitat.
  // v27: was "nearest pad". Pads are for PICKUP (rover collects a
  // delivered asset and ferries it to placement). Deposits happen at
  // habitats -- see simDay.js line ~124. Sending a full rover to a pad
  // was a routing dead-end: the rover arrived, sat there, and didn't
  // deposit because pads aren't deposit sites. Fall back to nearest
  // landing pad only if there are no functional habitats (rare, but
  // keeps the rover moving rather than stranding it on PSR ice).
  if (rIce >= ICE_CAP * ICE_DEPOSIT_RETURN_FRAC) {
    const bestHab = pickDepositHabitat(playerState, rx, ry);
    if (bestHab) return { x: bestHab.x, y: bestHab.y, reason: "return" };
    // No functional habitat available -- fall back to a pad just so the
    // rover moves somewhere sensible. simDay won't deposit there, but
    // the player can see the rover is parked and resupply / rebuild.
    const pads = [];
    const padHealths = playerState.structureHealth?.landingPads || [];
    if (playerState.landingPad) {
      pads.push({ x: playerState.landingPad.x, y: playerState.landingPad.y });
    }
    (playerState.landingPads || []).forEach((p, i) => {
      if ((padHealths[i] ?? 1.0) > 0.1) pads.push({ x: p.x, y: p.y });
    });
    if (pads.length > 0) {
      let best = null, bestD = Infinity;
      for (const pd of pads) {
        const d = (pd.x - rx) ** 2 + (pd.y - ry) ** 2;
        if (d < bestD) { bestD = d; best = pd; }
      }
      return best ? { x: best.x, y: best.y, reason: "return" } : null;
    }
  }

  // 2. User-set aimDirection.
  if (aimDirection != null && Number.isFinite(aimDirection)) {
    const cos_a = Math.cos(aimDirection);
    const sin_a = Math.sin(aimDirection);
    if (CRATER_DATA.length > 0) {
      let best = null, bestScore = Infinity;
      for (let ci = 0; ci < CRATER_DATA.length; ci++) {
        const h = craterHealthArr[ci] ?? 1.0;
        if (h < 0.15) continue;
        const c = CRATER_DATA[ci];
        const tx = c.mineX ?? c.cx;
        const ty = c.mineY ?? c.cy;
        const dx = tx - rx, dy = ty - ry;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) continue;
        // forward = how far along the aim the crater is (positive = ahead)
        // lateral = how far off-axis
        const forward = dx * cos_a + dy * sin_a;
        if (forward < 0) continue;  // behind the rover
        const lateral = Math.abs(dx * -sin_a + dy * cos_a);
        // Prefer craters ahead with small lateral deviation.
        const score = forward + 1.5 * lateral;
        if (score < bestScore) {
          bestScore = score;
          best = { x: tx, y: ty };
        }
      }
      if (best) return { x: best.x, y: best.y, reason: "aim" };
    }
    // No PSR along the bearing -- point the rover at a distant edge.
    const FAR = 1200;
    const tx = Math.round(rx + cos_a * FAR);
    const ty = Math.round(ry + sin_a * FAR);
    const cx = Math.max(20, Math.min(W  - 20, tx));
    const cy = Math.max(20, Math.min(H  - 20, ty));
    return { x: cx, y: cy, reason: "aim" };
  }

  // 3. Idle → nearest unmined PSR the rover can actually AFFORD.
  // v206: candidates are ranked by distance as before, but each must pass
  // the round-trip energy budget (out + mine dwell + loaded return + reserve).
  // A crater the rover can reach but not leave is not a target, it's a trap , 
  // the pilot Monte Carlo measured that trap firing in 52-95% of sessions.
  // If no crater is affordable on the current charge, top up first.
  if (CRATER_DATA.length > 0) {
    const homes = collectRechargeHomes(playerState, opts);
    const candidates = [];
    for (let ci = 0; ci < CRATER_DATA.length; ci++) {
      const h = craterHealthArr[ci] ?? 1.0;
      if (h < 0.15) continue;
      const c = CRATER_DATA[ci];
      const tx = c.mineX ?? c.cx;
      const ty = c.mineY ?? c.cy;
      candidates.push({ x: tx, y: ty, d2: (tx - rx) ** 2 + (ty - ry) ** 2 });
    }
    candidates.sort((a, b) => a.d2 - b.d2);
    let cheapestNeed = Infinity, nearest = null;
    for (const cand of candidates) {
      const need = estimateRoundTripNeed({ x: rx, y: ry }, cand, homes);
      if (rPower >= need) return { x: cand.x, y: cand.y, reason: "autoseek" };
      if (need < cheapestNeed) cheapestNeed = need;
      if (!nearest) nearest = cand;
    }
    if (nearest) {
      // No candidate is affordable on the CURRENT charge. Two cases:
      //  · A full battery would cover the cheapest trip → top up first
      //    (this is the marginal-charge trap the pilot measured firing in
      //    52-95% of sessions: dispatched at 41%, stranded in shadow).
      //  · Even a full battery can't cover it → long-haul territory. Blocking
      //    here would park the rover forever, so keep the legacy behavior and
      //    venture toward the nearest crater; mid-route recharge hysteresis
      //    still applies. Fixing long hauls properly needs waystations
      //    (roadmap), not a veto.
      if (cheapestNeed <= POWER_CAP * 0.95 && homes.length > 0) {
        let best = null, bestD = Infinity;
        for (const h of homes) {
          const d = (h.x - rx) ** 2 + (h.y - ry) ** 2;
          if (d < bestD) { bestD = d; best = h; }
        }
        if (best) return { x: best.x, y: best.y, reason: "recharge" };
      }
      return { x: nearest.x, y: nearest.y, reason: "autoseek" };
    }
  }

  // 4. Nothing left to mine, but we're holding a non-trivial load → bank it at
  //    a habitat instead of idling on the ice with undeliverable cargo. v174:
  //    without this a rover that depleted every reachable crater (or whose only
  //    craters are all below the 0.15 health floor) would sit forever holding a
  //    partial hopper that never showed up in iceDeposited.
  if (rIce >= ICE_CAP * ICE_BANK_MIN_FRAC) {
    const best = pickDepositHabitat(playerState, rx, ry);
    if (best) return { x: best.x, y: best.y, reason: "return" };
  }
  return null;
}
