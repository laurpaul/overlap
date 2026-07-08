// ── Per-day simulation step ─────────────────────────────────────────────────
//
// `simDay` advances one player's state by one game day. Pure-ish: reads
// from the map-data singletons (PSR_MASK, ICE_DEPTH_MAP, SLOPE_MAP) but
// otherwise takes and returns plain state objects.
//
// Override knobs (`po`):
//   ROVER_STEP, POWER_MOVE_DRAIN, POWER_MINE_DRAIN, BASE_MINE_RATE, DEPLETION_RATE
//
// Returns a new state with `events: [...]` appended for the log.

import {
  W, H,
  ROVER_STEP as DEFAULT_ROVER_STEP,
  ROVER_REACH,
  POWER_BASE_DRAIN,
  POWER_MOVE_DRAIN as DEFAULT_POWER_MOVE_DRAIN,
  POWER_MINE_DRAIN as DEFAULT_POWER_MINE_DRAIN,
  PANEL_RIDGE, REACTOR_OUTPUT,
  POWER_CAP, HABITAT_POWER_INIT, ICE_CAP,
  SAFETY_RADIUS, CRATER_REFERENCE_SIZE,
  BASE_MINE_RATE as DEFAULT_BASE_MINE_RATE,
  DEPLETION_RATE as DEFAULT_DEPLETION_RATE,
  PX_ICE_CAP_BASE, PX_ICE_CAP_FLOOR,
} from "./constants.js";
import {
  PSR_MASK, PIXEL_CRATER, ICE_DEPTH_MAP, SLOPE_MAP, RIDGE_MASK, CRATER_DATA,
} from "./mapData.js";
import { dist, isNight, stepToward } from "./utils.js";
import { roverSlopeFactor, roverPowerFactor } from "./physics.js";
import { calcRdMineBonus } from "./economy.js";

// Per-pixel mining cap (kg). At full local ice fraction, ~150 kg can be
// extracted from one m² of regolith down to ~1 m depth.
function pxIceCap(iceFrac) {
  return PX_ICE_CAP_BASE * (PX_ICE_CAP_FLOOR + (1 - PX_ICE_CAP_FLOOR) * iceFrac);
}

// Find the next-nearest unmined pixel in the same crater. Used when the
// current pixel taps out so the rover can hop to a fresh one without
// returning home. Returns the linear pixel index or -1 if everything in
// the crater is depleted.
function findNextFreshPixel(craterIdx, fromX, fromY, mineMap) {
  const craterPixels = CRATER_DATA[craterIdx]?.pixels || [];
  let bestPx = -1, bestD = Infinity;
  for (const px of craterPixels) {
    const fromPx = fromY * W + fromX;
    if (px === fromPx) continue;
    const otherMined = mineMap[px] || 0;
    const otherIce   = ICE_DEPTH_MAP[px] || 0;
    const otherCap   = pxIceCap(otherIce);
    if (otherMined >= otherCap * 0.99) continue;
    const ox = px % W, oy = (px / W) | 0;
    const d = (ox - fromX) ** 2 + (oy - fromY) ** 2;
    if (d < bestD) { bestD = d; bestPx = px; }
  }
  return bestPx;
}

// v69: nearest actual PSR pixel within `maxR` of (fromX, fromY), or -1.
// The rover settles ROVER_REACH short of its waypoint; when the auto-seek
// anchor sits near a small or C-shaped PSR edge, that landing spot can fall
// just OUTSIDE the PSR mask, so onPSR reads false and the rover idles next to
// the ice it came for. This lets it nose the last few pixels into the shadow
// to actually reach a mineable pixel. Bounded by ROVER_REACH so it only snaps
// onto ice it could physically touch this turn, not a teleport.
function snapToNearbyPSR(fromX, fromY, maxR) {
  let bestPx = -1, bestD = Infinity;
  const r = Math.ceil(maxR);
  for (let dy = -r; dy <= r; dy++) {
    const py = fromY + dy;
    if (py < 0 || py >= H) continue;
    for (let dx = -r; dx <= r; dx++) {
      const px = fromX + dx;
      if (px < 0 || px >= W) continue;
      const d = dx * dx + dy * dy;
      if (d > maxR * maxR || d >= bestD) continue;
      const idx = py * W + px;
      if (PSR_MASK[idx] === 1 && PIXEL_CRATER[idx] >= 0) { bestD = d; bestPx = idx; }
    }
  }
  return bestPx;
}

