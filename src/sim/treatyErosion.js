// ── OST slow walk-back: gradual treaty-floor erosion ────────────────────────
//
// Reviewer's failure mode: the non-appropriation norm (the "Founding Treaty" /
// Outer Space Treaty floor) does not fail in a single dramatic redraft. It is
// walked back gradually, each over-buffer, each securitized designation, each
// uncontested appropriation lowers the floor a little, and a lower floor makes
// the next appropriation cheaper and better-rewarded. The danger is precisely
// that no single step looks like the moment the regime broke.
//
// floor is a scalar in [FLOOR_MIN, 1]: 1.0 = the norm fully holds, lower = the
// floor has been eroded. This module is pure; the sim/facilitator decide when
// to apply a round's pressure and how to surface the effects.

export const TREATY_FLOOR_INIT = 1.0;
export const FLOOR_MIN = 0.1;

// Per-unit-pressure erosion, and the partial recovery a cooperative round buys.
// EROSION is intentionally small so the walk-back is gradual: it takes sustained
// pressure across several rounds to move the floor a long way, there is no
// single-event cliff.
export const DEFAULT_EROSION = { perPressure: 0.06, recovery: 0.03, maxStepDown: 0.12 };

// Erode (or, with negative pressure, partially restore) the floor for one round.
//   floor       , current floor in [FLOOR_MIN, 1]
//   roundPressure, net appropriative pressure this round (>=0 erodes). A
//                   reasonable scale: sum over actors of (over-buffer amount +
//                   safety violations), e.g. 1 unit per over-buffer step.
// A single huge-pressure round cannot collapse the floor: the step down is
// capped at maxStepDown, so the walk-back stays gradual by construction.
export function erodeTreatyFloor(floor, roundPressure, params = DEFAULT_EROSION) {
  const f0 = Math.max(FLOOR_MIN, Math.min(1, floor ?? TREATY_FLOOR_INIT));
  const p = roundPressure || 0;
  let step;
  if (p > 0) {
    step = -Math.min(params.maxStepDown, p * params.perPressure);
  } else {
    // a cooperative / norm-reinforcing round nudges the floor back up, slowly
    step = Math.min(params.recovery, -p * params.recovery);
  }
  return Math.max(FLOOR_MIN, Math.min(1, f0 + step));
}

// The four stages of the walk-back, by floor band.
export function treatyStage(floor) {
  const f = Math.max(FLOOR_MIN, Math.min(1, floor ?? 1));
  if (f > 0.8) return "intact";
  if (f > 0.55) return "fraying";
  if (f > 0.3) return "eroded";
  return "collapsed";
}

// How an eroded floor changes incentives. As the floor falls, the penalty for
// crowding a neighbor weakens and the payoff to appropriation rises, the
// slippery slope that makes the next grab rational.
//   violationPenaltyMult, multiplies the safety-violation penalty (1 at full
//                          floor, falling toward ~0.3 as the norm hollows out)
//   appropriationReward , extra score an appropriative move yields (0 at full
//                          floor, rising as the norm stops punishing it)
export function treatyFloorEffects(floor) {
  const f = Math.max(FLOOR_MIN, Math.min(1, floor ?? 1));
  return {
    floor: f,
    stage: treatyStage(f),
    violationPenaltyMult: 0.3 + 0.7 * f,      // 1.0 at f=1 → 0.37 at f=0.1
    appropriationReward: Math.round((1 - f) * 20), // 0 at f=1 → ~18 at f=0.1
    normIntact: f > 0.55,
  };
}

// Walk a sequence of round pressures through the floor, returning the floor
// trajectory and the round index (if any) at which each stage was first
// crossed. Used to demonstrate that erosion is gradual and path-dependent.
export function treatyTrajectory(roundPressures, initial = TREATY_FLOOR_INIT, params = DEFAULT_EROSION) {
  let floor = initial;
  const floors = [floor];
  const stageFirstReached = {};
  let prevStage = treatyStage(floor);
  (roundPressures || []).forEach((p, i) => {
    floor = erodeTreatyFloor(floor, p, params);
    floors.push(floor);
    const st = treatyStage(floor);
    if (st !== prevStage && stageFirstReached[st] === undefined) {
      stageFirstReached[st] = i + 1;
    }
    prevStage = st;
  });
  return { floors, finalFloor: floor, finalStage: treatyStage(floor), stageFirstReached };
}