export function simDay(s, craterHealth, globalDay, po = {}) {
  // Inactive / pre-arrival rovers do nothing.
  if (s?.active === false || globalDay < (s?.arrivalDay ?? 0)) {
    return { ...s, status: "idle" };
  }

  // Resolve physics overrides.
  const ROVER_STEP_       = po.ROVER_STEP       ?? DEFAULT_ROVER_STEP;
  const POWER_MOVE_DRAIN_ = po.POWER_MOVE_DRAIN ?? DEFAULT_POWER_MOVE_DRAIN;
  const POWER_MINE_DRAIN_ = po.POWER_MINE_DRAIN ?? DEFAULT_POWER_MINE_DRAIN;
  const BASE_MINE_RATE_   = po.BASE_MINE_RATE   ?? DEFAULT_BASE_MINE_RATE;
  const DEPLETION_RATE_   = po.DEPLETION_RATE   ?? DEFAULT_DEPLETION_RATE;

  let {
    x, y, power, ice, base, panels, reactors, habitats,
    pendingDeliveries, carrying, waypoints, currentWaypoint, mineMap,
  } = s;

  let habitatPower = [...(s.habitatPower || (habitats || []).map(() => HABITAT_POWER_INIT))];

  // v27: spread the source structureHealth first so untouched keys (notably
  // `comsats`, plus any future extension fields) survive the simDay round-
  // trip. The 5 keys below are the ones simDay actually mutates. Without
  // the spread, the returned `structureHealth` would drop comsats every
  // game day, silently healing damaged ones back to full. (Matches the
  // same fix made earlier to clonePlayerState, applyDecay, and resupply.)
  let structureHealth = {
    ...(s.structureHealth || {}),
    panels:      [...(s.structureHealth?.panels      || panels.map(() => 1.0))],
    reactors:    [...(s.structureHealth?.reactors    || (reactors || []).map(() => 1.0))],
    habitats:    [...(s.structureHealth?.habitats    || habitats.map(() => 1.0))],
    extraRovers: [...(s.structureHealth?.extraRovers || (s.extraRovers || []).map(() => 1.0))],
    landingPads: [...(s.structureHealth?.landingPads || (s.landingPads || []).map(() => 1.0))],
  };

  x = Math.round(x);
  y = Math.round(y);
  pendingDeliveries = [...(pendingDeliveries || [])];
  reactors = [...(reactors || [])];

  const night = isNight(globalDay);

  // ── Note on generator routing ───────────────────────────────────────────
  // Charging across panels/reactors → rover/habitats is handled entirely
  // by allocateDailyPower() before simDay runs. The previous-version code
  // in this slot built an internal generator list and tried to route again
  // here; that code was dead (empty list) and the comments said as much.
  // Now removed for clarity. Habitat passive drain ALSO happens in
  // allocateDailyPower, NOT here.

  // PSR membership is recomputed AFTER movement (see below) so a rover
  // arriving at a PSR pixel can start mining the same turn.
  let onPSR     = PSR_MASK[y * W + x] === 1;
  let craterIdx = PIXEL_CRATER[y * W + x];
  let status    = "idle";
  const events  = [];

  // ── Ice deposit at any functional habitat ─────────────────────────────
  const habitatHealths = s.structureHealth?.habitats || [];
  const functionalHabitats = (habitats && habitats.length > 0)
    ? habitats.filter(
        (_, i) => (habitatHealths[i] ?? 1.0) > 0 && (habitatPower[i] ?? HABITAT_POWER_INIT) > 0
      )
    : [];
  const atHabitat = functionalHabitats.some((h) => dist({ x, y }, h) < ROVER_REACH);
  if (atHabitat && ice > 0) {
    const dep = ice;
    ice = 0;
    status = "depositing";
    events.push({ type: "deposit", kg: dep, x, y });
  }

  // v205: deposit-blocked feedback (June 13 debrief: "ice deposited 0 …
  // I think that's a bug"). A rover parked at a habitat that is unpowered
  // or destroyed used to fail its deposit SILENTLY, players read that as
  // a bug rather than a consequence. Surface it: if the rover is carrying
  // ice within reach of a habitat, but no FUNCTIONAL habitat is in reach,
  // emit a deposit_blocked event (throttled to every other day so the log
  // stays readable). The kg on the event is the stranded cargo.
  let lastDepositBlockDay = s.lastDepositBlockDay;
  if (!atHabitat && ice > 0 && (habitats || []).length > 0) {
    const nearDeadHabitat = habitats.some((h, i) => {
      if (dist({ x, y }, h) >= ROVER_REACH) return false;
      const hHealth = habitatHealths[i] ?? 1.0;
      const hPower = habitatPower[i] ?? HABITAT_POWER_INIT;
      return hHealth <= 0 || hPower <= 0;
    });
    if (nearDeadHabitat && globalDay - (lastDepositBlockDay ?? -99) >= 2) {
      events.push({ type: "deposit_blocked", kg: ice, x, y });
      lastDepositBlockDay = globalDay;
    }
  }

  // ── Pickup at landing pad (if not already carrying) ───────────────────
  let justPickedUp = false;
  if (!carrying) {
    const pads = s.landingPads || [];
    const padHealths = s.structureHealth?.landingPads || [];
    for (let pi2 = 0; pi2 < pads.length; pi2++) {
      const pad = pads[pi2];
      if ((padHealths[pi2] ?? 1.0) <= 0) continue;
      if (dist({ x, y }, pad) < ROVER_REACH) {
        const idx = pendingDeliveries.findIndex(
          (d) => d.padIdx === pi2 && d.type !== "rover"
        );
        if (idx >= 0) {
          carrying = { ...pendingDeliveries[idx] };
          pendingDeliveries.splice(idx, 1);
          events.push({ type: "pickup", itemType: carrying.type });
          status = "carrying";
          justPickedUp = true;
          break;
        }
      }
    }
  }

  // ── Advance the waypoint queue ────────────────────────────────────────
  // Skip waypoints whose comms-delay hasn't elapsed yet. A waypoint set
  // during a DTE blackout gets pendingSince=globalDay; it activates on the
  // next day tick (globalDay > pendingSince).
  if (!currentWaypoint && waypoints.length > 0) {
    let idx = 0;
    while (idx < waypoints.length) {
      const w = waypoints[idx];
      if (w && w.pendingSince != null && globalDay <= w.pendingSince) {
        idx++;
        continue;
      }
      currentWaypoint = w;
      waypoints = waypoints.slice(idx + 1);
      break;
    }
  }

  // ── Recharge dwell ────────────────────────────────────────────────────
  // Engages ONLY when:
  //   (a) rover came home specifically to recharge (waypoint tagged _recharge), AND
  //   (b) rover is inside a charging zone (panel/reactor/pad/habitat), AND
  //   (c) battery is below 95% of POWER_CAP.
  //
  // Charge is added DIRECTLY here so the user sees power tick up even
  // when no solar panel is in range -- reflects "parked at base, plugged
  // into the resupply lander". Solar panels and reactors also charge via
  // allocateDailyPower; this dwell charge is a bonus on top.
  const currentIsRecharge = !!(currentWaypoint && currentWaypoint._recharge);
  if (currentIsRecharge && power < 0.95 * POWER_CAP) {
    const sources = [];
    (s.panels || []).forEach((p, i) => {
      const h = s.structureHealth?.panels?.[i] ?? 1.0;
      // v207: solar produces NOTHING at night. allocateDailyPower already
      // modeled this (getGeneratorOutput returns 0 for night solar); the
      // dwell trickle here didn't, so a rover parked at a dark panel
      // charged from thin air, physically wrong and inconsistent between
      // the two charging paths.
      if (h > 0.1 && !night) sources.push({ p, r: SAFETY_RADIUS.solar, rate: PANEL_RIDGE * h * 0.6 });
    });
    (s.reactors || []).forEach((p, i) => {
      const h = s.structureHealth?.reactors?.[i] ?? 1.0;
      if (h > 0.1) sources.push({ p, r: SAFETY_RADIUS.reactor, rate: REACTOR_OUTPUT * h * 0.6 });
    });
    // Pads & habitats: backup resupply trickle so a rover with no in-range
    // generator still recharges (~6/day from a pad, ~20-day full recharge).
    if (s.landingPad) sources.push({ p: s.landingPad, r: SAFETY_RADIUS.pad, rate: 6 });
    (s.landingPads || []).forEach((p, i) => {
      const h = s.structureHealth?.landingPads?.[i] ?? 1.0;
      if (h > 0.1) sources.push({ p, r: SAFETY_RADIUS.pad, rate: 6 });
    });
    (s.habitats || []).forEach((p, i) => {
      const h  = s.structureHealth?.habitats?.[i] ?? 1.0;
      const hp = habitatPower[i] ?? HABITAT_POWER_INIT;
      if (h > 0.1 && hp > 5) sources.push({ p, r: SAFETY_RADIUS.habitat, rate: 4 });
    });

    let chargeRate = 0;
    let inRange = false;
    for (const src of sources) {
      if (dist({ x, y }, src.p) <= src.r) {
        chargeRate += src.rate;
        inRange = true;
      }
    }

    if (inRange && chargeRate > 0) {
      currentWaypoint = null;
      status = "recharging";
      power = Math.min(POWER_CAP, power + chargeRate - POWER_BASE_DRAIN * 0.5);
      return {
        ...s,
        x: Math.round(x), y: Math.round(y),
        power, ice, panels, reactors, habitats, habitatPower,
        pendingDeliveries, carrying, waypoints, currentWaypoint, mineMap,
        status, events, structureHealth,
      };
    }
  }

  // ── Movement ──────────────────────────────────────────────────────────
  const target = currentWaypoint || null;
  const dTgt = target ? dist({ x, y }, target) : Infinity;

  if (target && dTgt > ROVER_REACH) {
    const fromX = x, fromY = y;
    const sx = Math.round(x), sy = Math.round(y);
    const pxIdx = sy * W + sx;
    const localSlope = (pxIdx >= 0 && pxIdx < W * H) ? (SLOPE_MAP[pxIdx] || 0) : 0;
    const speedFactor = roverSlopeFactor(localSlope);
    const powerFactor = roverPowerFactor(localSlope);

    if (speedFactor <= 0) {
      // ≥25° slope = impassable. Auto-target / auto-recharge will pick a
      // different goal on the next tick.
      status = "stalled";
    } else {
      const effectiveStep = ROVER_STEP_ * speedFactor;
      const step = stepToward({ x, y }, target, effectiveStep);
      x = step.x; y = step.y;

      const distMoved = Math.hypot(x - fromX, y - fromY);
      const loadFactor = Math.min(3.0, 1.0 + ice / 100 + (carrying ? 0.5 : 0));
      const moveCost = POWER_MOVE_DRAIN_ * (distMoved / ROVER_STEP_) * loadFactor * powerFactor;
      power -= POWER_BASE_DRAIN + moveCost;
      status = carrying
        ? "carrying"
        : status === "depositing"
          ? status
          : "moving";

      // Recompute PSR membership AFTER movement.
      const idxAfter = Math.round(y) * W + Math.round(x);
      onPSR     = PSR_MASK[idxAfter] === 1;
      craterIdx = PIXEL_CRATER[idxAfter];
    }
  } else {
    // ── At or near target -- settle, build, mine ───────────────────────
    x = Math.round(x); y = Math.round(y);

    if (currentWaypoint && dist({ x, y }, currentWaypoint) <= ROVER_REACH) {
      // Place a carried structure (unless we just picked it up this same step).
      if (carrying && !justPickedUp) {
        events.push({ type: "place", itemType: carrying.type, x, y });
        const onRidge = RIDGE_MASK[y * W + x] === 1;
        if (carrying.type === "solar") {
          panels = [...panels, { x, y, onRidge }];
          structureHealth.panels = [...structureHealth.panels, 1.0];
        } else if (carrying.type === "reactor") {
          reactors = [...reactors, { x, y }];
          structureHealth.reactors = [...structureHealth.reactors, 1.0];
        } else if (carrying.type === "habitat") {
          habitats = [...(habitats || []), { x, y }];
          structureHealth.habitats = [...structureHealth.habitats, 1.0];
          habitatPower = [...habitatPower, HABITAT_POWER_INIT];
        } else if (carrying.type === "rover") {
          s = { ...s, extraRovers: [...(s.extraRovers || []), { x, y }] };
          structureHealth.extraRovers = [...structureHealth.extraRovers, 1.0];
        } else if (carrying.type === "pad") {
          s = { ...s, landingPads: [...(s.landingPads || []), { x, y }] };
          structureHealth.landingPads = [...structureHealth.landingPads, 1.0];
        }
        carrying = null;
      }
      currentWaypoint = waypoints.length > 0 ? waypoints[0] : null;
      if (waypoints.length > 0) waypoints = waypoints.slice(1);
    }

    // v69: rover-off-PSR fix. If the rover has settled (free to mine, not
    // carrying, not mid-deposit) but landed just outside a PSR, finish the
    // approach by nosing onto the nearest PSR pixel within reach. Recompute
    // PSR membership from the corrected position so mining can start this
    // same turn. Without this, auto-seek anchors near a small/irregular PSR
    // edge leave the rover idling a few pixels off the ice.
    if (!onPSR && !carrying && status !== "depositing" && !currentWaypoint) {
      const snapPx = snapToNearbyPSR(x, y, ROVER_REACH);
      if (snapPx >= 0) {
        x = snapPx % W; y = (snapPx / W) | 0;
        onPSR = true;
        craterIdx = PIXEL_CRATER[snapPx];
      }
    }

    if (onPSR && craterIdx >= 0 && power > 0) {
      const health      = craterHealth[craterIdx] ?? 1.0;
      const quality     = CRATER_DATA[craterIdx]?.quality ?? 0.5;
      const craterSize  = CRATER_DATA[craterIdx]?.size ?? CRATER_REFERENCE_SIZE;
      const rdBonus     = calcRdMineBonus(s.rdAccum ?? 0);
      const pxIdx3      = y * W + x;
      const localIceFrac = ICE_DEPTH_MAP[pxIdx3] || 0.0;
      const cap         = pxIceCap(localIceFrac);
      const alreadyMined = mineMap[pxIdx3] || 0;
      const pxRemaining = Math.max(0, cap - alreadyMined);

      const nominalMine = BASE_MINE_RATE_ * quality * health * rdBonus;
      const effectiveMine = Math.min(nominalMine, ICE_CAP - ice, pxRemaining);

      if (effectiveMine > 0) {
        ice += effectiveMine;
        power -= POWER_BASE_DRAIN + POWER_MINE_DRAIN_;
        status = "mining";
        mineMap = { ...mineMap, [pxIdx3]: (mineMap[pxIdx3] || 0) + effectiveMine };
        const sizeFactor = CRATER_REFERENCE_SIZE / craterSize;
        craterHealth[craterIdx] = Math.max(0, health - DEPLETION_RATE_ * sizeFactor * effectiveMine);
        events.push({ type: "mine", kg: effectiveMine, craterIdx, x, y });

        // If this pixel just tapped out, hop to the next-nearest fresh
        // pixel in the same crater. Prevents the v17 bug where status
        // stuck on "depleted" indefinitely.
        if (mineMap[pxIdx3] >= cap * 0.99) {
          const bestPx = findNextFreshPixel(craterIdx, x, y, mineMap);
          if (bestPx >= 0) {
            const nx = bestPx % W, ny = (bestPx / W) | 0;
            waypoints = [{ x: nx, y: ny, _auto: true, _hop: true }];
            currentWaypoint = null;
          }
        }
      } else {
        // Pixel was already depleted at entry: same hop logic.
        const bestPx = findNextFreshPixel(craterIdx, x, y, mineMap);
        if (bestPx >= 0) {
          const nx = bestPx % W, ny = (bestPx / W) | 0;
          waypoints = [{ x: nx, y: ny, _auto: true, _hop: true }];
          currentWaypoint = null;
          status = "moving";
        } else {
          status = carrying
            ? "carrying"
            : status === "depositing"
              ? status
              : "depleted";
        }
        power -= POWER_BASE_DRAIN;
      }
    } else {
      power -= POWER_BASE_DRAIN;
      if (status !== "depositing" && !carrying) status = onPSR ? "idle" : "idle_nopsr";
      else if (carrying) status = "carrying";
    }
  }

  power = Math.max(0, power);

  // v205: stranding feedback (July 1 call: "make sure we can get our rover
  // out of the PSR without being trapped … we're already trapped"). Two
  // signals, both throttled so the mission log stays readable:
  //  - strand_risk: rover is in shadow with power below STRAND_RISK_POWER , 
  //    still alive, but on current drain it may not make it out. Fires at
  //    most every other day while the condition holds.
  //  - stranded: the battery crossed to zero this tick. Fires once per
  //    depletion (re-arms only after a recharge above zero).
  const STRAND_RISK_POWER_ = po.STRAND_RISK_POWER ?? 15;
  let lastStrandWarnDay = s.lastStrandWarnDay;
  if (onPSR && power > 0 && power < STRAND_RISK_POWER_ &&
      globalDay - (lastStrandWarnDay ?? -99) >= 2) {
    events.push({ type: "strand_risk", power: Math.round(power), x, y });
    lastStrandWarnDay = globalDay;
  }
  const entryPower = s.power ?? 0;
  if (power <= 0 && entryPower > 0) {
    // v207: carry diagnostic context so batch analysis can attribute the
    // cause (deep-PSR overrun vs night-cycle gap vs no-home orphan).
    let dHome = Infinity;
    const homeish = [
      ...(s.panels || []), ...(s.reactors || []),
      ...(s.habitats || []), ...(s.landingPads || []),
    ];
    for (const hpt of homeish) {
      const d = dist({ x, y }, hpt);
      if (d < dHome) dHome = d;
    }
    events.push({ type: "stranded", x, y, onPSR, night,
      dHome: Number.isFinite(dHome) ? Math.round(dHome) : null });
  }

  return {
    ...s,
    x: Math.round(x), y: Math.round(y),
    power, ice, panels, reactors, habitats, habitatPower,
    pendingDeliveries, carrying, waypoints, currentWaypoint, mineMap,
    status, events, structureHealth,
    lastDepositBlockDay, lastStrandWarnDay,
  };
}

// ── Claim map ──────────────────────────────────────────────────────────────
// PSR claim mask: each PSR pixel is colored by the nearest player within
// their claim radius. Used by the renderer to show contested vs. owned ice.

export function computeClaims(p1, p2, r1, r2) {
  // Back-compat 2-actor wrapper over the N-actor partition. Existing callers and
  // tests pass exactly two players; new 3-actor callers use computeClaimsN.
  return computeClaimsN([p1, p2], [r1, r2]);
}

// v192: N-actor PSR territory partition. Each PSR pixel is awarded to the NEAREST
// active base whose claim radius reaches it. Cell value is the 1-based actor
// index (1, 2, 3, …); 0 = unclaimed. Ties break to the lower index. This is the
// same nearest-base rule the 2-actor version used, generalized to any actor
// count, so a third (or fourth) actor partitions territory correctly.
export function computeClaimsN(players, radii) {
  const c = new Int8Array(W * H);
  const act = (players || []).map((p, k) => ({
    active: !!p && p.active !== false && Number.isFinite(p?.x) && Number.isFinite(p?.y),
    x: p?.x, y: p?.y, r: radii?.[k] ?? 0, id: k + 1,
  }));
  if (!act.some((a) => a.active)) return c;
  for (let i = 0; i < W * H; i++) {
    if (!PSR_MASK[i]) continue;
    const px = i % W, py = (i / W) | 0;
    let bestId = 0, bestD = Infinity;
    for (const a of act) {
      if (!a.active) continue;
      const d = Math.sqrt((px - a.x) ** 2 + (py - a.y) ** 2);
      if (d <= a.r && d < bestD) { bestD = d; bestId = a.id; }
    }
    c[i] = bestId;
  }
  return c;
}
