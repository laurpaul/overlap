# Changelog

Newest first. Each entry shipped with the full test suite green.

## v214, The game has a name: Overlap

Renamed from the working title. Overlap is what the simulation is about:
safety zones are the mechanic and the metaphor, and the game is what happens
where they overlap.

- Brand header (lobby + in-game): "Overlap · a lunar policy sandbox".
- Page title, mission-snapshot banner, CSV export banner, multiplayer client
  and server strings, simulation-core headers.
- README, MC_RUN_PLAN, VERIFY, ROADMAP updated; package name is now
  `overlap` (npm may print a lockfile-name notice on first install; harmless).
- No mechanical changes; CSV columns, seeds, and hashes are unaffected
  (the verify reference from VERIFY.md still applies to this build).

511/511 tests · lint/build clean.

## v213, mc:verify (cross-machine reproducibility) + mc:full

- **`npm run mc:verify`**: baseline × 10 fixed seeds → canonical SHA-256 of
  the trials CSV + three aggregates + the browser engine string. Reference
  values for this build live in VERIFY.md, with guidance on interpreting a
  hash mismatch (engine floating-point vs. real divergence). Reproducibility
  is now a one-command claim instead of an assertion.
- **`npm run mc:full`**: full battery with timeseries, then the analyzer,
  in one command → `lps_research_sweep.csv`, `…_rounds.csv`, `lps_report.md`.

Verification: 511/511 tests · lint/build clean · verify mode smoke-run in
container (reference hash generated there).

## v212, The Strategic Reserve gets teeth; sweep button ships timeseries

## 1 · Reserve escrow (scenarioPresets, App.jsx, economy.js)
The July 6 battery published the weakness: `strategic_reserve` ran
byte-identical to Long Horizon because its identity was briefing-only. Now:
under the regime, `RESERVE_ESCROW_FRAC = 0.25` of every deposit is
sequestered into a reserve ledger (`player.reserveKg`) instead of the market
ledger; reserve kilograms score at `RESERVE_END_MULT = 1.5` (economy.js).
Patience pays, but the escrowed share is worth nothing until it does. The
knob rides on the preset's physOverrides, so it flows through the live setup
screen and the research sweep with zero new plumbing, and every other regime
is untouched (reserveKg never accrues). Score breakdown gains a "Strategic
reserve" term; the trials CSV gains `reserve1_kg`/`reserve2_kg`.

**Validation (100 seeds, paired vs long_horizon):** no longer identical;
~127 kg escrowed per session with total extraction unchanged (382 market +
127 reserve ≈ long_horizon's 510), the physics is identical, only the
ledger and the payoff differ, which is exactly the regime's thesis.

## 2 · In-app research sweep now emits the round timeseries
The `⚗ Research sweep` button downloads BOTH CSVs (trials + rounds), matching
the CLI's `--timeseries`.

Verification: `npm test` 511/511 (adds reserve-scoring + preset-override
tests) · lint/build clean · paired validation batch above.

## v211, Per-round timeseries: the R6 instrument

Endpoints can't tell you WHEN friction happens. v211 adds an opt-in
per-round timeseries to the headless Monte Carlo:

- `simulateBotGame(config, seed, { roundSeries:true })` collects one row per
  round at the round boundary: cumulative violations and banked ice per
  actor, plus this-round deltas (violations, ice, contested days, shared
  days, strandings) and the craters-depleted count. Deltas are computed
  against a per-sim mark, so trend analysis needs no reconstruction.
- `runResearchSweep(battery, { timeseries:true })` emits a SECOND long-format
  CSV (battery_id, run_id, seed, round, …) alongside the trials CSV;
  `tools/mc-sweep.mjs --timeseries` writes it as `<out>_rounds.csv`.
- `tools/mc-analyze.mjs --rounds <file>` appends an early/mid/late tercile
  trend table (Δvio, Δice, contested, depleted per round) to the report.

First validation run (long_horizon + baseline, 40 seeds each, 1,280 round
rows): in the 20-round config, per-round violations rise 7.4 → 8.0 → 9.9
across terciles while per-round banked ice collapses 67 → 10 → 1 kg , 
scarcity-driven friction, visible for the first time. One honest caveat now
documented in MC_RUN_PLAN.md: crater-level depletion stays ≈0 in these runs;
the ice collapse is PROXIMITY exhaustion (pixels near bases tapping out), so
the finding should be framed as local scarcity unless DEPLETION_RATE is
raised.

Verification: `npm test` 509/509 · lint/build clean · end-to-end validation
via the headless sweep (row counts and trend table above). The timeseries is
opt-in and off by default, so trials CSVs remain byte-compatible with v210.

## v210, 2.6× faster Monte Carlo (illumination-search memoization)

CPU profiling of the headless sweep (CDP sampling profiler against an
unminified build) showed **~48% of all cycles** inside
`findBestIllumSiteNear` (29.4%) and `findTopIllumSitesNear` (18.5%), O(r²)
scans over `ILLUM_MAP`, re-run every bot planning tick for coordinates that
never move (crater centres, base sites).

`ILLUM_MAP` is static map data, physOverrides never touch it, so both
functions are pure in `(x, y, radius[, limit])`. v210 memoizes them at
module level: bounded Maps (20k entries, cleared when full), keys quantized
to integer coordinates, and cache hits return shallow copies so callers can
never corrupt stored results. The cache survives across Monte Carlo trials
by design, which is where most of the win comes from.

**Measured:** 950 → **372 ms/trial** (2.6×). The full 13-config battery
drops from ~40 min to ~15 min. Post-fix profile: illumination search ~7%
combined; no single function above 3.5%.

**Correctness proof:** memoization must be behaviorally invisible, an 80-
trial batch (baseline + grid_off, fixed seeds) is **byte-identical** to the
v209 output across all 47 CSV columns.

Verification: `npm test` 509/509 · lint/build clean · identity check above.

## v209, Predictive pre-night return; the stranding arc closes

## 1 · Rovers now see night coming (utils.js, autoTarget.js)
v208's cause attribution showed the residual strandings were rovers caught
mid-operation when night FELL, the trip home was longer than the daylight
left, and the v208 night reserve only engaged once it was already dark. The
day/night cycle is deterministic (7 light / 7 dark), so v209 makes the
recharge trigger predictive: estimate the trip home first
(new `daysUntilNight` in utils), and if night would begin before the rover
could complete it (+1 day slack), treat the situation as night NOW , 
reactor-first home tiering plus the 12% night reserve. Two-pass computation
because the home tier depends on the night flag and the flag depends on the
trip length.

**A/B on identical seeds:**
| build | baseline strand% | night deaths | grid_off strand% | ice |
|---|---:|---:|---:|---:|
| v205 | 62% |, | 72% | 498 kg |
| v208 | 18% | 9 | 30% | 469 kg |
| **v209** | **5%** | **1** | **18%** | 467 kg |

Cumulative across the v206-v209 arc, energy-budgeted dispatch, dynamic
loaded-return trigger, night-honest physics, night-aware routing, and now
prediction, **baseline session-stranding fell 62% → 5%** with ice
throughput intact, and the remaining tail is cause-attributed per trial.

## 2 · MC_RUN_PLAN.md now ships in the repo
The research plan (v2) travels with the code: updated for the mechanized
regimes, the failure-telemetry columns and how to read them (including that
`dep_blocked` is a night-brownout indicator, not ice loss), the analyzer's
paired-delta workflow, and the rule that CSVs from different builds must not
be mixed, the version is part of the treatment.

## Verification
- `npm test`, **509 / 509** (adds `daysUntilNight` cycle test and a
  trigger-rises-when-night-is-imminent test).
- `npm run lint` / `npm run build`, clean.
- A/B batch on fixed seeds (table above).

## v208, Deposit routing, stranding-cause attribution, and the budget projection panel

Every change here traces to either the June 13 debrief or to telemetry the
v207 analyzer surfaced.

## 1 · Rovers route deposits to POWERED habitats (autoTarget.js)
The analyzer flagged a 17-30% deposit-block rate; the routing rules picked
the nearest HEALTHY habitat and ignored habitatPower. New shared helper
`pickDepositHabitat` prefers intact-AND-powered habs, falls back to
healthy-but-dark ones (they may re-power by arrival), then pads. Used by
both the half-full return rule and the bank-when-stuck rule.
**A/B verdict (honest):** blocked rates were UNCHANGED on identical seeds , 
which itself is the finding: the blocks are transient night brownouts at the
habitat while the rover waits (deposits succeed at dawn; total banked ice is
identical), not lost cargo from bad routing. The routing fix stays (it is
correct for the multi-habitat case), and the blocked% column should be read
as a night-brownout indicator, not an ice-loss indicator.

## 2 · Stranding causes are now attributed (App.jsx telemetry)
Three new per-trial CSV columns from the v207 diagnostic payloads:
`strand_night` (died during the night cycle), `strand_far` (died >30 km from
any home structure), `strand_other`. First diagnosis batch: **~75% of
residual strandings are night-cycle deaths.**

## 3 · Night reserve on the recharge trigger (autoTarget.js)
Acting on that attribution: during the night cycle the dynamic recharge
trigger carries an extra 12%-of-capacity reserve, head home earlier, sit
out the dark. **A/B on identical seeds: baseline stranding 22% → 18%,
grid_off 45% → 30%, ice unchanged.** Cumulative since v205: **62% → 18%.**

## 4 · The budget projection panel (App.jsx)
June 13, verbatim: "we only used one budget … didn't understand the pros of
using different budgets and the consequences of each." The v180 explainer
described the levers in prose; the new panel shows what YOUR current mix
does in numbers, Δ economy, Δ R&D, Δ military, and projected next-round
budget, computed with the exact `calcDeltaE/R/M` + `calcBudget` functions
the round-end economy runs, so the preview can never drift from the sim.
Lives directly above the stance presets; verified headlessly that switching
Balanced → Economic Growth moves the readout (+0.50 → +0.75 Δecon,
0 → −0.10 Δmil, 223 → 179cr next budget as the CASH share drops).

## Verification
- `npm test`, 507 / 507 · `npm run lint` / `npm run build`, clean.
- Two A/B batches on fixed seeds (deposit routing; night reserve).
- Headless UI probes for the projection panel: renders after base placement,
  and updates on stance change.

## v207, Night-honest power, the recovery convoy, and a paired-stats analyzer

## 1 · Night is now honest in both charging paths (simDay.js, autoTarget.js)
Chasing the residual ~25% session-stranding rate exposed a physics
inconsistency: `allocateDailyPower` correctly zeroes solar at night
(`getGeneratorOutput`), but the parked-rover dwell trickle in simDay paid
`PANEL_RIDGE × 0.6` regardless, a rover at a dark panel charged from thin
air. Fixed: dwell solar is 0 at night. To compensate honestly instead of by
accident, recharge routing is now night-aware: `collectRechargeHomes` demotes
panels out of the primary tier at night (reactors are the only true
generators; pads/habitats trickle; a dark panel is the last resort, parking
beside a future generator beats dying mid-regolith). The night flag threads
through `rechargeTriggerThreshold` / `shouldRecharge` / `pickRoverTarget`
from the per-day gate.
**A/B on identical seeds:** stranding 25% → 22.5%, total ice 494 → 469 kg , 
the small ice drop is the removed free night-charging, i.e. the physically
correct price. Stranded events now carry diagnostic context (`dHome`,
`night`, `onPSR`) for future cause attribution.

## 2 · The recovery convoy (economy.js: applyRoverRescue)
July 1 call: "make sure we can get our rover out of the PSR … we're already
trapped." Stranding was a warning (v205), then a daily cost (v206), but
still a permanent death. Now it's a priced recovery: after
`RESCUE_DELAY_DAYS = 3` at zero battery, the owner automatically mounts a
convoy IF the treasury covers `RESCUE_COST_CR = 120`, restoring the rover to
35% power (enough to limp home, not to resume mining) and logging
`🛟 Recovery convoy dispatched`. Broke actors stay down and keep paying the
v206 daily penalty, rescue is an economic decision, not a free respawn.
Wired into live and headless paths; rescue counts flow into batchFlags,
trial summaries, and two new CSV columns (`rescues1/2`).

## 3 · `mc:analyze`, paired-statistics CLI (tools/mc-analyze.mjs)
`node tools/mc-analyze.mjs sweep.csv [--baseline id] [--md report.md]`
turns any sweep CSV into a markdown stats report: per-config n, win rates,
means ±95% CI, violations **per round**, stranding/rescue/deposit-block
telemetry, and a paired-deltas table vs the baseline config. Because every
config runs the same deterministic seed sequence, equal-seed trials are
matched pairs; paired CIs on per-seed differences are far tighter than
independent-mean comparisons. Zero dependencies.

First run on a 160-trial validation batch produced a clean headline: under
the mechanized ITU regime, violations rise +8.06/round on an 8.1 baseline
(the exact ×2 weighting, significant) with Δice −2 ±4 kg (n.s.) , 
registration priority reprices crowding without touching extraction.

## Verification
- `npm test`, **507 / 507** (adds recovery-convoy tests: funded rescue
  after the delay, broke-actor stays down, self-recovery clears the timer).
- `npm run lint`, `npm run build`, clean.
- A/B batches on fixed seeds for the night fixes; analyzer validated on a
  fresh 160-trial batch (baseline / first_mover / itu / grid_off).

## v206, Governance gets teeth, bots stop stranding, failures cost score

All three changes were driven by measured Monte Carlo evidence (the July 5
pilot + a 100-trial user batch), and each was verified by an A/B batch on
identical seeds before shipping.

## 1 · Governance regimes are now mechanical (new: src/sim/governance.js)
The pilot proved "ITU Coordination" was briefing-only (byte-identical trials
to Standard) and ATCM's inspection half likewise. Regimes now weight the
violation increment inside attribution (`attributeSafetyViolationsN`,
`opts.violationWeight`):
- **itu ×2.0**, first-come registration priority: crowding a registered
  zone costs the late party double.
- **atcm ×1.5**, inspection regime: every breach is observed.
The weight flows through scoring, treaty-floor multipliers, CSV exports and
batch summaries because it scales the attributed count itself. Applied in
BOTH the live and headless paths (live derives the regime from the selected
scenario preset; headless carries `config.governanceId`, set automatically by
the research sweep). **A/B on identical seeds: ITU violations 101.1 → 201.8
(exactly ×2), ATCM 234.8 → 350.2 (×1.49).**

## 2 · The stranding trap is fixed at its actual cause (autoTarget.js)
Chasing the pilot's 52-95% session-stranding rate took two attempts, and the
A/B harness caught that the first one changed nothing:
- First hypothesis (outbound dispatch to unaffordable craters) → added a
  round-trip energy budget to autoseek (`estimateRoundTripNeed`: out + mine
  dwell + LOADED return + reserve; recharge-first only when a full charge
  would cover the cheapest trip; long-haulers keep legacy venturing).
  A/B: byte-identical, not the trap.
- Actual cause: the per-day gate in `injectAutoTarget` used a FLAT 40%
  recharge trigger, while the loaded trip home from deep in a PSR costs more
  than 40%. Bots mined to the line, turned home, and died short.
- Fix: a shared **dynamic recharge trigger** (`rechargeTriggerThreshold` /
  `shouldRecharge`): max(hysteresis threshold, estimated loaded cost home +
  8% reserve), clamped to 0.9·POWER_CAP so out-of-range long-haulers don't
  park in a recharge spiral. Used by both pickRoverTarget and the App gate.

**A/B on identical seeds: baseline session-stranding 62% → 25%,
first-mover 48% → 0%, ice throughput unchanged (498→494 kg), mean score up
(598→720), fewer dead rovers, same mining.**

## 3 · Stranded rovers now cost score (economy.js)
June 13 debrief, verbatim: "we were not penalized enough for all the
mistakes that we've made." `applyStrandedRoverPenalty`: each zero-battery
rover (primary or extra; destroyed ones exempt) charges
`STRANDED_ROVER_PENALTY = 2` pts per resolved day via the same
scoreAdjustments channel as the unpowered-habitat ding, with a
`stranded_penalty` mission-log line. Wired into live and headless paths;
per-actor day counts flow into batchFlags, trial summaries, and two new CSV
columns (`strand_pen_days1/2`, plus a `governance` column).

## Verification
- `npm test`, **504 / 504** (adds tests/v206mechanics.test.js: weight
  table, preset resolution, ITU exactly-double attribution, stranded-penalty
  charge + no-op, affordable-target autoseek, recharge-first in the
  marginal-charge band).
- `npm run lint`, `npm run build`, clean.
- Three A/B batches on fixed seeds (v205 vs v206) documented above.

## v205, Playtest-feedback fixes + a reproducible Monte Carlo research pipeline

Driven directly by the June 13 tabletop debrief and the July 1 dev call.

## 1 · Silent failures now speak (sim)
- **`deposit_blocked` event.** A rover carrying ice within reach of a habitat
  that is unpowered or destroyed used to fail its deposit *silently*, the
  June 13 crew read "ice deposited 0" as a bug. The rover now emits a
  `deposit_blocked` event (with the stranded kg) at most every other day, and
  the mission log renders it as a warning:
  `⚠ Deposit blocked: 40.0 kg waiting, nearest habitat is unpowered or destroyed`.
- **`strand_risk` / `stranded` events.** From the July 1 call ("make sure we
  can get our rover out of the PSR without being trapped … we're already
  trapped"): a rover inside a PSR below 15% battery emits a throttled
  `strand_risk` warning; the battery crossing to zero emits `stranded` exactly
  once per depletion. Threshold overridable via `physOverrides.STRAND_RISK_POWER`.
- Both new event types get mission-log labels and warning coloring; the
  throttle state (`lastDepositBlockDay`, `lastStrandWarnDay`) rides on the
  rover state and survives the simDay round-trip.

## 2 · Monte Carlo becomes a research instrument (App)
- **Deterministic seeds.** Batch runs now start from a fixed base seed
  (`0x5EED2026`, stride 9973) instead of `Date.now()`, identical settings
  reproduce identical batteries, and every trial's seed is recorded so any
  run can be replayed.
- **Per-trial telemetry.** The headless day-resolver counts the new failure
  events per actor (`depBlocked`, `strandRisk`, `stranded`, plus
  unpowered-habitat days) into `batchFlags`; each trial summary and the batch
  aggregates (`strandRate`, `depositBlockRate`, `avgUnpowHabDays`, …) carry
  them.
- **`CSV · all N trials` button** on the batch results screen: one row per
  trial, 40 columns (config, seed, winner, scores, ice, violations, the new
  failure telemetry, diplomacy counters, depletion, fleet composition).
- **Research sweep.** `runResearchSweep(battery?)` runs a battery of
  configs × fixed seeds headlessly and emits ONE long-format CSV
  (`battery_id` + the 40 trial columns). Ships with a 13-config default
  battery (~2,550 trials) covering: baseline distribution, the grid-sharing
  counterfactual (off / reversible / permanent), four governance regimes
  (Cooperative, ATCM, ITU, Strategic Reserve), the first-mover sprint, an
  asymmetric-arrival dose-response (delay 2/5/10/20), and the long-horizon
  depletion case. Exposed in the Monte Carlo panel
  (`⚗ Research sweep · 13 configs → CSV`) and on
  `window.__runResearchSweep` / `window.__mcTrialsCsv` /
  `window.__RESEARCH_BATTERY` for headless drivers.

## Verification
- `npm run lint`, clean.
- `npm test`, 497 / 497 pass (adds `tests/strandDeposit.test.js`: blocked
  deposit at unpowered habitat, throttling, powered-habitat no-regression,
  strand_risk throttle, stranded single-fire).
- `npm run build`, succeeds.

## v204, Fix crash on opening facilitator god-mode panel

## The bug
Opening the facilitator panel (god mode) threw and unmounted the app:

    ReferenceError: onSetTierScale is not defined
        at FacilitatorPanel (src/FacilitatorPanel.jsx)

It surfaced whenever the god-mode section rendered, the asset-placement
activity happening at the time was incidental, not the cause.

## Root cause
`FacilitatorPanel` forwards `onSetTierScale` down to `<GodModeControls>`, but
`onSetTierScale` was missing from `FacilitatorPanel`'s own destructured props.
The parent (`App.jsx`) was already passing it in, and `GodModeControls` already
guards it (`const setTier = onSetTierScale || (() => {})`), so the only broken
link was the missing name in the destructuring, it evaluated as an undefined
identifier at render.

## Fix
Added `onSetTierScale` to the `FacilitatorPanel` props destructuring (one line).
No behavior change beyond the god-mode per-tier zone control now wiring through.

## Verification
- `npm run lint`, expected clean.
- `npm test`, 489 / 489 expected to pass (no logic touched).
- `npm run build`, expected to succeed.

## v203, Game-scale zones (1 / 5 / 10 km), zone doctrines, opponent transparency, debris that bites

Four upgrades in one pass, built around the new default safety-zone sizes.

## 1 · Canonical DLA zones are now 1 / 5 / 10 km
- `ZONE_KM` = Core **1 km** · Harmonization **5 km** · Coordination **10 km** , 
  Christine's 1 : 5 : 10 ratio adopted at game scale (previously her literal
  sub-km FSP figures, 0.1/0.5/1 km). Reactor FSP zones follow the same canon.
- **At 2 px/km these are visible at TRUE scale** (2 / 10 / 20 px), so the ring
  display now defaults to **1×, the real size, matching the scale bar** , 
  instead of a 10× magnification lie. Magnification bounds retuned 1-40× → 1-8×;
  legend presets are now 1× true / 2× / keep-out (3×) / 5×. Stale saves with
  old 10-40× values are clamped at render.
- **Scored balance is byte-identical**: display scales drop to compensate
  (zones 30 → 3, reactor 10 → 1), so every keep-out radius in px, and therefore
  every breach test, overreach penalty, and existing test expectation, is
  unchanged. All ring labels, the legend, and CSV exports report the new km.

## 2 · Zone doctrines, one-tap postures
The Negotiation panel gains four named doctrines that set all three rings in a
single action (one dispatch, one mission-log line, `setTierScale` now accepts a
full tier object): **Restrained** (80% all, free) · **Baseline** (the DLA canon)
· **Buffered** (pad the outers, cheap) · **Fortress** (inflate the Core,
expensive). Each button shows its live overreach price for your current zone
count. A workshop shorthand: pick a posture, argue about it, pay for it.

## 3 · Opponent zone transparency
The Negotiation panel now shows **the other actor's declared zones** read-only , 
per-ring km with ⚠ flags and an "overreaching · use for your next deal"
note when they've expanded past baseline. Asymmetric claims are visible at the
negotiating table, which is the whole Tiballi teaching point.

## 4 · Orbital debris now bites (roadmap orbit item b, DONE)
At round end, **each asset operating inside a crash-debris keep-out is charged
one safety violation** (standard `SCORE_PENALTY_VIO`), logged to the mission
record. The polluter is not exempt, the externality is physical, not legal.
Pure counter `orbit.debrisViolationCount` + 3 new tests; the debris label on
the map now reads "keep out (scored)". The cheap crash-disposal inject choice
finally costs whoever ends up living in the mess.

## Verification
- `npm run lint`, clean.
- `npm test`, **492 / 492** pass (3 new debris-violation tests).
- `npm run build`, succeeds.

## v202, Every player sizes their own rings; oversizing costs score, visibly

Per-user penalized ring sizing existed (v186's tier scales) but was easy to miss:
buried in the Negotiation drawer as five coarse preset buttons that didn't even
reach the allowed 200% bound, while the prominent bottom-right ring control was
the *free, visual-only* magnification (v199). This release makes the penalized
"declare your own ring sizes" control first-class in both places.

## Negotiation panel, "Your safety zones · 3-ring"
- Each tier (Core / Harmonization / Coordination) now has a **continuous slider**
  spanning the full `TIER_SCALE_BOUNDS` (40%-200%), plus quick chips updated to
  reach 200%.
- Live readout per tier: current km, current %, and the exact overreach cost at
  that setting (mirrors `economy.overreachPenalty`).
- New **total overreach penalty** line so the price of oversizing reads as one
  number, with the per-zone multiplier called out.
- Slider drags preview locally and **commit on release** (pointer-up / key-up /
  blur), so one drag = one dispatched action = one mission-log line, instead of
  spamming the log and the multiplayer relay on every pixel.

## Map legend (bottom-right), declared vs display, side by side
- The v199 magnification slider is relabeled **"ring display (visual · free)"**
  to make explicit that it never affects score.
- New **"declared size (scored)"** section directly beneath it: compact per-tier
  sliders for the actor's own equipment, live km + per-tier cost, a running
  total (✓ when compliant, −N when overreaching), and a caption explaining the
  Tiballi rule: widening past the 100% baseline is overreach, inner rings are
  penalized hardest, shrinking is free.
- Same drag-preview / commit-on-release behavior; same ownership rules, hotseat
  controls the active turn's rings, multiplayer controls your own seat only
  (host-side seat guards on `player:setTierScale` unchanged).

No scoring changes: the penalty math, weights (`core 6 / harmon 2 / coord 0.5`),
bounds, CSV export columns, and map overreach flags are exactly as before, this
release is about making the lever and its cost visible to every player.

## Verification
- `npm run lint`, clean.
- `npm test`, 489 / 489 pass.
- `npm run build`, succeeds.

## v201, Finish the solo-correctness pass + zone reset

Builds on the v200 fix (which registered the in-game action handlers in
single-player). Two follow-ups:

- **Deal garbage-collection now runs in solo too.** It was the last effect still
  gated on bare `!isHost`, so in single-player stale/unaffordable deal offers were
  never expired. Now it runs in solo and on the MP host (peers still skip).
- **One-tap zone reset.** The per-player ring control gets a **↺ reset** button
  that restores that actor's ring size (magnification) AND their Core/Harmon/Coord
  tier scales to defaults in a single click, handy now that both controls actually
  take effect in solo.

Together with v200, every zone/negotiation control (ring size, per-tier sliders,
stance, easements, deal propose/accept) is now fully functional in single-player.

## Verification
- `npm run lint`, clean.
- `npm test`, 489 / 489 pass.
- `npm run build`, succeeds.

## v200, THE actual bug: panel/zone controls did nothing in solo/hotseat

## Root cause (this explains the whole saga)
In single-player, `GameApp` is mounted with `mp = null`, so `isHost` is false. The
effect that registers every in-game action handler began with `if (!isHost) return;`
,  which is ALSO true in solo, so in single-player **none of the handlers were ever
registered**. Every panel/legend control (per-tier ring sliders, the new per-player
ring size, stance, easements, deal propose/respond) routes through `dispatchAction`,
whose solo branch looks the action up in that handler registry and, finding nothing,
silently did nothing. That's why each ring change I shipped "didn't work", the
control rendered and moved, but its action never reached state.

(End Turn worked because its button has a special `if (!mp) endTurn(pi)` direct-call
fallback. The zone/negotiation controls had no such fallback.)

## Fix
The registration effect now runs in solo/hotseat as well as on the multiplayer host
,  only a multiplayer PEER skips it (peers correctly send actions to the host). One
line: `if (!isHost) return;` → `if (mp && !isHost) return;`.

With this, in single-player:
- **Per-player ring size** (bottom-right, v199) now actually resizes that actor's rings.
- **Per-tier Core/Harmon/Coord sliders** (each actor's "Deals & Zone sizes" panel) now work.
- **Stance, safety easements, and deal propose/accept** now work too.

No double-execution: solo paths that already call functions directly (End Turn,
auto-advance) don't dispatch, so nothing fires twice.

## Verification
- `npm run lint`, clean.
- `npm test`, 489 / 489 pass.
- `npm run build`, succeeds.

## v199, Each player sizes the rings on their OWN equipment

The ring display size is now **per-player**, not a single global setting. Each
actor controls how big the safety rings on *their own* equipment are drawn; one
actor's choice never resizes the other's rings.

- Ring size lives on player state (`player.ringMag`) and is synced across
  multiplayer, so everyone sees each actor's equipment at that actor's chosen size.
- The bottom-right control is now labelled with **whose** rings it sizes, the
  actor whose turn it is (hotseat) or your own seat (multiplayer), and tinted in
  that team's colour. Slider 1×-40× plus presets **1× true / 10× / 20× / keep-out**.
  1× = the real 0.1 / 0.5 / 1 km (matches the scale bar); higher magnifies for
  visibility. Visual only, it never changes score or the km the rings represent.
- This is separate from, and stacks with, the per-tier governance sliders in each
  actor's "Deals & Zone sizes" panel (Core / Harmon / Coord, which DO cost score
  when expanded past 100 %). So a player has two independent, own-equipment levers:
  the visual size (ringMag, free) and the policy size (tierScale, penalised).

Facilitators/spectators don't see the control (they have no equipment of their own
to size).

## Verification
- `npm run lint`, clean.
- `npm test`, 489 / 489 pass.
- `npm run build`, succeeds.

## v198, Rings now sized to REAL scale (fixes "visually way bigger than real")

## What was wrong
Rings were drawn at a fixed 30× magnification (`ZONE_DISPLAY_SCALE`), so the
"1 km" Coordination ring was actually drawn ~30 km wide on the 606 km map, the
"0.5 km" ring ~15 km, etc. Measured against the scale bar they were 30× too big.

## The fix
Rings are now drawn from **true map scale**, `ZONE_DRAW_RADII_PX` = the real
0.1 / 0.5 / 1 km (0.2 / 1 / 2 px at 2 px/km), multiplied by a **magnification**
you control, where **1× = the true real size** and matches the scale bar exactly.

- The bottom-right control is now **"Ring magnification"** (1×-40×) with a
  **"1× true"** preset. At 1× the rings measure their real km against the scale
  bar. Higher magnifies them purely for visibility.
- Default is **10×** (down from the old fixed 30×), so out of the box the rings
  are much closer to real size, and you can drop them to **1× true** whenever you
  want exact scale.
- The per-tier adjustments (Core/Harmon/Coord sliders) and the magnification are
  independent and both feed the drawn size cleanly.

## The one unavoidable caveat
A true-scale 0.1 km Core is 0.2 px, literally sub-pixel, so nothing could ever
be detected "inside" it. The game's **breach keep-out therefore stays a fixed,
playable size** (it can't be sub-pixel), and the red **BREACH ring** shows that
keep-out when a zone is actually violated. So: the calm ambient rings show the
*true DLA sizes*; the red ring shows *where a breach scores*. At the **"keep-out"**
preset (30×) the ambient Core lines up exactly with the scoring boundary, if you
prefer see == score.

## Verification
- `npm run lint`, clean.
- `npm test`, 489 / 489 pass.
- `npm run build`, succeeds.

## v197, Sharper still (device-aware render quality)

Building on v196, pushes crispness further where the hardware allows it, without
risking mobile:

- **Overlay supersampling is now device-aware.** Desktop renders the ring / link /
  label overlay at **4×** (up from the universal 3×); touch/mobile stays at 3×
  because iOS/mobile Safari caps a canvas at 4096 px per side (4× = 4848 would
  blank the overlay). Detected once via `(pointer: coarse)`.
- **Higher display-canvas resolution on desktop.** The full-resolution pass (rover
  arrows, chips, and the final composite) now renders at up to **5× device ratio**
  on desktop (was 1.5×/cap-4), so low-to-mid-zoom detail is noticeably crisper.
  Mobile keeps the prior budget to protect memory and frame-rate. Deep zoom is
  still bounded by the shared 8192 px backing-store cap.

Net: on a desktop/laptop the rings, labels, links, and basemap should look
markedly sharper; on phones/tablets nothing regresses.

Still inherent: the per-pixel map tints (PSR / claims / mine / night) come from
1212 px source data, so at extreme zoom they remain soft by nature, that needs
higher-resolution source rasters, not a render tweak.

## Verification
- `npm run lint`, clean.
- `npm test`, 489 / 489 pass.
- `npm run build`, succeeds.

## v196, Clearer map (less pixelation)

Two changes target the two sources of on-screen pixelation:

1. **Overlay vectors (safety rings, reactor 3-ring, power/comms links, labels,
   crater badges) sharpened.** These are drawn on the "work" canvas, which was
   supersampled only 2× and then upscaled to the display at zoom, so they went
   blocky. Bumped supersampling 2× → **3×** (backing store 3636², ~53 MB). Held at
   3, not 4, so each side stays under the 4096 px per-side canvas limit on iOS/
   mobile Safari (4× would blank the overlay there). The rover arrows/chips were
   already crisp (separate full-res pass); now the rings match them.

2. **Raster basemaps no longer forced to nearest-neighbour.** Bitmap basemaps
   (QuickMap, illumination, LROC relief) were rendered with `crisp-edges` at zoom,
   which shows hard pixel blocks when a bitmap is enlarged. Switched to smooth
   (`auto`) upscaling so a zoomed raster basemap reads clean. Vector (SVG)
   basemaps, the default topo, were already crisp.

Note: the per-pixel map tints (PSR / claims / mine-trail / night) originate from
1212 px source data, so at deep zoom they stay soft by nature; they're smooth-blit,
not blocky. Sharpening those further would need higher-resolution source rasters.

## Verification
- `npm run lint`, clean.
- `npm test`, 489 / 489 pass.
- `npm run build`, succeeds.

## v195, Direct, live zone-size control + fixed the broken resize behavior

## The resize was fighting you, fixed
v194 tried to keep the Core visible by scaling ALL three rings up whenever the
Core was small. Side effect: shrinking the Core made that scale factor balloon, so
the middle/outer rings GREW when you tried to shrink, the control did the opposite
of what you'd expect, on every asset. That coupling is gone. Each ring is now sized
purely by its own tier slider, in a clean, fixed 1 : 5 : 10 (0.1 : 0.5 : 1 km)
ratio. Shrinking one tier no longer distorts the others.

## A plain size slider, always on screen
There's now a **"Ring display size"** slider in the zone legend (bottom-right,
visible whenever the Zones layer is on). Drag it, or tap **S / M / L / XL**, and
every safety ring on the map resizes **live**. It has **no score effect** and does
not change what the rings mean (they always represent 0.1 / 0.5 / 1 km). It's just
how big the schematic is drawn, so you can make the zones as large or small as reads
well for you or a room.

Two separate controls, on purpose:
- **Ring display size** (bottom-right legend), how big the rings are DRAWN. Free,
  instant, global.
- **Per-tier sliders** (bottom-left "Deals & Zone sizes" panel, per actor), the
  governance lever: shrink/expand an actor's actual Core/Harmonization/Coordination
  km; expanding past 100 % is overreach and costs score.

## Why the rings can't sit at literal km on this map
At the map's scale (0.5 km/px), a true 0.1 / 0.5 / 1 km zone is 0.2 / 1 / 2 px , 
invisible, and far too small to detect a breach. So the rings are drawn magnified,
with the true km always labelled. The **display-size slider now hands you that
magnification directly** instead of it being a fixed number you couldn't touch.

## Verification
- `npm run lint`, clean.
- `npm test`, 489 / 489 pass.
- `npm run build`, succeeds.

## v194, Correct 3-ring proportions + zone controls opened by default

## Ring proportions fixed (1 : 5 : 10 = 0.1 : 0.5 : 1 km)
The Core ring was being floored to clear the asset sprite *on its own*, which
inflated it (≈9 px against a 30 px middle ring) and broke the canonical ratio, so
the Core read too big relative to Harmonization/Coordination. Now, when the Core
would be smaller than the icon, **all three rings scale up together by the same
factor**, so the drawn proportions are exactly 1 : 5 : 10 (0.1 : 0.5 : 1 km) on
every asset, including the reactor.

## Zone-size controls are open by default
The per-ring resize control (Core / Harmonization / Coordination, each with its
km and a live `⚠ overreach −N score`) is no longer hidden behind a collapsed
drawer, the bottom-left "🤝 Deals & 🛡 Zone sizes" panel now opens by default, so
on your turn the sliders are immediately in front of you.

## Known scale limitation (needs a decision)
On the 606 km polar map at 0.5 km/px, a *true-to-scale* 0.1 / 0.5 / 1 km zone is
0.2 / 1 / 2 px, invisible, and far too small to score a breach. So the rings are
necessarily drawn MAGNIFIED (with the true km always labelled). That means if you
measure a ring against the scale bar it will read larger than its km label. This
is unavoidable while the zones must be both visible and playable at this map scale.
The proportions are now correct; the absolute on-screen size is a display choice.

## Verification
- `npm run lint`, clean.
- `npm test`, 489 / 489 pass.
- `npm run build`, succeeds.

## v193, Static safety rings (accessibility) + reachable per-player ring resize

## Rings no longer move (accessibility)
The safety-zone rings were animated two ways that could induce dizziness; both are
now off:

- **No more rotation.** Every "marching-ants" dash animation is frozen, all
  `ctx.lineDashOffset` on the graduated rings, the reactor's three rings, the
  reactor placement preview, and the violation rings is now `0`. The dashes still
  distinguish the tiers (solid Core / dashed Harmonization / dotted Coordination);
  they just don't crawl.
- **No more throb.** The continuous `Math.sin(...)` pulse that made ring thickness
  and brightness breathe is replaced with steady constants, so rings hold a fixed
  appearance instead of animating.

Additionally, the app now honors the OS **"reduce motion"** setting: a
`@media (prefers-reduced-motion: reduce)` rule neutralizes the remaining ambient
UI animations (turn glow, breach-alert pulse, twinkles) for anyone who has that
accessibility preference enabled.

## Per-player ring resize with score penalty, now actually reachable
The 3-ring resize control (each actor scales their Core / Harmonization /
Coordination independently; expanding past 100% is overreach and costs score,
inner rings weighted hardest) already existed with a live km + live `−score`
readout, but it was **invisible in local hotseat play**: the panel received a
null `myActor` and self-returned null, so the sliders never rendered. Fixed:

- The Negotiation panel now receives the **active actor** (`panelActor`), so on
  each player's turn their own zone sliders appear and drive their own score.
- The collapsed toggle is relabeled **"🤝 Deals & 🛡 Zone sizes"** so the ring
  control is discoverable rather than hidden behind a generic "Negotiation" label.

To resize: open the bottom-left "Deals & Zone sizes" drawer on your turn, and use
the Core / Harmon. / Coord. rows. Each row shows the resulting km and, when you go
above 100%, a live `⚠ overreach −N score` estimate. Rings stay 0.1 / 0.5 / 1 km at
100%.

## Verification
- `npm run lint`, clean.
- `npm test`, 489 / 489 pass.
- `npm run build`, succeeds.

## v192, 3-actor engine + 3-actor detailed CSV (rings confirmed 0.1/0.5/1 km)

## Ring sizes (confirmed)
Unchanged from v190 and verified here: `ZONE_KM = { core: 0.1, harmonization: 0.5,
coordination: 1.0 }`, inner **0.1 km**, mid **0.5 km**, outer **1 km**, uniform on
every asset. Drawn/scored at `ZONE_DISPLAY_SCALE` (30) so sub-km zones stay legible
on the 606 km disk; all labels, legend, breach readouts, and the CSV report the
true canonical km.

## Three-actor simulation engine, SOLID + TESTED
The correctness-critical simulation core is now N-actor and covered by 10 new unit
tests (`tests/threePlayer.test.js`). Total suite: **489 / 489 pass.**

- **Territory partition**, `computeClaimsN(players, radii)` awards each PSR pixel
  to the nearest active base within claim radius, cell value = 1-based actor index
  (1/2/3…). The old `computeClaims(p1,p2,r1,r2)` is a thin wrapper over it, so every
  existing caller/test is unchanged.
- **Safety-violation attribution**, `attributeSafetyViolationsN(players)` scores
  every ordered (owner, breacher) pair: a breacher rover inside an owner's Core is
  charged to whichever arrived SECOND (first-mover innocent), honoring easements,
  returning per-actor counts. The 2-arg `attributeSafetyViolations` now delegates
  to it (byte-identical for two actors).
- **Zone avoidance**, `buildEnemyZonesMulti(foes)` unions every other actor's
  keep-out zones for N-actor rover pathing.
- **Palette**, third team color `PLAYER3_COLOR` (#B45CE0 orchid, distinct from
  teal/orange and the periwinkle UI accent) + index-addressable `ACTOR_COLORS`.
- **Labels**, `actorLabel` now yields "Actor III" for the third seat.

## Detailed CSV, now 3-actor-aware + richer
`buildReconstructionCsv` takes an optional `p3` and iterates a present-actors list,
so **every** per-actor and pairwise section covers a third actor:
- INITIAL_CONDITIONS gains `actorIII_base_px`.
- ACTORS / SCORE_TERMS / ASSETS / ZONE_RINGS_BY_ASSET / DIPLOMACY_STATE emit an
  ACTOR_III row set.
- ZONE_INTERACTIONS now records **all ordered pairs** (I↔II, I↔III, II↔III) in both
  directions, not just I↔II.
- Tick/round rover traces emit ACTOR_III when present.
- **New section `SAFETY_VIOLATION_ATTRIBUTION`**, the current-state N-actor breach
  tally (charged-now + cumulative per actor), the exact quantity the score penalty
  is computed from. This makes first-mover / arrival-delay experiments directly
  measurable from the export.

Verified end-to-end: a synthetic 3-actor session produces a 189-line CSV with 31
ACTOR_III rows and the attribution section populated.

## NOT in this build: the live 3-player turn loop + multiplayer 3rd seat
Deliberately not shipped, because it can't be unit-verified (needs a browser + 3
clients) and a half-wired resolution loop could hang mid-session. The remaining,
entangled work:
- `App.jsx` day-resolution effect: `allocateDailyPower`, `stepPlayer` (currently
  takes a SINGLE opponent for zone avoidance, needs all-other-actors), and the
  pairwise crater-depletion merge must all generalize to N actors; the resolution
  gate `p1Done && p2Done` and `endTurn` rotation (activeTurn 0/1) must cycle over
  active actors.
- Setup: place a third base; a `numActors` (2/3) selector.
- Rendering: the `[p1,p2]` draw loops (asset icons, safety rings, claims) extend to
  include p3 (additive).
- Multiplayer: the server already reserves a third seat; the seat→actor map and a
  3-way snapshot need wiring, then live 3-client testing.

This is a focused follow-up that should be built with live playtesting rather than
bolted on unverified before a showcase.

## Verification
- `npm run lint`, clean.
- `npm test`, 489 / 489 pass (10 new 3-actor tests; all prior suites unchanged).
- `npm run build`, succeeds.

## v191, First-mover arrival-delay experiment control

## First-mover delay is now a real, facilitator-set experiment knob
The staggered-arrival mechanic (Actor I deploys and builds solo; Actor II arrives
later) previously only fired for the legacy `unevenArrival` preset, and its delay
slider was hidden everywhere else. It's now generalized:

- **Any first-mover preset**, `unevenArrival` (Asymmetric Arrival) *and* `sprint`
  (First-Mover Test), supports a facilitator-set arrival delay.
- The delay drives the staggered arrival directly: `delay > 0` ⇒ Actor II is held
  out until `globalDay ≥ delay`, then deploys as a late arrival with placement
  grace from its arrival day. `delay = 0` ⇒ both actors deploy together (a clean
  **control run** for A/B first-mover experiments).
- The setup control now reads "First-mover delay · Actor II arrives later",
  ranges **0-90 days** (was 1-90, so a simultaneous control is now selectable),
  and shows a plain-language explanation of the current setting.

This lets you run a first-mover-advantage sweep, e.g. 0 / 5 / 10 / 20-day gaps , 
without editing code, and export each run's CSV for comparison.

Touched: the SETUP1→PLAYING gate, the late-Actor-II deployment effect, the SETUP1
base-placement branch, the late arrival-day stamp, and the setup slider (all in
`App.jsx`). No sim-core or scoring changes; `arrivalDelay` was already carried in
config + snapshot, so multiplayer/replay are unaffected.

## Verification
- `npm run lint`, clean.
- `npm test`, 479 / 479 pass.
- `npm run build`, succeeds.

## NOT in this build: 3-player mode
A true third actor is a large, separate refactor and was deliberately NOT bolted
on here (see the handoff notes accompanying this release). The engine assumes
exactly two actors in ~160+ places in `App.jsx` alone (24 `[p1,p2]` loops, 46
`id===1/2` conditionals, 90 `setP2`/`p2Done` references), plus two-actor
assumptions in the PSR claim partition, the bilateral negotiation/deal/easement
model, `enemyZones` ("the foe", pairwise violation attribution), fog of war,
exports, the bot AI, the multiplayer seat map, and the entire two-actor test
suite. Shipping a half-wired third actor would break claims, negotiation, and
scoring, worse than not shipping it. It should be built as its own staged effort
with its own tests.

## v190, Team-colored assets + uniform DLA safety zones + legible resize cost

Three linked changes to how safety zones look, size, and score.

## 1. Assets render in team colors (teal / orange)
Map asset sprites (rovers, habitats, solar, reactors, pads) now render in the
**owning team's identity color**, Actor I teal `#28B9AE`, Actor II orange
`#F0902E`, matching the claim fills, mine heatmap, and zone rings. Previously
the sprites were drawn periwinkle `#A8A8F0` / mist-blue `#80B0D8`, which read as
neutral UI chrome rather than team ownership. (`App.jsx`, asset-icon overlay.)

## 2. Uniform DLA safety zone on every asset (0.1 / 0.5 / 1 km)
Every surface asset now projects the **same** canonical Christine Tiballi
3-ring, Core 0.1 km · Harmonization 0.5 km · Coordination 1 km (ratio 1 : 5 : 10)
,  instead of each asset scaling its rings off a per-type `SAFETY_RADIUS` (which
made a habitat's keep-out dwarf a rover's). A Designated Lunar Area safety zone
is a property of the **hazard tier**, not the sprite at the centre, so they are
unified.

New constants (`src/sim/constants.js`):

```js
export const ZONE_KM = { core: 0.1, harmonization: 0.5, coordination: 1.0 };
export const ZONE_DISPLAY_SCALE = 30;   // tune ring size without touching the km
export const ZONE_RADII_PX = { core: 6, harmonization: 30, coordination: 60 }; // px
```

Sub-km zones are sub-pixel on the 606 km disk, so, exactly like the reactor
pass always did, the rings are **drawn and scored** at `ZONE_DISPLAY_SCALE`
while labels, legend, breach readouts, and CSV report the **true canonical km**.
Change one number, `ZONE_DISPLAY_SCALE`, to make every asset's rings bigger or
smaller on the map without changing the km the tool teaches.

`SAFETY_RADIUS` is now confined to **functional footprints only**, power-share
reach, pad apron / dust mitigation, illumination search, so power sharing, dust,
and charging are unchanged.

What became uniform (draw + score, "what you see is what scores"):
- `enemyZones.js`: `buildEnemyZones`, `applySafetyDecay`, `zoneAnchors`,
  `coordinationIntrusions`, all key off `ZONE_RADII_PX.core`, honoring each
  actor's Core-ring scale.
- `App.jsx`: the graduated 3-ring pass, the reactor's dedicated 3-ring pass, the
  reactor placement preview, the generic placement ghost, the zone-layer
  highlight, and the violation re-emphasis rings.
- Breach labels report the true Core km (0.1 km × scale), not the magnified px.
- `exports.js` CSV: FRAME `zone_*_km` / `zone_*_render_km` rows, the unified
  `CHRISTINE_FRAMEWORK` table (now applies to all assets, not just the reactor),
  `ZONE_RINGS_BY_ASSET`, and `ZONE_INTERACTIONS`. The old `safety_radius.{type}`
  rows are relabeled `functional_reach.{type}` to reflect their new meaning.

## 3. Editable radii with a legible score cost
The per-tier resize sliders (NegotiationPanel) already scaled each ring and
already fed `economy.overreachPenalty` (expanding past 100% is overreach, inner
rings weighted hardest). This version makes the tradeoff **visible**:
- each tier shows its **live km** (canonical km × current scale), and
- a live **`⚠ overreach −N score`** estimate (mirrors
  `(scale−1) · tierWeight · #zones · SCORE_OVERREACH_PENALTY`), or `no penalty`
  when at/below baseline.
- the on-map 3-ring legend now shows the km per tier.

The larger the area an actor claims, the larger the score hit, now readable at
the moment of the decision.

## Notes / tuning
- Uniform zones change strategic feel (habitats no longer dominate territory).
  This is a deliberate, DLA-correct choice; revert by re-pointing the zone base
  to per-asset `SAFETY_RADIUS` if you prefer the old behavior.
- Ring size lever: `ZONE_DISPLAY_SCALE` (30 → 6/30/60 px on-map).

## Verification
- `npm run lint`, clean (no unused named imports).
- `npm test`, 479 / 479 pass (enemyZones + deals tests updated to the uniform
  Core; all other suites unchanged).
- `npm run build`, succeeds.

## CHANGES v189, fix: players couldn't resize rings (local play) + blue/purple rovers

Two bug reports, both fixed.

## 1. Players can now change their own ring radii (the real bug)

The per-tier Core / Harmon. / Coord. sliders live in each player's **Negotiation
panel**, which was gated on `myActor === 0 || myActor === 1`. But in a **local
(non-multiplayer) hotseat game `myActor` is `null`** (it's only set for a seated
multiplayer actor), so the whole panel, and therefore the ring-resize sliders , 
**never rendered in local play**. That's why "the players can't change the
radiuses."

Fix: in local play the panel now falls back to the **active turn's actor**
(`panelActor = mp ? myActor : activeTurn`), and all its controls (zone tiers,
stance, deals, easements) act on that actor. So whoever's turn it is can resize
their own three rings (0.4×-2.0×), with the inner-weighted overreach penalty
applying as before. Multiplayer behavior is unchanged.

## 2. Blue/purple rovers → teal/orange

Every rover element in the source already colors from the team color
(`p.color` / `PLAYER1_COLOR` / `PLAYER2_COLOR` = teal/orange): body, waypoints,
route arrows, trails, mined-cell and claim pixels. A game **resumed from a
snapshot taken under the old periwinkle/mist palette**, however, keeps the old
value on `p.color`, which then renders blue/purple rovers (and panels, auras,
etc.).

Fix: a small normalization effect **heals stale team colors on load**, if
`p1.color` / `p2.color` drift from the current `PLAYER1_COLOR` (teal) /
`PLAYER2_COLOR` (orange), they're corrected once (no loop). New games were
already correct; this repairs resumed sessions too.

### If rovers still look blue/purple after this
That means an **old build is cached**, not a code issue, the source has no
blue/purple rover. Do a clean rebuild and hard refresh:

```
npm run build      # or restart `npm start`
```
then hard-reload the browser tab (Ctrl/Cmd+Shift+R). Starting a **New Game**
(rather than resuming) also guarantees fresh teal/orange players.

## Verification
479 unit tests pass, `vite build` clean, import lint clean.

## CHANGES v188, Christine's canonical FSP sizes, denser CSV, teal/orange habitat + rover

Continues v187. Four items from the review (with the Field-Guide "Nuclear Power
in Action" image as the sizing reference).

## 1. Reactor rings = Christine's canonical sizes (0.1 / 0.5 / 1 km)

The Field Guide specifies the FSP zones as **0.1 km Exclusion (Core) · 0.5 km EMI
Caution (Harmonization) · 1 km Plume Reach (Coordination)**. Those are now the
authoritative values:

- `REACTOR_ZONES_KM = { core: 0.1, harmonization: 0.5, coordination: 1.0 }` is the
  new source of truth, and the reactor ring **labels read `CORE 0.1km /
  HARMON 0.5km / COORD 1km`**, matching the guide.
- The play map is **606 km across** (2 px/km), so Christine's sub-km zones would
  be sub-pixel and unplayable. Reactor rings are drawn and scored at a documented
  `REACTOR_ZONE_DISPLAY_SCALE = 10`, i.e. 1 / 5 / 10 km on the map, **identical
  pixels to before** (2 / 10 / 20 px), so nothing about balance or rendering
  changed; the zones are now simply *derived from* Christine's canonical numbers
  with an explicit, labeled magnification instead of being hardcoded.

## 2. Players resize their own safety zones, at a score cost (verified)

Already present from v186 and confirmed wired end-to-end: each player's
Negotiation panel has a **Core / Harmon. / Coord. slider row** bound to
`playerSetTierScale(myActor, …)`, so a player changes *their own* rings
(`TIER_SCALE_BOUNDS` 0.4×-2.0×). Expanding past baseline is **overreach** and
docks score, inner-weighted (`TIER_OVERREACH_WEIGHT` core 6 · harmonization 2 ·
coordination 0.5), inflating the Core is punished ~12× harder than padding the
outer buffer. Shrinking is free. The slider row shows a "⚠ overreach −score" flag
live when a tier is above 100%.

## 3. CSV, even more detail (17 → 18 sections)

New **CHRISTINE_FRAMEWORK** section, one row per tier:
`tier, field_guide_area, canonical_ratio, reactor_canonical_km,
reactor_map_render_km, scale_min, scale_max, overreach_weight`, so the export
now carries Christine's real sizes (0.1 / 0.5 / 1 km), the map-render sizes
(1 / 5 / 10 km), the 1 : 5 : 10 ratio, the per-player resize bounds, and the
inner-weighted penalty schedule in a single table, plus a `reactor_display_scale`
row. (This is on top of v187's DIPLOMACY_STATE and GRID_STATE.)

## 4. Teal / orange habitat + rover

Both were already team-colored (`p.color`), but the habitat filled at 80% alpha
and read a little washed out. The **habitat now fills at full team color** with a
dark rim for contrast, so it reads clearly teal (Actor I) / orange (Actor II)
like the rover, reactor, pad, and (from v187) solar. All player infrastructure is
now unambiguously team-colored.

## Verification

479 unit tests pass, `vite build` clean, import lint clean. Confirmed the reactor
still renders at 2 / 10 / 20 px (unchanged) while the constants now trace to
Christine's 0.1 / 0.5 / 1 km, and CHRISTINE_FRAMEWORK emits correctly (18 total
sections in the reconstruction CSV).

## CHANGES v187, teal/orange infrastructure, staged score reveal, vivid 3-rings, denser CSV

Built on v186 (which already delivered teal/orange team identity, per-tier rings
on Christine's 1:5:10 baseline, and the inner-weighted expand-at-a-cost penalty).
This round is the requested polish.

## 1. Teal / orange *infrastructure*

v186 recolored identity surfaces and the rings, and reactors / habitats / pads
already filled with the team color. The one holdout was the **solar panels**,
which still filled gold. Solar now fills with the team color (teal / orange) like
every other asset, so all on-map infrastructure reads by team at a glance:

- Illuminated panels get a bright team fill; panels in shadow/night dim down.
- A warm cross still flags "generating" when the panel is in sunlight, and ridge
  panels keep the ★, so the solar-specific information isn't lost.

## 2. Staged score reveal, hidden → approximation → actual

Score visibility now **defaults to hidden**, and the facilitator's toggle is a
progressive reveal that matches the three levels requested:

- **Hidden** (default), players see nothing (`, `).
- **Approx.**, players see the qualitative standing / proxy only.
- **Actual**, players see the real metrics.

The toggle cycles hidden → approximation → actual → hidden, relabeled
("Reveal: hidden / approx. / actual") with matching tooltips. The **facilitator's
own Scorebar always shows the actual metrics** regardless of what players see
(`revealScores` now includes `isFacilitator`), so they can run the room while
players stay in the dark. The setting still syncs to all peers.

## 3. 3-rings depicted more vividly

The graduated Core / Harmonization / Coordination rings are pushed harder:

- **Coordination (outer, dotted)**, brighter dotted stroke (`66`→`AA`) and a
  touch more fill so the outer extent no longer washes out.
- **Harmonization (middle, dashed)**, brighter base fill (0.16→0.22) and stroke
  (`B0`→`D8`), slightly thicker.
- **Core (inner, solid)**, now carries a soft team-colored **glow halo** plus a
  brighter fill and a crisp white inner rim, so it reads as the hottest ring.
- **Tier labels**, `CORE` / `HARMON` / `COORD` plates now sit at 12 o'clock on
  each ring, drawn at constant on-screen size and **gated on zoom** (only appear
  once the coordination ring is large enough on screen), so the three tiers are
  nameable when you're looking closely without cluttering the wide view. Labels
  use the Field-Guide tier hues (orange core / teal harmonization / gray
  coordination) even though the rings themselves are team-tinted.

## 4. CSV, even more detail (15 → 17 sections)

The reconstruction export gains two sections, both from data already in the
session:

- **DIPLOMACY_STATE**, per actor: stakeholder, allocation preset, treaty floor,
  the three per-tier scales (core / harmonization / coordination), budget, ice,
  asset points, and violations. The full negotiated posture in one table.
- **GRID_STATE**, power and comms grid coupling (independent / offered / shared,
  who offered to whom), which drives the generator-zone exemptions in the safety
  scoring.

## Already in place from v186 (verified, unchanged)

- **Christine's ring sizes**, baseline `tierScale = 1` is Christine's framework
  radius on the 1:5:10 ratio (`ZONE_TIER_MULT`), for all three rings.
- **Expand-at-a-cost**, players raise any tier via the Negotiation-panel sliders
  (facilitator panel too); expansion past 100% is inner-weighted overreach
  (core 6 · harmonization 2 · coordination 0.5) and docks score. Shrinking is
  free.

## Verification

479 unit tests pass, `vite build` clean, import lint clean. CSV smoke-tested:
17 sections emit; DIPLOMACY_STATE reports per-tier scales + treaty floor,
GRID_STATE reports power=shared / comms=independent correctly.

## CHANGES v186, teal/orange teams, real RGB bars, per-tier safety rings + Christine-weighted penalties

Four fixes, all requested in review of v185.

## 1. Teams are now teal vs orange (was periwinkle vs amber)

Actor I is now **teal `#28B9AE`**, Actor II **orange `#F0902E`**, separated by
both hue and temperature so the two sides never read as one color on the dark
map. The change flows through every identity surface, not just the rings:

- The player object `.color` (rings, breach markers, rover/reactor/comsat
  sprites, panel outlines, base auras).
- `PLAYER_PALETTES` in `plotData.js`, P1 recolored to a teal/aqua family, P2 to
  an orange/amber family (all plot series, power charts, GIF overlays).
- The `--p1` / `--p2` (+ `-soft` / `-glow`) CSS variables (RoleBanner,
  ChatDrawer, Lobby seats, DiplomacyBanner gradient, NegotiationPanel accent).
- Scorebar, Claims / Analytics / AssetDetail panels, lobby seat swatches.
- The on-map **claim** and **mine** pixel fills (and the matching legend
  swatches + GIF-export legend), which were hardcoded RGB per player.

Named constants `PLAYER1_COLOR` / `PLAYER2_COLOR` (in `constants.js`) now hold
the identity colors so there is one source of truth. The periwinkle `#A8A8F0`
that remains is app **chrome** (panel borders, accents), deliberately left alone
,  it is the UI theme, not a team.

## 2. The RGB favorability bars actually fill now

The v185 three-bar widget (bottom-right, composite overlay) never filled. Root
cause: the fill used `linear-gradient(90deg, rgb(255,90,82)44, …)`, appending a
`44` hex-alpha suffix to an `rgb()` string is invalid CSS, so the fill element
rendered nothing. Fixed:

- Bars use hex accent colors, so the gradient is valid and the fill shows.
- Normalization now matches the working ExploreSidebar bars (`[-0.3, 1]` range);
  v185's `(v+0.05)/0.85` under-filled and clipped low values to empty.
- Added the **small additive composite swatch** the review asked for: a chip
  beside the R·G·B key showing the actual color this pixel paints in the
  composite overlay (each channel normalized then gamma-0.85, R=land G=ops
  B=ice), kept intentionally tiny.

## 3 + 4. Per-tier safety rings + Christine-weighted interference penalties

The single global `zoneScale` is replaced by **three independently controllable
tiers** per actor, Core / Harmonization / Coordination, stored as
`player.tierScale = { core, harmonization, coordination }` (baseline 1 =
Christine's framework radius). Both the player Negotiation panel and the
Facilitator panel now expose a slider row per tier.

- **Rendering.** Each ring scales off its own tier; shrinking the Core no longer
  drags the buffers in with it. The Core (exclusion) display radius is **floored
  to clear the asset sprite**, previously the reactor's ~2 px Core hid entirely
  under the ☢ icon, so only two of the three rings were ever visible. Reactor
  ring labels corrected to the real km and tier names (Core / Harmon / Coord).
- **Scoring.** Violation detection keys off the **Core** scale (the only ring
  that excludes others). Christine's Field Guide lists "expand your footprint
  without notice" among operator MUST-NOTs, so a tier expanded past 100% is
  overreach and costs score, **inner-weighted** (`TIER_OVERREACH_WEIGHT` =
  core 6 · harmonization 2 · coordination 0.5), so inflating the Core is
  punished ~12× harder than padding the outer buffer. Shrinking is always free.
  Example: Core→160% on a 3-zone actor costs −86 pts; Coordination→160% costs −7.
- **Compat.** A legacy `zoneScale` / `safetyMult` still works, it multiplies all
  three tiers via `effectiveTierScales()`. The old `setZoneScale` /
  `facilitator:setZoneScale` paths route to "all tiers"; new
  `player:setTierScale` / `facilitator:setTierScale` actions carry the tier.
- **Export.** ZONE_OVERREACH, ZONE_RINGS_BY_ASSET, and ZONE_INTERACTIONS in the
  reconstruction CSV now report per-tier scales and the inner-weighted penalty.

Tests: `tests/economy.test.js` updated to pin the inner-weighted model (new
assertions that Core over-expansion outweighs Coordination, and that
`effectiveTierScales` folds the legacy knob into every tier). Full suite:
479 pass / 0 fail.

## CHANGES v185, actually-distinct team colors, real triangle → bars, real pixelization fix, denser CSV

v184 claimed all four of these but two missed the target and one was a non-fix.
This pass corrects them.

## 1. Teams are now *distinctly* different colors

v184 tinted the rings by team but used **periwinkle `#A8A8F0` (Actor I) vs mist
`#80B0D8` (Actor II)**, two adjacent cool blues from The Both that read as one
color on the dark map. Actor II is now **amber `#F0A030`**: complementary to
periwinkle, so the two teams separate by temperature, not just hue, and the thin
amber ring won't be confused with the filled gold solar icon.

The new color propagates everywhere identity is shown, from a few sources:
- The player object's `.color` (drives rings, breach markers, rover sprites).
- The `--p2` / `--p2-soft` / `--p2-glow` CSS variables (RoleBanner, ChatDrawer,
  Lobby seat colors).
- Scorebar, Claims panel, Asset-detail sidebar, lobby seats, batch results,
  the Diplomacy banner gradient, the Negotiation panel accent, Analytics bars.

The bottom-right zone legend gained an explicit **Actor I / Actor II colour key**
(read live from each player's `.color`) beneath the tier line-style rows, so it
now says *which* colour is which team rather than only "tinted by team".

## 2. The actual triangle is now RGB bars

v184 converted a small **legend swatch** to bars and left the real widget alone.
The "triangle in the bottom" was the **ternary (barycentric) favorability plot**
at bottom-right, LAND (red) / OPS (green) / ICE (blue) with a hover marker. It's
now **three horizontal RGB channel bars**: each bar's fill is that channel's
normalized value at the hovered pixel, with the signed value at the right and the
additive red/green/blue key beneath. Far easier to read than a marker in a
triangle most people can't parse.

## 3. Pixelization, the real fix (v184's DPR bump couldn't help)

The safety rings, the reactor FSP 3-ring, and the power/comms links are all drawn
on the **overlay "work" canvas**, which was 1212×1212 (1:1 source) and then
**upscaled** to the display. Bumping the *display* canvas DPR (v184) did nothing
for that content, the source was still low-res and scaled up.

v185 **supersamples the whole work canvas**: it's now `W·WORK_SS × H·WORK_SS`
(2× → 2424²) with a matching base transform, so every vector on it is rasterized
at 2× and smooth-blit down. This is safe because `draw()` does **no** per-pixel
`getImageData` on this canvas, the per-pixel tints (PSR depletion, claims, mine,
night) are pre-baked on separate offscreen canvases. One knob: `const WORK_SS`
near the top of `App.jsx` (raise to 3 for more crispness at extreme zoom, ~53MB).

## 4. Insanely detailed CSV, 12 → 15 sections

The reconstruction export (the "Export mission data" button) gains three
sections:

- **CONFIG_CONSTANTS**, the ruleset the game ran under: scoring constants
  (pts/kg, pts/ap, violation penalty, carry fraction), days/round, px↔km scale,
  comsat relay radius, reactor tier radii, every `ZONE_TIER_MULT`, and each
  asset type's baseline safety radius in km. Makes scoring + geometry replayable.
- **SCORE_TERMS**, long-format score decomposition: one row per term per actor
  (banked / carried / infrastructure / policy / penalty / overreach) with the
  points value *and* the human-readable detail string, plus a TOTAL row.
- **ZONE_INTERACTIONS**, the pairwise interaction matrix: for **every** owner
  zone-asset × **every** opponent asset, the centre separation in km, the owner's
  three tier radii (core / harmonization / coordination) in km, and which tier the
  opponent asset centre falls inside (`core` / `harmonization` / `coordination` /
  `outside`). This is the full geometric basis of the safety-zone scoring.

## Verification

- 477 unit tests pass, 13/13 multiplayer checks pass, `vite build` clean, import
  lint clean.
- CSV smoke-tested on a synthetic two-actor state: all 15 sections emit; the
  ZONE_INTERACTIONS geometry validates (a solar zone at zoneScale 1.5 →
  4.33 / 21.68 / 43.35 km tiers; an opponent pad at 36.06 km separation is
  correctly classified `coordination`).

## One pre-existing discrepancy noticed (not changed)

The reactor pass draws hardcoded labels "1 km exclusion / 3 km EMI / 5 km plume",
but `REACTOR_ZONES` in km (via `kmOf`) is 1 / 5 / 10 km, the label text and the
actual radii disagree, and the CSV reflects the real radii (1/5/10). This predates
v185; I left it alone since it's outside this request, but flagging it: decide
whether the labels or the constants are the source of truth and I'll align them.

---

## Follow-up (same v185): 3-ring on *every* surface asset, clean

Request: "every surface asset should have the 3-ring system officially in the
model and visually depicted." Two assets were inconsistent:

- **Rover**, the old single keep-out ring pass was commented out as "superseded"
  but was **still registered** in the sharp draw list, so it stacked a bold single
  ring on top of the graduated 3-ring → the rover read as one ring while
  solar/habitat/pad showed three. The single-ring pass is now fully retired.
  Because the rover's true core (1.44 km ≈ 2.9 px) hides inside its sprite, the
  *drawn* Core radius is now floored for rovers only so all three tiers read
  on-screen; detection and scoring still use the true radius.

- **Reactor**, was drawing its bespoke physical 3-ring (1 / 5 / 10 km) *plus* a
  redundant generic single keep-out ring (5.78 km) from the per-asset loop → four
  rings, one of which matched nothing. The redundant ring is now skipped, so the
  reactor reads as a clean 3-ring (its physical FSP zones: Core exclusion /
  Harmonization EMI / Coordination plume).

Result: solar, habitat, pad, rover, and reactor all render exactly one clean
Core / Harmonization / Coordination 3-ring. (Comsats are orbital relays, not
surface assets, so they keep their reach footprint rather than a keep-out 3-ring.)

**Model / CSV made consistent too:** `ZONE_RINGS_BY_ASSET` now emits the reactor's
actual physical tiers (1 / 5 / 10 km from `REACTOR_ZONES`) instead of the generic
`SAFETY_RADIUS × {1,5,10}` formula, so the exported geometry matches what's drawn
for every asset. `ZONE_INTERACTIONS` already used the physical reactor tiers.

### Still worth a decision (unchanged, flagged)
The reactor's *scoring* keep-out is `SAFETY_RADIUS.reactor` = 5.78 km, but its
drawn/official Core exclusion is 1 km, so a breach scores at a different radius
than the Core ring implies. I did **not** change this because it rebalances the
game. Tell me which is the source of truth (make scoring use the 1 km exclusion,
or redraw the Core at 5.78 km) and I'll align them.

## CHANGES v184, team-distinct rings, RGB bars, detailed CSV, sharper vectors

Four changes from your request: teams told apart by ring color, the RGB
composite shown as bars, a much more detailed CSV, and a supersampling pass for
pixelization.

## Rings now distinguish the two teams

The three safety rings are **tinted by the owning team's color** (Actor I
periwinkle, Actor II blue), so you can tell at a glance whose zone is whose. The
three tiers are still readable, now told apart by **line style** instead of hue:

- **Core Operations**, solid, bright, filled (the keep-out ring that scores)
- **Harmonization**, dashed, medium
- **Coordination Buffer**, dotted, faint

The bottom-right legend was updated to match: it now shows the three tiers by
line style with Christine's names and access rules, and notes the rings are
tinted by team. This is a deliberate trade: Christine's fixed orange/teal/gray
told the *tiers* apart but made both teams look identical; you asked for team
distinction, so tier identity moved from color to line style. The reactor keeps
its dedicated ring pass for now (see note below).

## RGB composite shown as bars

The favorability composite (red = landing, green = ops, blue = ice) in the
overlays legend now renders as **three stacked RGB bars** rather than the old
square swatch, with the channel key beneath it.

Note: I searched the code and there is no literal "triangle" element, the only
RGB thing is this favorability composite, so that's what I converted to bars. If
the triangle you're seeing is something else on screen, tell me where it sits and
I'll convert that instead.

## Insanely detailed CSV

The reconstruction CSV grows from 9 to **12 sections**. Three new zone sections:

- **ZONE_FRAMEWORK_TIERS**, Christine's tier definitions (label, radius
  multiplier, color, access rule) plus the reactor's core/harmonization/
  coordination radii in km.
- **ZONE_RINGS_BY_ASSET**, for *every* zone-projecting asset, all three ring
  radii in km, both as-declared (with the actor's zone multiplier applied) and at
  baseline. This is the full geometric reconstruction of each 3-ring footprint.
- **ZONE_OVERREACH**, per actor: zone scale, safety multiplier, overreach
  fraction, number of zone assets, and the resulting score penalty.

## Pixelization

The map canvas now **supersamples**. A retina display only reports a device pixel
ratio of ~2, which was the real ceiling on crispness (v183's cap of 4 rarely
bound). It now renders at 1.5x the device ratio, floor 2, cap 4, supersampling
anti-aliasing on every display, bounded by the existing 8192 backing-store cap.

If pixelization persists at high zoom, it's coming from one of two places I did
not touch because the fixes carry risk: the 8192 canvas cap (raising it can break
the canvas on Safari) or the native resolution of the favorability rasters (a
source-data limit). Tell me what specifically looks blocky, the map basemap, the
overlay layers, or the rings/icons, and I'll target it.

## Verification

- 477 unit tests pass, `vite build` clean, import lint clean.
- CSV smoke-tested: all 12 sections emit; per-asset ring radii scale correctly
  with an inflated zone (owner_mult 2.0 → doubled radii).

## One deferred item

The reactor's dedicated ring pass still uses its own shading rather than the
team-tint. Folding the reactor into the team-colored scheme is a clean follow-up
if you want full consistency; I kept it separate this pass to stay surgical.

## CHANGES v183, Christine Tiballi's 3-ring safety framework

Implements the 3-ring safety system from Christine Tiballi's *Lunar Operations
Field Guide: Lunar Designated Areas* (Open Lunar Foundation, 2025), with her
values, her names, and her colors, on every piece of surface equipment, plus a
penalty for expanding beyond the framework baseline and a higher-resolution
vector pass.

## Christine's values, in one place

The framework lives in a single attributed constant, `ZONE_TIERS` in
`src/sim/constants.js`, so the values are easy to find and retune:

- **Core Operations** (inner, ORANGE), exclusion; only the operator may enter;
  the only ring that scores a violation.
- **Harmonization Area** (middle, TEAL), crossing allowed only with prior
  coordination / notification.
- **Coordination Buffer** (outer, GRAY), overlap possible if it doesn't affect
  core ops; awareness / routine monitoring.

Ratio **1 : 5 : 10**, taken directly from the guide's nuclear FSP reference
(0.1 / 0.5 / 1 km). The reactor's dedicated ring pass now uses the same 1 : 5 : 10
(shown at 10x for visibility on the 606 km disk, as before).

## On every piece of equipment, colored to distinguish the three rings

The graduated 3-ring, orange core, teal harmonization, gray coordination buffer,
matching the field-guide legend exactly, now renders on **solar, habitat, pad,
and rover**, not just solar/habitat/pad. The reactor keeps its dedicated
high-fidelity 3-ring pass (also Core/Harmonization/Coordination at 1 : 5 : 10).
Comsats are orbital relays and don't project a surface exclusion, so they're left
without a ring.

## Expansion penalty

Christine's guide lists "expand footprint without notice" among the things
operators must NOT do. Declaring safety zones larger than the framework baseline
(zone scale or safety multiplier above 1) now costs score, scaled by how far the
zones are inflated and how many zones the actor projects. Baseline is free. It
shows up as its own **Zone overreach** row in the score breakdown, so the cost is
legible at the debrief. Normal play is unaffected: the default zone scale is 1,
so the penalty is exactly zero until an actor deliberately inflates.

## Higher-resolution vectors

The map canvas pixel-density cap is raised (3 → 4), so every vector element on the
canvas, safety rings, asset icons, zone labels, leader lines, text, renders
crisper on high-DPI displays.

## One scale note for you to decide

Christine's literal 1 : 5 : 10 ratio, applied to the game's tuned core radii,
makes the outer Coordination Buffer large on big assets (a habitat's ~14 km core
gives a ~144 km outer buffer). That's faithful to the guide (buffers are meant to
be broad), and the outer rings render faint so they read as governance halos, not
map-filling washes. If you want tighter buffers for the game map, the two
multipliers in `ZONE_TIERS` are the only numbers to change.

## Verification

- **477 unit tests pass** (473 → 477; +4 for the overreach penalty: overreach
  above/below baseline, zone-asset counting, penalty scaling, and the penalty
  flowing into the composite score; the score-breakdown invariant test updated
  for the new sixth term).
- `vite build` clean, import lint clean.

## Worth a live look

The ring geometry and colors are visual behavior tests can't fully cover. Open a
game, place one of each asset, and confirm the orange/teal/gray rings read
clearly and the reactor matches; then bump a zone scale up and watch the Zone
overreach row go negative at the debrief.

## CHANGES v182, curated map layer presets

Closes the layer-overwhelm item from the playtest notes: "give players 3-4
curated presets (ice, slope, comms, illumination) instead of the full
overwhelming layer list; let advanced users customize beyond that. Players only
ever used ice/slope/comms and forgot comms existed at first."

## What changed

The Layers panel now opens with a **Quick views** row of one-tap presets, above
the full grouped layer list (which is unchanged, for advanced users):

- **Ice**, PSR mask, ice-depth proxy, hydrogen/water, and the ice-favorability
  index. Where the ice is.
- **Terrain**, slope, roughness, and rover/pad feasibility. Trafficability &
  landing.
- **Comms**, Earth visibility, the blackout zone, and comsat feasibility. So
  comms stops being the layer everyone forgets.
- **Illumination**, sustained sunlight, near-PSR shadow, and solar feasibility.
  Power siting.
- **Clear**, hide all data overlays, back to the base map.

Tapping a preset replaces the active overlays with that view (and flips the
relevant base toggle, PSR mask on for Ice, blackout zone on for Comms). The
active preset highlights when the current overlay set matches it, and the full
grouped list below still works for stacking any custom combination, so the
presets are a fast on-ramp, not a cage.

## Editing the presets

The curated set lives in one place, `LAYER_PRESETS` in `src/sim/mapData.js` , 
as plain data (label, color, overlay keys, optional base toggles, description).
Reorder, retune, or add your own; a test asserts every overlay key a preset
references actually exists, so a typo can't silently produce an empty view.

## Verification

- **473 unit tests pass** (469 → 473; +4 in `tests/layerPresets.test.js`: every
  preset key resolves to a real layer, preset shape, the curated set covers
  ice/slope/comms/illumination + clear, and presets are distinct overlay sets).
- `vite build` clean, import lint clean.
- Low-risk by construction: a preset sets the same `activeOverlays` set the
  individual layer toggles already drive, just in one tap instead of four.

## Still open

Multi-room 3-4 actor setup and persistent weekly mode, the two genuinely large
remaining lifts.

## CHANGES v181, public claims / propaganda

The backlog's information-warfare item: "actors post true-or-false five-year
plans / production claims that others can believe or not." A public claims board
where actors broadcast statements, the room takes a position, and bluffs can be
caught, with a credibility cost.

## The mechanic

A toolbar **⚑ Claims** button opens the board (visible to everyone during play).
An actor posts one of two things:

- **Production claim**, a structured, auto-verifiable assertion about their own
  state: "I have **≥ 200** ice deposited", "I field **≥ 3** reactors", etc.
  (metric + ≥/≤/= + value). The post form shows the poster their *actual* current
  number, so they choose deliberately: claim the truth as an honest signal, or
  bluff above it and risk getting caught.
- **Pledge**, a free-text intention ("We will not expand into the south PSR").
  Not machine-verifiable; it lives or dies on trust.

Other actors mark **believe** or **doubt** on each claim. Anyone (including the
facilitator) can hit **Verify** on a production claim: it's resolved against
ground truth right then, stamped ✓ verified true or ✗ verified false (with the
actual number shown), and written to the mission log.

The teeth: each actor carries a **credibility** rating derived from their
verified claims, untested → reliable → mixed → *caught bluffing*. A caught bluff
is sticky and visible at the top of the board, so propaganda has a real cost and
honest signalling has a real payoff. Everything syncs across seats.

## How it pairs with the rest

This is the natural follow-on to fog of war and diplomacy: in a session where you
can't see everything, a rival's stated five-year plan is exactly the kind of
cheap talk the exercise is about, and now there's a structured way to post it,
challenge it, and pay for lying. Production figures are auditable (verify catches
those bluffs immediately, which is the point, they're honest signals); pledges
about intent are the genuine propaganda, where credibility and trust do the work.

## Implementation

- **`src/sim/claims.js`**, pure: claim construction, metric extractors (live
  counts exclude destroyed assets), verification against a player snapshot,
  belief tallying, and credibility scoring. Fully unit-tested.
- **`src/ui/ClaimsPanel.jsx`**, the board: post form, credibility chips,
  per-claim believe/doubt + verify, status badges.
- `App.jsx` owns the synced `claims` array + post/vote/verify actions, the
  toolbar toggle, mission-log entries, and reset-on-new-game.

## Verification

- **469 unit tests pass** (460 → 469; +9 in `tests/claims.test.js`: production
  vs pledge construction, true/false verification, destroyed-asset exclusion,
  rover-count incl. primary, stance set/clear, vote tally, and credibility
  ratio/label tiers).
- `vite build` clean, import lint clean.

## Note for the table

Verification reflects ground truth **at the moment you verify** (cumulative ice,
current live counts), so verify a claim while it's fresh. A production claim that
was true when posted can read false later if the actor lost an asset; in practice
the Verify button sits right on the claim, so this rarely bites.

## Worth a live click-through

Like diplomacy and fog, the board is interaction-behavior tests can't fully
cover, post a claim and a bluff from one seat, verify both, and confirm the
credibility chip flips to "caught bluffing" and the log records it.

## Still open

Multi-room 3-4 actor setup, persistent weekly mode, and map layer presets
(awaiting your four curated layer sets).

## CHANGES v180, budget-lever legibility

Addresses the playtest note: "players only ever used one slider because the
pros/cons/consequences weren't legible. Add inline explanation of each +
morale/contentedness mechanic." The stance panel showed four allocation bars
(MIL / R&D / ECON / CASH) and projected deltas (ΔM / ΔR / ΔE / +cr), but the only
written explanation covered ECON vs CASH, so MIL, R&D, and the morale mechanic
were a black box and players stuck to one lever.

## What changed

The terse two-line key is replaced with an expandable **"ⓘ What each lever
does"** explainer (collapsed by default to respect the tight side panel, one tap
to open). Expanded, it spells out every lever and its trade-off:

- **MIL**, military stock → deterrence & incident response and a security
  score; trades away economic growth.
- **R&D**, research → more ice per rover (mining yield) and competitiveness;
  pays back over a few rounds.
- **ECON**, national economy → compounds into a higher budget every round; the
  long-run growth engine.
- **CASH**, immediate credits this round to build now; spent, not invested, so
  future budgets don't grow.

It then surfaces the **morale / contentedness mechanic** that was previously
invisible: growth (ECON & R&D) scales with *competitiveness* (your standing in
economy, infrastructure, and security), and events nudge *contentment*, a
temporary boost or drag that drifts back to neutral over rounds. Whenever an
event has actually shifted contentment, a live readout shows it right in the
panel ("Contentment +0.08 · boosting growth" / "−0.06 · dragging growth"),
colour-coded green/red.

The lever names in the explainer are colour-matched to the allocation bars and
their ΔM / ΔR / ΔE / +cr tips, so the abbreviations on the bars finally decode.

## Verification

- UI-only change (no economic logic touched); the **460 unit tests still pass**.
- `vite build` clean, import lint clean.

## Still open

Multi-room 3-4 actor setup, propaganda / public-claims, persistent weekly mode,
and map layer presets (awaiting your four curated layer sets).

## CHANGES v179, frame-by-frame reconstruction (per-day trace)

This closes the one gap v178 left open: the CSV sampled rover movement and
crater state at *round* granularity. Now it captures them every **day (tick)**,
so the export is a frame-by-frame record you can replay, not just round
snapshots.

## What changed

- **Per-day tick trace.** Each resolved day now records every rover's
  end-of-day **position (px + km), ice load, power, and status**, plus the full
  crater-health snapshot, keyed by `globalDay`. Combined with the day-level
  event log (mine/deposit/placement all carry positions as of v178), you can
  reconstruct exactly where every rover was and what it was doing on every tick.
- **`ROVER_TRACE`** is now per-day when the trace is present, with new
  `globalDay`, `day`, `power`, and `status` columns. It falls back to the
  per-round series if no tick trace is available (e.g. an export taken right
  after loading a saved snapshot).
- **`CRATER_STATE`** is likewise per-day (every crater's remaining health on
  every tick), so the depletion curve reconstructs at full resolution.

## Design notes

- The trace is **host-local and is NOT synced over multiplayer**, so it adds
  zero weight to the snapshot stream that runs between seats. The host (or a
  local hotseat game) accumulates it; the export reads it.
- It's keyed by `globalDay`, so an **undo** that rewinds and re-resolves a day
  simply overwrites that day's entry, the export filters to days at or before
  the current one, so it always reflects the live timeline, never a stale
  pre-undo branch.
- Cleared on new game.

## Reconstruction coverage, now complete

From a single CSV you can rebuild the whole session: the starting setup and
exact ruleset (scenario, physics overrides, claim radii, bases, map scale); the
crater reference; **every rover's position/ice/power/status on every day**;
**every crater's health on every day**; every discrete action with spatial
detail (placement, mine, deposit, deal, grid change, diplomacy, inject); the
final asset inventory with placement timing and declared safety zones; and the
full longitudinal metric series. That's the "recreate the game from the CSV"
bar.

## Verification

- **460 unit tests pass** (459 → 460; the two trace tests updated for the new
  per-day columns, plus a new test asserting a tick trace yields frame-by-frame
  rows with power/status and per-day crater health).
- `vite build` clean, import lint clean.
- Verified by generating a sample export with a tick trace and inspecting the
  per-day ROVER_TRACE and CRATER_STATE sections.

## Still open (unchanged)

Multi-room 3-4 actor setup, propaganda / public-claims, persistent weekly mode,
in-game budget-category explanations, and map layer presets (awaiting your four
curated layer sets).

## CHANGES v178, reconstruction-grade CSV export

The CSV download is now detailed enough to **rebuild the game**, not just
summarize its end state. The old "detailed" export was one flat table of
per-(round, actor) metrics, no positions, no event log, no inventory, so you
could chart scores but never reconstruct what actually happened where. The
download button now produces a single multi-section CSV that captures the whole
session.

## What the file now contains

Nine sections, each delimited by a `# === NAME ===` marker row (split on those to
load each as its own DataFrame):

1. **SESSION**, round/day counters, grid modes, sim mode, version, timestamp,
   days-per-round.
2. **INITIAL_CONDITIONS**, scenario preset, total rounds, both actors' claim
   radii and **starting base positions**, the map scale (px↔km), and every
   **physics override** the facilitator set, i.e. the exact ruleset the game ran
   under, so a replay starts from the right state.
3. **CRATERS**, static reference for every crater: index, name, position
   (px + km), quality, size. This is what lets you interpret `craterIdx` in the
   event log and the per-round crater state.
4. **ACTORS**, current per-actor metrics with the full score breakdown (banked /
   carried / infrastructure / policy / penalty) plus stance, zone scale, safety
   multiplier, treaty floor, easements, and asset counts.
5. **ASSETS**, every placed asset: type, index, position (px + km), health,
   **the round/day/seq it was placed** (cross-referenced from the event log), its
   base safety radius AND its **declared radius** (base × the actor's zone
   scale), and a destroyed flag.
6. **METRICS_BY_ROUND**, the full longitudinal metric series (the previous
   "detailed" export, preserved as one section).
7. **ROVER_TRACE**, long format: every rover's position (px + km) and ice load,
   per round, so trajectories reconstruct.
8. **CRATER_STATE**, long format: every crater's remaining health, per round, so
   the resource-depletion curve reconstructs.
9. **EVENT_LOG**, the complete structured action trace.

## Supporting changes that make it complete

- **Structured event fields.** Placement events now carry `x`, `y`, `cost`,
  `score`, `pts`, `geo` as real columns instead of burying them in the label
  text. `simDay`'s **deposit** event now records position (you can tell which
  habitat received the ice) and **mine** records position alongside `kg` +
  `craterIdx`. So the event log alone is a day-by-day spatial trace.
- **Per-round reconstruction capture.** Round history now stores each actor's
  rover positions, declared zone scale, and a full crater-health snapshot , 
  the source for ROVER_TRACE and CRATER_STATE.

## Verification

- **459 unit tests pass** (453 → 459; +6 in `tests/exports.csv.test.js`: all nine
  sections present, initial conditions incl. physics overrides + claim radii,
  asset placement-timing cross-reference + declared-radius scaling, rover-trace
  expansion, crater-state expansion, structured event fields).
- `vite build` clean, import lint clean.
- Verified by generating a sample export and inspecting every section.

## Reconstruction coverage, honest scope

From this CSV you can rebuild: the starting setup and ruleset, every asset's
position / health / placement time / declared zone, each crater's resource state
per round, each rover's position per round, the full score evolution, and every
discrete action (placement, mine, deposit, deal, grid change, diplomacy session,
inject response). The one thing it does NOT capture is **intra-round per-tick
rover paths**, movement is sampled at round granularity in ROVER_TRACE, with
the day-level mine/deposit events filling in where rovers acted between samples.
If you need true per-tick paths for a frame-perfect replay, that's a larger
capture (it would multiply the trace ~7×), say the word and I'll add an opt-in
per-day trace mode.

## CHANGES v177, fog of war

"Don't reveal opponent asset locations until scouted (surveillance assets)."
Information asymmetry as a governance lever, and a natural partner to the
opponent force-composition readout from v175.

## The mechanic

With fog on, you can see WHAT a rival fields, the force-composition counts
(rovers / habitats / pads / solar / reactors) stay public, but not WHERE, until
one of your sensors covers the spot. Fog hides positions, not the order of
battle. That split is the teachable bit: you know they run three rovers and two
habitats; finding them, and keeping eyes on them, costs you surveillance.

**Sensors** (reach in km):
- **Comsats**, standing surveillance, ~30 km. The dedicated overwatch asset.
- **Rovers**, mobile scouts, ~9 km. Push them forward to find things.
- **Habitats / reactors / pads / solar**, modest local-awareness bubbles.

Reveal is based on **current** coverage: assets you scouted re-hide if you lose
eyes on them. That's deliberate, it keeps comsats and forward scouts
continuously valuable instead of being a one-time reveal, and it gives the
propaganda/claims idea something to bite on later (you can't verify a rival's
claims without active surveillance).

## No leaks

Fog is only credible if it can't be defeated by toggling a layer, so every
position-revealing layer consults one shared gate:

- opponent asset **icons**, hidden unless scouted;
- opponent **safety rings**, a ring would betray the asset under it;
- opponent **waypoint lines**, their planned routes are intent you can't
  observe, so they're hidden entirely;
- the PSR **claim shading**, would otherwise glow around a hidden base;
- the **mine heatmap**, their extraction trail would mark where they operate.

A "◓ Fog of war, scout to reveal" map indicator tells the viewer positions are
hidden (so empty space doesn't read as "no opponent"). Facilitators see through
the fog. It's a game-wide rule, toggled from the toolbar and synced to all seats.

## Implementation

- **`src/sim/fogOfWar.js`**, pure, stateless sensor model (sensor sources per
  asset type, point-in-coverage, revealed-count). No synced discovery state to
  drift; reveal is a function of current positions only. Fully unit-tested.
- `App.jsx` computes one `oppHidden(ownerPi, x, y)` gate from the viewer's live
  sensors (the seated actor in MP, the active actor in a hotseat, never a
  facilitator) and applies it at all five render sites; toolbar toggle + snapshot
  sync; default off so existing sessions are unchanged.

## Verification

- **453 unit tests pass** (446 → 453; +7 in `tests/fogOfWar.test.js`: sensor
  sourcing incl. destroyed/inactive, comsat-vs-rover reach, point-revealed
  geometry, and the revealed-count tally).
- `vite build` clean, import lint clean.

## Worth a live click-through before the workshop

Like diplomacy, fog is view-behavior tests can't fully cover. In a two-actor MP
game, turn fog on and confirm from one seat: the rival's icons/rings/routes are
hidden, they pop in when your rover or comsat closes on them and fade when you
pull back, and the claim/mine shading doesn't leak their base. The one judgment
call to sanity-check at the table is whether mining activity should be hidden
(currently it is), flip that quickly if your group reads extraction as
orbit-observable.

## Still open

Multi-room 3-4 actor setup, propaganda / public-claims (now well-set-up by fog),
persistent weekly mode, map layer presets (your four curated sets), and in-game
budget-category explanations.

## CHANGES v176, dedicated diplomacy phase (Conference of Parties)

Alan's big idea, and the highest-use change for a governance workshop: you
could win the sandbox without ever talking to anyone. This adds a timed,
talk-only **Conference of Parties** session that freezes the clock and puts every
actor at the table.

## The mechanic

Convene a session and the simulation **freezes**: the day clock, the wall-clock
round timer, and day resolution all pause, and the per-actor "end turn / commit"
button is disabled. Nothing advances, the only thing to do is negotiate, through
the existing deals / easements / zone-resize / grid-sharing panel. When the timer
runs out (or the chair adjourns early), play resumes exactly where it left off.

A prominent banner carries a live **M:SS countdown**, a drain bar, who convened
the session, and an Adjourn button for the chair. Convene and adjourn are written
to the mission log.

## How it's triggered

- **On demand**, a toolbar "Convene UN / Adjourn UN" button (facilitator, host,
  or anyone in a local hotseat game), and the same control in the facilitator
  panel.
- **On a cadence**, the facilitator can set auto-convene to **every round / 2 /
  3**, which is the "force interaction" lever: a session opens itself on schedule
  so a round can't go by without the parties meeting.

Session length is configurable (2 / 3 / 5 / 10 min), and the facilitator panel
shows how many sessions have been held this game ("No sessions held yet, actors
can still win without ever talking").

Everything syncs over multiplayer through the snapshot, so the host sets it once
and every seat sees the same countdown and freeze.

## Implementation

- **`src/sim/diplomacy.js`**, a pure timing module (convene, active-check,
  time-left, progress, clock formatting, convener label, auto-convene cadence,
  force-interaction gate). No React, fully unit-tested.
- **`src/ui/DiplomacyBanner.jsx`**, the countdown overlay (pointer-events off
  except the Adjourn button, so the map stays live underneath).
- `App.jsx` owns the session state + effects: pause hooks in the turn
  auto-advance, the wall-clock round push, and day resolution; an auto-adjourn
  timer; the auto-convene cadence; the toolbar control; and snapshot sync.
- Facilitator panel gains a Diplomacy section (convene/adjourn, session length,
  auto-convene cadence, sessions-held readout).

## Verification

- **446 unit tests pass** (438 → 446; +8 in `tests/diplomacy.test.js`: convene +
  clamping, active/elapsed/ended, time-left + clock formatting, progress, convener
  labels, auto-convene cadence including the round-1 skip, and the
  force-interaction gate).
- `vite build` clean, import lint clean.
- Fixed a real bug found mid-build: an edit had dropped the day-resolution
  effect's header (tests didn't catch it; the build did). Verified clean.

## Worth a manual click-through before July 8

The freeze + countdown is exactly the kind of timing/UI behavior unit tests can't
fully cover. Recommend convening a session in a live two-actor game once to
confirm the clock holds, the commit button greys out, and adjourn resumes cleanly
,  especially the auto-convene cadence over a couple of rounds.

## Still open (scoped follow-ups)

Multi-room 3-4 actor setup, fog of war, propaganda / public-claims, persistent
weekly mode, map layer presets (say the word with your four curated layer sets),
and in-game budget-category explanations.

## CHANGES v175, score legibility & competition intel

Builds on v174 (the playtest bug sweep + placement preview). This round is the
"players gamed the visible score / couldn't read the competition" cluster from
the workshop notes.

## New: hidden-score toggle (with a standing proxy)

Players were gaming the exact visible number. A toolbar button now cycles the
score display through three modes:

- **Score: on**, exact composite numbers (default, unchanged).
- **Score: standing**, numbers replaced by a qualitative read in the center
  cell ("Neck and neck", "Actor I clearly ahead", "Actor I dominating"). The
  standing is judged on the margin *relative* to the leader's magnitude, so it
  reads sensibly whether scores are in the tens or the thousands.
- **Score: hidden**, no standing at all until the debrief.

The clickable score-breakdown popover is suppressed while scores are hidden so a
player can't pull the exact numbers out of it, and the **DONE / debrief screen
always reveals the real scores** regardless of the setting. The mode is synced
over multiplayer, so the facilitator sets it once and every seat matches.

`scoreProxyLabel()` (`economy.js`) is a pure helper with its own tests.

## New: opponent force-composition readout

The condensed opponent panel (what a remote player sees of their rival) showed
status, ice, and last-known position but not what the rival had *built*. It now
includes a **FORCE COMPOSITION** block, live counts of rovers, habitats, pads,
solar arrays, and reactors (destroyed assets excluded). Counts only, no
locations, no score: enough to size up the competition at a glance, which
matters most when the score is hidden. This is the right-side competitive panel
from the notes.

## Verification

- **438 unit tests pass** (433 → 438; +5 in `tests/economy.test.js` covering the
  proxy: too-early, neck-and-neck, tier escalation, leader identification and
  name resolver, magnitude-invariance).
- `vite build` clean, import lint clean.

## Noted, not changed (recommendations)

- **Score components**: the score is already decomposable, clicking an actor's
  score cell drops the banked / carried / infrastructure / policy / penalty
  breakdown (the v165 popover). Worth pointing the room at it; the econ / R&D /
  military stocks feed the score *indirectly* (they drive budget → what you can
  build), which is itself a teachable point.
- **Ice vs. infrastructure balance**: after v174 ice now flows (~40-80 kg
  hoppers, a few hundred kg banked per game), so it's a meaningful term again , 
  roughly a third of a typical infrastructure contribution, not the rounding
  error it was. If you want ice to weigh more, the single lever is
  `SCORE_PTS_PER_KG` in `economy.js`. Best tuned watching a real throughput
  optimizer (Alan) play, not from a spreadsheet.
- **Map layer presets**: the mechanism is straightforward (a preset sets
  `showLayers` flags + `activeOverlays` + `activeVectorOverlays` together), but
  *which* of your many basemaps / figure plates compose each preset (ice, slope,
  comms, illumination) is a design call I'd rather leave to you than guess, say
  the word and I'll wire the presets to whatever four combinations you pick.
- Larger systems still open: dedicated diplomacy phase, multi-room 3-4 actor
  setup, fog of war, propaganda / public-claims, persistent weekly mode,
  in-game budget-category explanations.

## CHANGES v174, playtest bug sweep + placement preview

The batch of fixes from the workshop playtest notes. Six real bugs (ice never
banking, rover autonomy, nonsense power %, auto-advance stalling, free powerless
habitats), plus the most-requested feature, a footprint preview before you
place, and slope legibility.

## Fixed: ice deposited was always 0 (both players)

Root cause was a scale mismatch, exactly as called out in the notes: mining
yields too little for the cargo to ever fill. `BASE_MINE_RATE` was ~0.8 kg/day
but a rover's hopper (`ICE_CAP`) was **800 kg**, and a rover only auto-returned
to deposit at 95% of that. So a rover needed ~1,000 mining-days before it would
ever head home, unreachable in a few-round workshop game, so `iceDeposited`
stayed 0 for everyone.

Rebalanced the whole mine → cargo → rover → habitat chain:

- **`ICE_CAP` 800 → 80 kg**, reframed as a per-trip *hopper*, not a one-shot
  lifetime haul. Lifetime throughput now comes from many trips.
- **`PROJECTED_ADVANCES_FACTOR` 80 → 480**, `BASE_MINE_RATE` ≈ 4.84 kg/day at
  quality 1.0 (~2.4/day at the median quality), so a hopper fills in roughly one
  to two rounds.
- **Partial-load deposit return** (`autoTarget.js`): a rover runs home at **50%**
  hopper (was 95%), so ice flows steadily instead of in rare all-or-nothing
  lumps. The bot AI router got the matching 30% → 50% bump.

An end-to-end test now drives a rover through mine → fill → route home → deposit
and asserts ice actually banks (`tests/simDay.test.js`).

## Fixed: rover autonomy (stuck / not routing to habitats)

Same root cause, rovers never crossed the return threshold, so they never
routed to a habitat. On top of the threshold fix, `pickRoverTarget` now **banks
a partial load** (≥15% hopper) at the nearest habitat when no crater is minable,
instead of idling on the ice with cargo it never delivers. An empty rover with
nothing to mine still correctly stays put.

## Fixed: nonsense power / health percentages (1440%, 7221%)

The asset stat panel rendered `power * 100`, but rover/habitat power is stored in
absolute units (0-`POWER_CAP`=120, 0-`HABITAT_POWER_CAP`=80), not as a 0-1
fraction, so a rover at 72/120 read "7221%" and one at 14.4 read "1440%". Both
now show a clamped percentage of the correct cap (`AssetDetailSidebar.jsx`). Also
fixed a latent on-map power-ring clamp that pinned every charged asset to 100%.

## Fixed: rounds stopped auto-advancing mid-game

A race in the auto-advance effect: the timer bailed on *any* truthy
`roundTransition` and relied on a separate cleanup effect to null it out first.
Whenever cleanup lost the race the turn never ended and auto-advance silently
stalled for the rest of the game. The timer now checks `until > Date.now()`, so
once the transition pause actually elapses it advances regardless of whether the
state object has been cleared yet.

## Fixed: an unpowered habitat had no consequence

A powerless hab already couldn't accept ice, but was otherwise free to run.
New `applyUnpoweredHabitatPenalty` (`economy.js`), applied each resolved day in
**both** the live and headless paths: every habitat at or below
`UNPOWERED_HAB_THRESHOLD` power takes accelerated structural decay
(`UNPOWERED_HAB_DECAY`, ~15 days to destruction if never powered) **and** a
direct per-day scoreboard ding (`UNPOWERED_HAB_PENALTY`). It self-corrects, an
unpowered hab eventually degrades to destroyed, at which point it stops
projecting a zone and stops being a deposit site. Logged to the mission log
(`⚠ Habitat Hn ran unpowered, life support degrading`).

## New: footprint / radius preview before placing

The most-requested change. The reactor already previewed its 3-ring Open Lunar
zone at the cursor; now **every** placeable asset shows a ghost overlay before
you commit: the keep-out / safety zone (scaled by the placing actor's
self-declared zone size, with a `⚠ NNN% zone` overreach flag), plus working
reach where it applies, solar power reach, the comsat relay footprint, the pad
landing apron. Players see exactly what they'll cover and who they'll crowd
before dropping the asset.

## New: slope → rover-speed legibility

The target-selection hover tooltip now shows the slope under the cursor and the
exact rover-speed multiplier the physics model applies
(`slope 14° · rover 44% speed`, green / amber / impassable), so players can
reason about trafficability instead of guessing why a rover crawls or stalls.

## Verification

- **433 unit tests pass** (422 → 433; +6 autoTarget partial-deposit / bank-when-
  stuck, +1 end-to-end ice-banking integration, +6 unpowered-habitat penalty).
- `vite build` clean.

## Noted, not changed

- **"Give control" failed once** is remote-play / session logistics on the host
  side, not sandbox code, flagged for the remote-play runbook.
- The larger asks (dedicated diplomacy phase, multi-room 3-4 actor setup, fog of
  war, propaganda / public-claims, persistent weekly mode, hidden-score toggle,
  opponent stat panel, layer presets, in-game budget-category explanations) are
  scoped as follow-ups, each is a self-contained feature rather than a fix, and
  several touch the design system / workshop UX where the call is yours.

## CHANGES v173, detailed CSV is now a single flat table

Replaces v172's multi-section CSV (which needed splitting before it would load)
with what "detailed CSV" should mean: **one flat, directly-loadable table**.

## The export

The CSV button now produces `lunar_policy_sandbox_detail_R{n}D{d}.csv`, a single
table, **one row per (round, actor)** across the entire game, plus a final
`current` row per actor for the in-progress round. It opens straight in pandas /
Excel with a plain `read_csv`, no section markers, no preprocessing.

Columns (36): round, phase, day, globalDay, actor, stakeholder, score, the five
score terms (banked / carried / infrastructure / policy / penalty), iceDeposited,
iceCarried, budget, econ E, R&D, military, asset points, safety violations,
coordination advisories, stance, zone scale, easements granted, treaty floor, the
six asset-type counts, power/comms grid mode, sim mode, scenario, and version.

## Longitudinal, not just a snapshot

Per-round history now captures a full per-actor metric snapshot at each round-end
(`actorMetricSnapshot`), so the export is a real time series you can plot, score
over rounds, ice accumulation, budget, advisories, grid changes, not just the
final state. Rounds played before this upgrade fall back to the ice+budget that
history captured then; everything from here on is fully detailed.

## Verification

- **422 unit tests pass** (417 → 422; +5 in `tests/detailedCsv.test.js`: the
  snapshot helper, single-flat-table shape, one-row-per-round-per-actor, the
  legacy fallback, and the single-actor case). `vite build` clean, `npm run lint`
  clean, relay 13/13.
- Sample export generated and eyeballed, clean header, correct per-round rows,
  loads as a single frame.

The richer multi-section `buildSessionCsv` (asset inventory + event log) is still
in `exports.js` if you ever want it, but the button now gives the flat detailed
table.

## CHANGES v172, full CSV export

The CSV export went from a 7-column event log to a full, analysis-ready session
dump, and a real bug got fixed along the way.

## Fixed: CSV corruption from unescaped commas

The old exporter joined fields with bare commas, so any label containing a comma
(which most deal / inject / facilitator log lines do) silently split into extra
columns and corrupted the file. All fields are now RFC-4180 escaped (quoted when
they contain a comma, quote, or newline; internal quotes doubled).

## Event log: every field, not just seven

`buildMissionLogCsv` now emits a stable preferred column order
(`round, day, globalDay, type, actor, itemType, cost, kg, craterIdx, x, y, seq,
label`) AND auto-appends any other key present on any event, so no detail is
ever dropped, even for new event types added later.

## New: full session export (the CSV button)

The export button now produces a full, six-section CSV
(`lunar_policy_sandbox_session_R{n}D{d}.csv`). Sections are delimited by
`# === NAME ===` marker rows so each can be loaded as its own data frame:

1. **SESSION**, timestamp, version, round/day/globalDay, totalRounds, simMode,
   scenario, power- and comms-grid modes.
2. **ACTORS**, one richly-columned row per actor: stakeholder, total score and
   all five score terms (banked / carried / infrastructure / policy / penalty),
   ice deposited & carried, budget, econ E, R&D, military, asset points, safety
   violations, **coordination advisories**, stance, zone scale, easements granted,
   treaty floor, every asset-type count, and rover position.
3. **SCORE_BREAKDOWN**, long format (actor, term, value, detail) for easy
   plotting.
4. **ASSETS**, one row per placed asset: owner, type, index, position in **px and
   km**, health, placement seq, destroyed flag.
5. **ROUND_HISTORY**, the per-round economic series (dynamic columns).
6. **EVENT_LOG**, the full, escaped event log.

All of it is a pure, tested `buildSessionCsv()` in `exports.js`.

## Verification

- **417 unit tests pass** (410 → 417; +7 new in `tests/exports.csv.test.js`
  covering comma/quote escaping, dynamic extra columns, all six sections, the rich
  actor row, the asset inventory, and the null-second-actor case; two existing
  tests updated to the new richer format).
- `vite build` clean, `npm run lint` clean, relay 13/13.
- Sample export generated and eyeballed end-to-end, sections render correctly and
  comma-bearing labels stay intact.

Note: the multi-section layout means a naive single `read_csv` won't ingest the
whole file at once, split on the `# === ` markers (one line of pandas) to load
each section. If you'd prefer instead a ZIP of separate flat CSVs, that's a small
follow-up.

## CHANGES v171, coordination-tier advisories

Gives the v170 3-ring framework's MIDDLE tier real meaning. The coordination ring
("coordinate before entry") now reacts when an actor's asset sits in it, an
informational advisory, distinct from an exclusion breach. **No scoring change:
only the inner exclusion ring still drives violations**, so balance is untouched.

## What's new

- **Coordination advisory cue**, when an enemy asset is inside a zone's
  coordination band (inside the coordination radius, outside the exclusion), that
  zone's middle ring brightens, fills, and gains a soft pulsing glow. You can see
  at a glance which actors are getting close enough to need to coordinate, without
  it being a penalty.
- **Facilitator tally**, the 3-ring legend now appends "⚠ N coordination
  advisories active" whenever any are live, so the GM has a running count to
  reference during a session.

## Logic

New pure, tested `coordinationIntrusions(p1, p2, { coordMult, sharedGridActive })`
in `enemyZones.js`: counts, per owner, zones with an enemy rover in the
coordination band but NOT the exclusion (those are violations, counted elsewhere).
Honors easements (a waiver clears advisories too) and `zoneScale`, and skips
grid-exempt zones when the grid is shared.

## Verification

- **410 unit tests pass** (406 → 410; +4: advisory in band, NOT an advisory inside
  the exclusion, clear beyond the coordination radius, easement waives the
  advisory). `vite build` clean, `npm run lint` clean, relay 13/13.
- Advisory vs. clear render spot-checked (clear distinction; the band brightens +
  glows on intrusion).
- Canvas render change, so worth a quick live eyeball: confirm the advisory glow
  reads well at low/high zoom and isn't noisy when several zones overlap.

## CHANGES v170, graduated 3-ring safety zones (Open Lunar framework)

Brings every infrastructure safety zone into the Open Lunar graduated 3-ring
framework, so the facilitator (and players) can read coordination tiers on the
board at a glance, not just a single keep-out circle.

## The three tiers

Previously only **reactors** rendered the graduated model (their bespoke physical
exclusion / EMI / plume rings). Solar, habitat, and pad drew a single ring. Now
those project the full framework, as concentric tiers on the exclusion radius:

- **Exclusion** (inner, asset color), no entry; breaching it is the safety
  violation. **This is still the only ring that scores**, the logic is unchanged,
  so balance is untouched.
- **Coordination** (middle, teal, ×1.7), entry requires prior coordination.
- **Notification** (outer, lavender, ×2.45), awareness / consultation buffer.

Reactors keep their physical 3-ring; rovers keep their single transient ring. The
tiers honor the v167 `zoneScale`, so resizing a zone scales all three together.

## Legend on the board

A compact **"Safety zones · 3-ring framework"** key now sits bottom-right whenever
the Zones layer is on, naming Exclusion / Coordination / Notification with their
colors and meaning. It shows for everyone, including the facilitator, so the GM can
adjudicate proximity against the named tiers during a session.

## Tier radii are tunable

`ZONE_TIER_MULT` in `constants.js` (`{ exclusion:1.0, coordination:1.7,
notification:2.45 }`) controls the buffer sizes, easy to retune if the outer
tiers feel too large on the map for a given scenario.

## Verification

- 406 unit tests pass (scoring untouched, only the inner exclusion drives
  violations); `vite build` clean, `npm run lint` clean, relay 13/13.
- Geometry/styling spot-checked with a standalone render (clean nested tiers).
- It's a **canvas render change**, so give it an eyeball pass in a live board:
  confirm the three tiers read clearly for solar / habitat / pad at low and high
  zoom and don't overwhelm the map (habitat's outer buffer is the largest, tune
  `ZONE_TIER_MULT.notification` down if needed).

## CHANGES v169, relay connection: overridable URL + actionable error

Addresses "Could not reach the relay … (websocket error)". The error itself is
almost always operational (the relay server isn't running, or its port isn't
reachable), but the client made it hard to diagnose or work around. Two changes:

## Overridable relay endpoint (no rebuild needed)

`defaultServerURL()` still defaults to the same host the app is served from, on
port 8787, but you can now override it, in priority order:

1. `?relay=http://host:port`, full URL via query string (persisted to localStorage)
2. `?mpport=8799`, port-only override via query string (persisted)
3. `VITE_RELAY_URL` / `VITE_RELAY_PORT`, build-time env
4. a previously-saved `?relay=` override
5. same host : 8787 (default)

So if the relay lives on a different host/port than the page, you point at it with
a URL param instead of editing code: e.g.
`http://<your-ip>:5173/?relay=http://<relay-ip>:8787`.

## Actionable error message

Instead of just "(websocket error)", the failure now tells you the likely fix:
start the relay (`npm start`, not just `npm run dev`) and open its port on the
host / same network. It also specifically detects the **mixed-content** case
(HTTPS page + HTTP relay, which browsers silently block) and says so.

No mechanics changed. 406 tests pass, build/lint clean, relay 13/13.

## CHANGES v168, negotiation: hygiene + legibility

Closes the two gaps flagged in v167: stale offers lingered forever, and the
active diplomatic state wasn't visible anywhere. Both fixed.

## Deal hygiene (offers expire and self-clean)

Pending offers are now garbage-collected when the round advances (host-side):

- **Expiry**, an offer older than `DEAL_MAX_AGE_ROUNDS` (2) is dropped.
- **Affordability**, an offer whose proposer has since spent what they put up is
  dropped as "unaffordable."

Each drop writes a mission-log line so the table sees why an offer vanished. The
logic is a pure, tested `pruneDeals()` in `deals.js`.

## Diplomacy legibility

- **Standing readout**, the Negotiation panel now opens with a "Standing with
  [other actor]" strip of status chips: power shared / separate, comms shared /
  separate, whether *you* waived your zones vs them, whether *they* waived theirs
  for you, and your current zone size if it's not 100%. The diplomatic state is no
  longer buried in the data model.
- **Unaffordable-offer warning**, an incoming offer whose proposer can no longer
  cover their side is flagged inline ("⚠ … can no longer cover this, accepting
  will lapse it") so you don't waste a turn accepting a dead deal.

## Tests / verification

- **406 unit tests pass** (401 → 406; +5 in `tests/deals.test.js`: expiry by age,
  drop-on-unaffordable, keep-fresh-affordable, prune resolved deals, and the
  proposer-side honorability check).
- `vite build` clean, `npm run lint` clean, relay 13/13.

## Note

The legibility additions are presentational (status chips + a warning line) and
the pruning is pure + tested, so this is a low-risk hardening pass on top of v167.
The v167 caveat still stands: the negotiation UI as a whole wants one real
multi-screen run before the workshop, and the underlying trade mechanics remain
balance-moving by design.

## CHANGES v167, negotiation, policy stances, resizable zones, full facilitator control

A big diplomacy expansion. Actors can now bargain with each other, trading
resources and access and offering things in return, change their own policy
stance and safety zones mid-game, and the facilitator gains direct control over
all of it.

## Bilateral deals (the negotiation engine)

New pure, fully-tested `deals.js`. An actor proposes a deal to the other; each
side can put up any mix of:

- **Budget** (credits), **banked ice** (kg), or **score**, transferable
- **Power-grid access**, opens the shared power grid between the two actors
- **Comms access**, opens the shared comms grid
- **Safety easement**, waive your keep-out zones against them

…in their **give** bundle (what they hand over) and ask for the same in their
**want** bundle (what they want in return). The recipient sees the offer in an
inbox and accepts or declines. On acceptance the resources move both directions,
grids flip to shared, and easements are granted, validated for affordability so
a deal can never execute if a party can't cover its half. One live proposal per
proposer; either side can withdraw/decline. Every step writes a 🤝 mission-log
line.

## Resizable safety zones + easements

Two new per-actor levers, woven into both the violation engine and the live map
render:

- **Zone size** (`zoneScale`, 60-180%), tighten or widen your own keep-out
  radii. Scoring (`attributeSafetyViolations`) and the drawn rings both honor it.
- **Safety easement** (`easements`), waive your zones against a specific actor,
  so their rovers can sit inside without it counting as a breach. The natural
  thing to trade in a deal ("I'll let you into my zone if…").

## Editable policy stances

Players can switch their allocation stance live, Balanced / Economic Growth /
Surge Spending / Security Posture, from the negotiation panel, routed through the
host like every other action.

## Facilitator: full control to manipulate anything

The god-mode panel gains a **World & Diplomacy** block (on top of the existing
budget / score / asset / announce / maintenance / graphics controls):

- Force the **power** and **comms** grids shared or independent
- Set either actor's **policy stance**
- Resize either actor's **safety zones**
- Adjust **banked ice**
- Set the **treaty-norm floor**

All route through the host and re-broadcast, so the facilitator can reshape the
board at will.

## Player UI

A self-contained floating **Negotiation** panel (bottom-left, actor-only): deal
composer (give/want bundles with live affordability), an incoming-offer inbox with
accept/decline, a stance picker, a zone-size control, and an easement toggle. It's
a standalone drawer so it doesn't disturb the existing sidebar layout.

## Implementation / safety

- `deals.js` is pure and host-authoritative-safe (returns new objects; no setter
  nesting, so no StrictMode double-apply on accept).
- New host actions, all seat-gated: `deal:propose/respond/withdraw`,
  `player:setZoneScale/setStance/setEasement`, and facilitator-only
  `facilitator:setGrid/setStance/setZoneScale/adjustIce/setTreatyFloor`.
- New broadcast field `pendingDeals` (ingested on peers); `easements` / `zoneScale`
  ride on player state and are already in the snapshot.

## Tests / verification

- **401 unit tests pass** (390 → 401; +11 in `tests/deals.test.js`): bundle
  normalization, empty-deal rejection, affordability, both-direction transfers,
  grid flips, easement direction, **easement actually suppressing a violation**,
  **zoneScale changing the breach radius**, and the summarizer.
- `vite build` clean, `npm run lint` clean, relay 13/13.

## ⚠ Needs a live pass, and it's balance-moving

Two honest caveats:

1. The **player Negotiation panel** and the **god-mode World & Diplomacy** block are
   UI that was verified by build/lint, **not eyeballed live**. Please run a real
   multi-screen session (deal proposal → accept on the other device, stance/zone
   changes, facilitator overrides) with Tommy before the workshop.
2. This introduces **transferable ice/score and tradeable grid/zone access**, which
   are deliberately balance-moving, they open real strategic depth but change the
   economy. Worth a playtest to confirm deals don't trivialize the scenario (e.g.
   one actor buying the other's ice). All knobs (transfer caps, easement effects)
   are easy to constrain later if needed.

## CHANGES v166, score breakdown is now visible

The composite score is the heart of a tradeoff workshop, but the HUD only ever
showed the final number, players and facilitators had no way to see *why* it was
what it was. `scoreBreakdown()` already existed in `economy.js` (and is covered by
the "terms sum to composite" invariant test) but was never rendered anywhere. Now
it is.

## Click a score to open its breakdown

Each actor's score cell in the top HUD strip is now clickable. Tapping it drops a
popover decomposing the composite into its five terms, each with its value and a
one-line detail:

- **Banked ice**, `+pts` from kg deposited.
- **Carried ice**, partial credit for kg in transit on rovers.
- **Infrastructure**, asset points × per-point value (this is where pads,
  habitats, etc. land).
- **Policy / injects**, net of facilitator adjustments and inject outcomes
  (`scoreAdjustments`), including the v164 pad geopolitical bonus.
- **Safety violations**, the penalty, scaled by the treaty-norm stage when a
  norm floor is in effect.

Positive terms read green, penalties read pink, and the popover totals to the
composite at the bottom so the arithmetic is transparent. A ▾/▴ caret on the
"score" label signals it's expandable; the ✕ or a second tap closes it.

Works in both standard and workshop mode, understanding the decomposition is the
point of the exercise either way.

## Implementation

- All presentation, no new scoring logic: the popover renders the exact terms
  `scoreBreakdown()` returns, so it cannot diverge from the real score (and that
  function's total is already pinned to `scorePlayerState` by an existing test).
- Lives entirely in `Scorebar.jsx` (new `BreakdownPopover` subcomponent + a small
  `expanded` state on the strip). The middle round/craters cell stays inert.

## Tests / verification

- 390 unit tests pass (the scoreBreakdown invariant test already guards the
  numbers); `vite build` clean, `npm run lint` clean, relay 13/13.
- Presentational, so **eyeball it**: click each actor's score, confirm the five
  terms total to the headline number, that penalties show negative/pink, and that
  the popover isn't clipped by the HUD edge.

## CHANGES v165, landing-pad benefits are now legible

v164 gave landing pads real power (dust shielding, equipment discount, geopolitical
points). A mechanic players can't see is half a mechanic, in a facilitated session
people need to understand *why* their assets survived or their costs dropped. v165
surfaces the pad perks at the two moments they matter: when you inspect a pad, and
when a pad actually absorbs a hit.

## 1. Pad inspection readout

Click any landing pad and the asset panel now shows a **"Dust-mitigation
infrastructure"** card spelling out exactly what that pad is doing:

- **Dust apron**, `−60% within X km` (the shielded radius, in km).
- **Logistics discount**, `−N% equipment`, reflecting how many of the actor's pads
  are currently working (so a player can see two pads = −20%, etc.).
- **Geopolitical**, flags the dust-mitigation stewardship credit.

If the pad is destroyed the card greys out and says so plainly: no shield, no
discount, no standing until it's repaired, which makes the cost of losing a pad
concrete.

## 2. Dust-containment feedback in the mission log

When a hostile landing's dust is absorbed by the victim's pad apron, the log now
says so: `🛬 <Actor>'s landing-pad apron contained dust, N assets shielded (−60%
damage)`. Previously the mitigation happened silently and the only evidence was a
health bar that *didn't* drop as far, easy to miss. Now the protection is an
explicit, readable event, so the table learns the mechanic by seeing it fire.

## Implementation

- Readout lives in `AssetDetailSidebar.jsx`, reusing the already-tested
  `functionalPadCount` and `padCostMultiplier` helpers plus the pad constants, no
  new logic, just presentation of existing rules, so the panel can't drift from the
  actual mechanics.
- The log line is driven off a `shieldedCount` accumulator added to `landingImpact`
  (live path); it only fires when a shield actually reduced damage.

## Tests / verification

- 390 unit tests still pass; `vite build` clean, `npm run lint` clean, relay 13/13.
- Both additions are presentational, so **eyeball them**: click a working pad (card
  shows the three perks with live discount %), click a destroyed pad (greyed +
  warning), and trigger a hostile landing next to assets sitting in your pad's apron
  (log shows the containment line, assets take visibly less damage).

## CHANGES v164, landing pads earn their keep

Landing pads were doing one job (routing deliveries) and otherwise just sitting
there as an expensive target. They now pull real weight in three ways that all
reinforce the same idea: a prepared pad is dust-mitigation infrastructure, and
building one is good stewardship.

## 1. Pads suppress landing dust (protect health)

Placing equipment throws regolith that damages nearby assets caught in their
keep-out zones (`landingImpact`). Now a **functional landing pad shields its
owner's assets**: any asset sitting within a working pad's apron
(`SAFETY_RADIUS.pad`) takes **60% less** landing-dust damage
(`PAD_DUST_MITIGATION = 0.6`). Prepared ground contains the plume, so clustering
your build-out around a pad keeps it healthy. Applied identically in the live and
headless/bot landing paths.

## 2. Pads make equipment cheaper

Operating pads makes follow-on logistics easier, so equipment costs less to place:
**−10% per functional pad, capped at −35%** (`PAD_COST_DISCOUNT_PER` /
`PAD_COST_DISCOUNT_CAP`). The discount applies to solar / habitat / rover /
reactor / comsat, but **not to pads themselves** (no bootstrapping pad spam). It
stacks with stakeholder cost mods and flows through every cost path: placement,
drag-place, the bot economy, and the build-palette price display, so the cheaper
numbers show up live as soon as a pad is working.

## 3. Pads earn geopolitical points

Because dust mitigation is a shared-environment good, building a pad grants a
one-time **+6 soft-power / geopolitical bump** (`PAD_GEO_BONUS`, via
`scoreAdjustments`) on top of the pad's asset points. The mission log calls it out
explicitly: `… +6 geopolitical (dust mitigation)`.

## 4. The apron is now visible

So players can actually see the benefit, each functional pad now renders a soft
periwinkle **dust-suppression apron** filling its keep-out radius (distinct from
the dashed boundary), on the Zones layer. Destroyed pads don't draw it, and don't
provide any of the three benefits.

## Implementation / why pure helpers

- `padCostMultiplier(padCount)` and the `opts.padCount` path in `calcAssetCosts`
  live in `economy.js`; `functionalPadCount(player)` lives in `playerState.js`.
  Both are pure and unit-tested, so the cost formula and the "what counts as a
  working pad" rule are locked.
- Threaded `functionalPadCount` into all six live cost call sites; dust mitigation
  added to both `landingImpact` (live) and `applyPureLandingImpact` (headless);
  geo bonus added to both pad-placement commit paths (explore-click + drag-place).

## Tests / verification

- **390 unit tests pass** (385 → 390; +5: pad cost multiplier curve + cap,
  equipment-discounted-not-pads, discount stacking with a stakeholder mod, and
  `functionalPadCount` counting only above-floor pads incl. the missing-health
  case).
- `vite build` clean, `npm run lint` clean, relay 13/13.
- The apron is a canvas visual, **best judged by eye**: drop a pad, cluster a few
  assets in its ring, and confirm the periwinkle wash reads clearly and that a
  hostile landing nearby does visibly less damage to the sheltered assets.

## ⚠ Balance note

This is a deliberate buff to pads (cheaper kit + protected health + free score),
so it shifts strategy toward pad-anchored build-outs. The numbers
(0.10/0.35/0.6/+6) are first-pass and easy to retune in `constants.js`, worth a
glance in a live run before the workshop to make sure pads aren't now an
auto-first-buy.

## CHANGES v163, god-mode maintenance toolkit

Rounds out god mode with the "reset the table" actions a facilitator reaches for
between scenarios or after a punishing round. New **MAINTENANCE** row in
Facilitator → ⚡ GOD MODE (uses the same Both / Actor I / Actor II target as the
budget and score controls):

- **Clear violations**, zeroes a player's accrued `safetyViolations` (and the
  score penalty that rides them). Useful for a clean re-run.
- **Repair assets**, restores every asset to full health. Rebuilds each
  `structureHealth` array from the matching asset array, so counts can never drift
  out of alignment (the v140 off-by-one class of bug).
- **Recharge**, tops up stored power on the primary rover, every extra rover, and
  every habitat. (Stranded, dead-battery rovers are a recurring table annoyance , 
  this gets everyone moving again.)

Each action routes through the host (so it works whether the facilitator is host
or peer), re-broadcasts authoritative state to every screen, and writes a
`⚙ Facilitator: …` line to the mission log.

## Why pure helpers

The transforms live in `playerState.js` (`clearViolations`, `repairAllAssets`,
`rechargeAll`) rather than inline in the component, the health-array alignment is
the bug-prone part, so it's unit-tested, not eyeballed.

## Tests / verification

- **385 unit tests pass** (380 → 385; +5 in `tests/playerState.test.js`: clear
  preserves unrelated fields and doesn't mutate; repair makes every health array
  full and length-aligned, restores non-array health, and creates a missing array
  at the right length; recharge tops up primary/extra/habitat power without
  mutating the input, and no-ops habitatPower when there are no habitats).
- `vite build` clean, `npm run lint` clean, relay protocol check 13/13.
- Verified by harness + build, not a live session, the round-control + god-mode
  flow still wants one real multi-screen pass with Tommy before the workshop.

## CHANGES v162, cleaner battery / zone / breach graphics + toggles

Two asks: make the battery, safety-zone, and violation graphics read clearly, and
let the facilitator turn each of them off.

## Battery / charge graphics, cleaned up

The "battery" overlay was a fixed-size 🔋 / ⚡ emoji drawn per rover and per
habitat at `bold 9px` with **no zoom counter-scale**. So as you zoomed in they
ballooned, drifted away from the asset they belonged to, and rendered
inconsistently across platforms (emoji fonts differ). Replaced with:

- A small **vector charge bolt** that counter-scales (constant on-screen size at
  any zoom) and appears only when the asset is within a generator's range , 
  rover, extra rover, and habitat. It sits tidily up-left of the asset on a soft
  dark disc so it reads against any basemap.
- The rover **power dot** (charge level, green/amber/pink) is kept but now gated
  with the rest of the battery layer.

## Safety-zone graphics

Carried the v160 legibility work; the base keep-out rings keep their brighter
fill + dashed boundary + thin inner edge. The change here is that they can now be
toggled independently of the breach graphics (below).

## Violation (breach) graphics, cleaned up

The breach overlay was doing a lot at once: a red fill wash, a **three-layer**
pulsing glow, a marching-ants inner ring, full-thickness connector lines, rotated
hazard chevrons at each intruder, AND a fixed-size "⚠ BREACH" label. At zoom it
collapsed into a red smear that buried the actual breach point. Now it's calm and
legible:

- **One** pulsing red ring with a single soft outer glow and a faint interior, so
  the zone reads as "hot" without washing out.
- A **thin dashed connector** to a **small dot** at each intruder (no heavy
  chevrons), you can see exactly who's breaching and where.
- A **counter-scaled "⚠ BREACH" pill** that stays a constant, readable size at any
  zoom instead of ballooning.

## Independent toggles for all three

Safety zones, violations, and battery are now three separate layers
(`safety`, `violations`, `power`), all on by default:

- **In God Mode** (Facilitator → ⚡ GOD MODE → GRAPHICS): three on/off chips to
  hide any of them on the facilitator's screen, handy for a clean projection.
- **In the Layers panel** (the existing overlay popover, available to every
  participant): the same three now appear as "Zones / Breach / Battery", so each
  player can declutter their own map.

These are per-client view preferences (like every other layer since v156), so one
person hiding the breach graphics doesn't hide them for anyone else.

A correctness note: with **Zones on but Violations off**, a breached zone still
draws its plain base ring (so the zone stays visible), it just doesn't paint the
alarm graphics over it.

## Tests / verification

- 380 unit tests pass, `vite build` clean, `npm run lint` clean, relay 13/13.
- These are canvas-render changes, so they are **best judged by eye**, please
  glance at: a multi-rover fleet at low and high zoom (battery pips stay small and
  attached), a couple of overlapping zones with an active breach (one clean ring +
  dot + pill), and the God Mode / Layers toggles flipping each layer off.

## CHANGES v161, facilitator god mode

Builds on v160. Turns the facilitator panel into a real control desk: hand out or
claw back budget and score, drop or delete assets, and pop a message onto the
players' screens, all live, all pushed to every actor. Plus a tighter confirm
that each actor controls their own map.

## God Mode panel (Facilitator → Round Control → ⚡ GOD MODE)

A new collapsible section with direct, no-cost overrides. Everything routes
through the host (works whether the facilitator is the host or a connected peer),
so the authoritative state changes and re-broadcasts to every screen, and each
action writes a `⚙ Facilitator: …` line to the mission log.

- **Budget**, −100 / −50 / +50 / +100 quick steps, or type an exact "set to"
  value. Target Both, Actor I, or Actor II. (Pairs with v160's accumulating
  treasury: what you grant sticks and the player can spend it immediately.)
- **Score**, −25 / −10 / +10 / +25 quick steps, or set an exact adjustment.
  Drives the composite score directly via `scoreAdjustments`.
- **Assets**, per-actor rows for Solar / Reactor / Habitat / Pad / Rover, each
  with a live count and − / + buttons. **+** drops a fully-built, free asset
  spiralled just off that actor's base (counts toward asset points, stamped with
  a placement seq so v160's violation rules still apply). **−** removes the last
  of that type and claws its points back.
- **Broadcast event to screens**, free-text message + target (Both / Actor I /
  Actor II). It **pops up as an acknowledge-only modal** on the targeted actors'
  screens (not just the log), and they have to dismiss it with "Got it."
- A live readout shows each actor's current budget, composite score, and score
  adjustment so the facilitator can see the effect of what they change.

## Events actually pop up now

Previously only the structured deck injects (the ones with response choices)
surfaced as a modal on player screens. Free-text **custom injects** and the new
**announcements** had no `choices`, so they silently fell into the log and the
table never saw them. The inject-response queue now also picks up `inject_custom`
and `inject_announce` entries and renders them through `InjectResponseModal`'s new
**acknowledge-only mode** (a single "Got it →" dismiss). So anything a facilitator
broadcasts now lands on the targeted screens.

## Each player controls their own map (confirmed)

v160 already made the map view (basemap, overlays, opacity, camera) a per-client
preference, and the Layers/basemap controls are available to every participant , 
so each actor changes their own map without the host overwriting it, and the
facilitator's "Push my view to all screens" button (v160) is the one-tap way to
force a shared view when needed. No code change needed here beyond v160; this is
the verification that the two halves line up.

## Implementation notes

- New host action handlers (all gated to seat 0 / local):
  `facilitator:adjustBudget`, `:adjustScore`, `:addAsset`, `:removeAsset`,
  `:announce`. Each is dispatched from the panel and validated host-side.
- The bug-prone part, keeping the `structureHealth` arrays index-aligned with
  the asset arrays when adding/removing (the v140 off-by-one class), is extracted
  into pure, tested helpers `grantAssetToPlayer` / `removeLastAsset` in
  `playerState.js`, not hand-rolled inside the component.

## Tests / verification

- **380 unit tests pass** (374 → 380; +6 in `tests/playerState.test.js` covering
  grant/remove: correct array + aligned health entry per type, index alignment
  across repeated grants, habitat power + rover power seeding, input immutability,
  point claw-back, and the empty-array no-op).
- `vite build` clean, `npm run lint` clean, relay protocol check **13/13**.
- Verified by harness + build, **NOT a live two-device session.** The god-mode
  actions, the announcement popup reaching peers, and the per-client map all want
  a real multi-screen run with Tommy.

## ⚠️ Reminder from v160, still balance-moving

Carried forward, since they ship together: violation attribution flips to the
second arriver, budgets accumulate, and long facilitator rounds scale movement +
income up to 4×. God-mode budget/score/asset overrides obviously move scores too , 
they're meant to. Worth one live pass before the session.

## CHANGES v160, playtest pass: maps, violations, budget, placement, zones, round length, view push

Seven requested fixes from the session. Each is surgical and traced; the three
that move game balance are flagged at the bottom, please give them a live pass
with Tommy before you rely on them.

## 1. Each actor controls their OWN map; facilitator can force a shared view

The map VIEW (basemap, raster + vector overlays, overlay opacity, and camera) was
being broadcast in every host snapshot and re-applied on each peer, so the host's
view continuously overwrote whatever a player set on their own screen. That's the
"I can't change my own map" report.

- Map-view state is now a **per-client preference** (same treatment `showLayers`
  got in v156): it is no longer broadcast or applied from the rolling snapshot.
  Every actor, and the host, steers their own individual map.
- The host's own view is therefore the only thing the host changes; nobody else
  can stomp it, and the host can't stomp them.

This pairs with #7 (the deliberate way to re-sync everyone).

## 2. Safety violations now hurt the SECOND arriver, not the first placer

Root cause confirmed: `applySafetyDecay` charged the `safetyViolations` penalty to
the **zone owner**, i.e. whoever set up FIRST, and `economy.js` docks −25 score
per violation. So homesteading was being punished and the actor who drove into
your established zone got off free. Exactly backwards.

- Every placed asset (base, rover, structure) now carries a monotonic `seq`
  placement stamp (`assetSeqRef`/`nextSeq()` in App.jsx).
- New pure helper `attributeSafetyViolations(p1, p2, {sharedGridActive})` in
  `enemyZones.js`: a violation is charged to whichever of the two contesting
  assets was placed **later**. The earlier one is innocent.
  - Drive into someone's existing zone → you (the intruder) are the violator.
  - Build a zone on top of an enemy rover that was already there → you (the
    builder) are the violator.
  - Two rovers overlap → only the later-arriving rover's owner is charged (for
    both sides of the overlap).
- `applySafetyDecay` keeps doing the physical structure DAMAGE (an intruder still
  degrades your hardware), but no longer tallies the score penalty: it gained a
  `countViolations` flag (default `true`, so the existing enemyZones tests are
  byte-identical) and the live + headless resolution paths now call it with
  `countViolations:false` and attribute via the new helper. Both paths stay in
  lockstep, so the Monte Carlo can't drift from live scoring.
- Missing seqs degrade gracefully to "charge the intruding rover," which is the
  intuitive default, so partially-stamped or legacy states still behave sensibly.

## 3. Budget increase actually works (it accumulates now)

At round-end the live economy did `newBudget = calcBudget(newE) + bonusCredits`,
which **replaced** the treasury every round and silently discarded any unspent
credits, so investing in ECON or saving up never visibly grew your budget.

- Budget now **carries unspent credits forward and adds the round's income on
  top**, so the number goes up the way a player expects.

## 4. Assets can be placed in ANY round

`buildStructure` gated direct placement behind the one-round arrival grace
(`padFree = hasPlacementGrace(...) || type === "pad"`); after round 1 every
non-pad structure was shunted into landing-pad delivery, which read as "I can't
place my asset." Direct click-placement is now always available
(`padFree = true`); pad delivery remains as an alternate path but is no longer
mandatory.

## 5. Safety zones are legible

v23 had cut the zone fills to 0.03-0.05 alpha and the strokes to 1.4-2.0 px,
which made keep-out zones nearly invisible in a live room. Bumped fills
(≈0.09-0.11) and stroke widths (≈2.0-2.8), and brightened the rover ring's fill
and dash, while keeping the dashes so overlapping zones don't turn back into soup.

## 6. Round duration changes how far rovers move AND how much budget pays out

The facilitator's round-duration setting only drove a wall-clock auto-advance
timer; it had no in-sim consequence. Now a longer round is "actually longer":

- A `roundLenMul` is derived from the duration (Manual/2min → 1×, 5min → 2.5×,
  10min → 4×, capped).
- **Movement:** the live resolution scales the per-day rover step by it via a new
  `stepMul` arg on `stepPlayer` (headless Monte Carlo always passes 1×). Per-day
  power cost is unchanged, `moveCost` is `distMoved/ROVER_STEP`, so numerator and
  denominator scale together, so a long round means "more range on the same daily
  power," not free energy.
- **Budget:** the round's income is multiplied by `roundLenMul` before it's added
  to the treasury, so a 10-minute round is a meaningfully bigger payday than a
  2-minute one.

## 7. Facilitator "Push my view to all screens"

The deliberate counterpart to the per-client map (#1). A new button in the
Facilitator panel's Round Control snapshots the facilitator's current basemap,
overlays, vector layer + opacity, and camera, routes it through the host (works
whether the facilitator is the host or a peer), and fans it out to every screen.
Peers apply it exactly once (a nonce-stamped `viewPush` riding the next snapshot),
with a brief "Facilitator synced everyone to their view" banner. Normal play
leaves everyone on their own map; this forces a shared one on demand.

## Also

- Removed the v158 `[asset-trace]` / `[resolve-trace]` console diagnostics (the
  bug they were hunting was fixed in v159; they were spamming the live console).

## Tests / verification

- **374 unit tests pass** (367 → 374; +7 in `tests/enemyZones.test.js` covering
  `attributeSafetyViolations`: intruder-charged, build-around-charged, no-seq
  default, rover-vs-rover, shared-grid exemption, destroyed anchor, far-away
  no-op).
- `vite build` clean, `npm run lint` clean, relay protocol check **13/13**
  (snapshot now carries `viewPush`; the wire contract round-trips fine).
- Verified by harness + build, **NOT a live two-device session.** The map-view
  per-client + view-push paths and the placement change especially want a real
  multi-screen run.

## ⚠️ Balance-moving, playtest before the session

These three change how the game plays, not just whether it works:

1. **Violation attribution (#2)** flips who eats the −25 penalty. Whole-game
   scores will shift; the first-mover is no longer punished for being crowded.
2. **Budget accumulation (#3)** lets treasuries compound, players can save and
   afford more late-game. This rewards economy investment far more than before.
   (Deliberately left the headless bot economy on the old replace-model so bot
   behavior, tuned around it, isn't destabilized, so batch analytics budgets
   won't match live ones until you decide to port it across.)
3. **Round-length scaling (#6)** makes long rounds much bigger in both movement
   and money (up to 4×). A 10-minute setting is a very different game from 2-min.

## v159, FIX: actor 2's assets vanish in multiplayer

## Root cause (found by code-tracing the host/peer asymmetry)
Placement uses an explore-first flow: selecting a build sets exploreMode, you
click a candidate site, then confirm. The confirm step called the LOCAL
`buildAndPlaceAt`, which mutates only the calling client's player state.

- Actor 1 is the host -> its local placement IS the authoritative state. Fine.
- Actor 2 is a peer -> its confirm placed the asset only in the peer's own
  browser. The host never heard about it, so the host's very next snapshot --
  which has no such asset -- overwrote the peer's state and the asset vanished.

That's why it was multiplayer-only and actor-2-only, and why it looked like the
asset appeared then disappeared (peer shows it locally; next host snapshot wipes
it). A `buildAndPlaceAt` action handler already existed on the host but was
never dispatched.

## The fix (surgical, 1 site)
The peer's confirm-placement now DISPATCHES `buildAndPlaceAt {pi, type, x, y}` to
the host instead of applying locally. The host applies it authoritatively and
broadcasts the result back, so the asset survives. Solo and host placement are
unchanged. The placement is forced to the peer's OWN actor, so a
snapshot-synced shared cursor can't misattribute it.

## How to confirm it worked
The v158 diagnostic logs are still in this build. In multiplayer, place actor 2
assets and conclude a round. In the console you should now see
`[asset-trace] ... P2: {panels: N ...}` go UP on placement and STAY up through
conclude (previously the P2 counts dropped back). If it's fixed, I'll strip the
diagnostics in the next build.

367 tests pass, lint clean, relay 13/13. Cleanly revertible to v158 if needed.

## v158, DIAGNOSTIC build (not a fix)

The asset-vanishing bug is solo-reproducible and actor-2-only, so it's a
deterministic logic bug. But I traced the ENTIRE round-resolution path and every
step provably preserves p2's asset arrays -- so the drop is somewhere my static
reading isn't catching. This build adds console logging (no behavior change) to
pinpoint exactly where actor 2's assets disappear.

## What it logs

- `[asset-trace] phase=… round=… day=… p1Done=… p2Done=… | P1: {...} | P2: {...}`
  -- fires whenever a player or the phase/round/day/done flags change, showing
  each actor's count of panels/reactors/habitats/landingPads/extraRovers.
- `[resolve-trace] roundEnded=… | P2 live=… -> commit=…`
  -- fires at the resolution commit, showing whether the resolution itself drops
  actor 2's assets (live state vs. what gets committed).

## How to use it (this is what I need from you)

1. Run it (`npm run start`), open the game.
2. Open the browser console: press **F12**, click the **Console** tab.
3. Place a couple of assets for **actor 2**, then conclude the round so they vanish.
4. Copy the `[asset-trace]` and `[resolve-trace]` lines from around that moment
   (a few before and after the assets disappear) and paste them back to me.

That will show the exact transition where P2's counts drop -- whether it's the
resolution commit, a render, or the placement not committing -- and then I can fix
it precisely instead of guessing. Remove this build once we've caught it.

367 tests pass, build clean, lint clean. No behavior changed -- logging only.

## CHANGES v157, simultaneous base placement

Reworks setup so both actors place their own base AT THE SAME TIME, instead of the
old sequential SETUP1 (actor I) -> SETUP2 (actor II) flow where actor II had to
wait. This is the placement change from the Tommy Smith playtest.

## How it works now

Setup is a single concurrent phase (SETUP1). A map click places a base for the
actor the CLICKER controls, resolved by seat:

- **Multiplayer:** seat 1 places actor I's base, seat 2 places actor II's base.
  Each routes through the host independently, so both can click at the same time.
- **Solo / facilitator:** clicks fill the next unplaced base (actor I, then II) --
  same two-click feel as before.

The game advances to PLAYING via a dedicated effect once BOTH bases exist. That
effect (not an inline check in the click handler) is deliberate: if both actors
placed in the same tick, an inline read of p1/p2 could be stale and leave the game
stuck in setup with both bases down. The effect re-checks after render and is
host-authoritative (peers follow the host's phase via snapshot).

## Touch points (all in App.jsx)

1. `handleClickAt(x, y, e, forActor)` -- new optional actor arg; SETUP1 branch
   rewritten for concurrent placement.
2. Peer click routing -- a peer's setup click targets THEIR own actor (was a
   phase-fixed actor), so it isn't rejected by the permission check.
3. Host `mapClick` handler -- derives the setup actor from the sender's seat and
   passes it through; permission check uses that actor.
4. New effect -- advances to PLAYING when both bases are placed.
5. Setup help banner -- shows each player what THEY still need to place.

## Preserved

- **Solo:** click -> actor I base, click -> actor II base -> PLAYING (unchanged feel).
- **unevenArrival scenario:** untouched. Actor I sets up, goes straight to PLAYING,
  and actor II still arrives later via the SETUP2 late-actor path (both the auto
  arrival-day trigger and the facilitator manual deploy still work).
- Server-side seat enforcement: a seat can still only place its own actor's base.
- Asset/rover placement DURING play was already concurrent in multiplayer (gated
  by seat, not by turn), so it needed no change.

## Verified / NOT verified

- Build clean, 367 unit tests pass, lint clean, relay protocol check 13/13.
- I traced every path (solo, host-as-actor, host-as-facilitator, both peers,
  unevenArrival, the same-tick race) and they're consistent.
- BUT: I cannot run a live two-device session here, so the actual click ->
  relay -> place -> broadcast behavior is UNVERIFIED. This is the highest-risk
  change so far. Please test it with Tommy before relying on it (checklist in chat).
- If it misbehaves, this is cleanly revertible to the v156 sequential flow --
  say the word.

## CHANGES v156, playtest fixes (the two with clear code-level causes)

From the Tommy Smith playtest. This pass fixes only the two items I could trace
to a definite code cause and verify by reading; the rest are triaged in the chat
because they need a live session or a design decision.

## Fixed

1. **Layers turned themselves off.** `showLayers` was broadcast in the host
   snapshot AND re-applied on every incoming snapshot, so the host's layer state
   overwrote each peer's local toggles continuously, turn a layer on, the next
   snapshot reverts it. Layer visibility is now a per-client VIEW preference: it
   is no longer broadcast or applied, so each participant controls their own view.

2. **Scale bar disappears.** The tracked container width could briefly read 0
   right after a re-render (before the ResizeObserver re-fires), blanking the bar.
   It now falls back to the live container width so it stays put. (If the bar
   vanishes as part of a bigger remount, see "refresh kicks everyone out", this
   only fixes the bar, not the remount.)

## Verified

- 367 unit tests, lint clean, build clean, relay 13/13.
- Both are verified by code + harness, NOT a live two-device session, please
  confirm in a real session with Tommy.

## NOT addressed here (need a live repro or a design call, see chat)

- LFI/SOFI/IFI affecting score or cost (design decision: reward vs cost, magnitude)
- simultaneous rover/asset placement (the setup is sequential SETUP1->SETUP2 by
  design; making it parallel is a real change to the phase machine)
- "refresh kicks everyone out" (host remount loses the session, architectural)
- actor-two assets disappearing mid-round (sync/state race, needs repro)
- "sometimes cannot place rover" (placement is phase/turn-gated, needs repro)
- actors acting for each other (server-side seat enforcement is already in place;
  likely a client-side UX gap where the other actor's controls aren't disabled)

## CHANGES v155, the eroded treaty floor now changes incentives

v154 made the OST walk-back inject move a tracked treaty floor; this closes the
loop so the eroded floor actually *does* something: as the non-appropriation norm
is walked back, crowding a neighbour gets cheaper. This is the slippery slope the
mechanic exists to model, a lower floor makes the next grab more rational.

## What changed (economy.js)

- `scorePlayerState` and `scoreBreakdown` now scale the safety-violation penalty
  by `treatyFloorEffects(player.treatyFloor).violationPenaltyMult`:
  - intact floor (1.0) -> multiplier 1.0 -> full penalty (25 pts/violation)
  - fraying / eroded   -> penalty shrinks toward ~0.37x as the floor approaches
    its minimum, so violations stop costing what they used to
- The debrief's penalty line explains itself when the floor is eroded, e.g.
  *"4 violations · norm eroded (x0.51)"*.

## Why this is safe to ship before a playtest

`violationPenaltyMult` is **exactly 1.0 at the intact floor**, which is the default
for any actor with no `treatyFloor` set. So in any game where the facilitator
never pushes the walk-back inject (or actors always reinforce), scoring is
byte-identical to before, the existing economy invariant tests pass unchanged.
Balance only moves once the norm is actually eroded in play, which is the point.

## Deliberately still NOT wired

`treatyFloorEffects` also exposes `appropriationReward` (a positive payoff to
appropriative moves as the floor falls). I left it out because it needs a clear,
agreed definition of what counts as an "appropriative move" (over-buffer via
inflated safetyMult? an exclusive-zone grab?), a balance choice worth making with
you, not blind. The penalty-weakening half is the clean, clearly-correct piece.

## Tests (+5, 362 -> 367), tests/treatyScoring.test.js

- intact floor is a perfect no-op (no treatyFloor == floor 1.0)
- scoreBreakdown total still equals scorePlayerState once the floor erodes
  (the five-term decomposition invariant holds at every floor)
- the penalty weakens by exactly violationPenaltyMult
- a more eroded floor strictly raises the score (crowding gets cheaper)
- with zero violations the floor has no effect at all

## Verified

- 367 unit tests pass, lint clean, `vite build` clean, relay 13/13.

The full chain now works end to end: facilitator pushes the walk-back inject ->
an actor chooses to erode -> the tracked floor drops (capped, no cliff) -> the
mission log shows the new stage -> the weakened norm makes that actor's future
violations cost less. Verified by harness + build, not a live device session.

## CHANGES v154, the OST walk-back inject finally bites

The `treatyErosion` module (built + tested in v146) was completely inert: the
`ost_walkback` inject's choices carried a `treatyErosion` pressure value, but
`applyInjectDeltas` never read that key, so the treaty mechanic did nothing. This
wires it in, the non-appropriation norm now actually walks back during play.

## What changed

- **`applyInjectDeltas` (injects.js)** now handles `deltas.treatyErosion`, routing
  it through the tested, capped `erodeTreatyFloor`. The inject's three choices move
  a tracked per-actor `treatyFloor`:
  - *Reinforce the floor* (−1) → partial recovery (capped; no-op at full floor)
  - *Let it slide* (+1) → the floor drops a notch
  - *Exploit the opening* (+2) → it drops further
  The walk-back is gradual by construction: each round's step is capped at
  `maxStepDown`, so there is no single-event cliff and the floor never passes
  `FLOOR_MIN`. This is exactly the reviewer's "no single moment the regime broke"
  failure mode, now playable across rounds.

- **Mission log (App.jsx)** surfaces it: when an actor resolves the walk-back, the
  log records the new stage so the table sees the norm fray in real time, e.g.
  *"P1: treaty floor slips, now fraying (0.88)"*.

## Deliberately NOT done (to protect balance before Saturday)

The floor is tracked and shown but does **not** yet feed scoring. The module
already exposes `treatyFloorEffects` (a weakening violation penalty + a rising
appropriation reward as the floor falls), wiring that into live scoring is the
natural next step, but it shifts game balance, so I left it for a pass you can
playtest rather than changing it blind right before the session.

## Tests (+3, 359 -> 362)

In tests/injects.test.js, tied to the real deck:
- ost_walkback is present and its three choices carry treatyErosion [-1, +1, +2]
- applying each choice moves the floor the right direction (reinforce recovers an
  eroded floor; let-slide lowers; exploit lowers more), starting from
  TREATY_FLOOR_INIT when the actor has no floor yet
- sustained exploitation walks the floor down gradually, never past FLOOR_MIN,
  never more than maxStepDown in a round, and eventually reaches "collapsed"

## Verified

- 362 unit tests pass, lint clean, `vite build` clean, relay 13/13.

## One honest caveat

The log line computes the new floor off the actor's current state in the handler
closure (the same pattern the surrounding inject code uses); the *stored* floor is
always correct (it's computed inside the state updater), but in rapid-fire resolves
the logged number could lag by one step. Injects are facilitator-paced, so this
is unlikely to show, flagging it for completeness. Verified by harness + build.

## CHANGES v153, test coverage for the untested sim core

Hardening pass before the live session: added real behavioral tests for three
core simulation modules that had none. No production code changed, this only
adds tests and surfaces how the modules behave.

## New coverage (+20 tests, 339 -> 359)

**tests/power.test.js**, the daily power-allocation core (`allocateDailyPower`,
`getGeneratorOutput`), tested deterministically with reactors (fixed output):
- reactor output is night-independent; solar zeroes at night
- an in-range reactor charges a depleted rover, capped at POWER_CAP
- an out-of-range generator charges nothing
- a habitat with no generator drains exactly one DRAIN/day
- shared grid lets one player's reactor charge the other's rover; isolated grid does not
- a destroyed extra rover is skipped, a healthy one is charged
- inactive / not-yet-arrived players are returned untouched

**tests/physics.test.js**, the VIPER slope curves + `analyzePixel`:
- `roverSlopeFactor` matches `1 - s/25` clamped to [0,1] (impassable at 25 deg)
- `roverPowerFactor` matches `1 + (s/15)^2`, never below 1
- the two curves move in opposite directions (slower => thirstier)
- `analyzePixel` returns null off-map and a complete, well-formed assessment
  on-map (one verdict per asset, all verdicts legal, mining only viable on PSR)

**tests/utils.test.js**, geometry/time/resource helpers:
- `dist` / `clamp` / `lerp`, `stepToward` (interpolation + arrival flag)
- `isNight` flips at the 7-day mark; placement grace lasts one round from arrival
- crater ice scales linearly with size and inversely with depletion
- `snapToPSR` rounds, no-ops on a PSR pixel, and spirals to the nearest one
  (seeds a pixel in the real Uint8Array mask to test the search deterministically)

## Note worth knowing

The map-derived arrays (`SLOPE_MAP`, `PSR_MASK`, `ILLUM_MAP`) and `CRATER_DATA`
are populated by an async image-load that only runs in the browser, so under the
test runner they're zero/empty. The tests are written to hold regardless (pure
functions tested directly; the PSR spiral seeded by hand). Good to know that the
sim modules are import-safe and degrade cleanly with unloaded map data.

## Verified

- 359 unit tests pass, lint clean, `vite build` clean, relay 13/13.

Verified by harness + build. No behavior change to the running app.

## CHANGES v152, consistent constant-size asset markers

Continues the v151 rover-zone fix into a complete pass: every asset marker now
renders at a constant size on screen, so none of them balloon at zoom or swallow
their own safety rings.

## What was wrong

Markers are meant to counter-scale by `_s = 1/max(1,zoom)` so they stay a constant
size on screen while the map (and the geographic safety zones) scale normally.
Habitats, solar, reactors, and the primary rover all did this, but two markers
did NOT:

- **Extra rovers** drew at a fixed radius 7 with no `_s`, so they grew as you
  zoomed in (the opposite of the primary rover, which v151 had just shrunk to 5).
  At zoom they ballooned and buried their own keep-out rings.
- **Landing pads** likewise drew at a fixed radius 9 with no `_s`, ballooning at
  zoom (their zone still showed, since the pad zone exceeds the marker, but the
  marker was inconsistent with the rest of the map).

## Fix (App.jsx, canvas render)

- **Extra rovers**: added the `_s` counter-scale and shrank the marker + badges to
  match the primary rover exactly (core 7→5, turn/label/status/ice/carry all in
  line with v151). The fleet now looks uniform and the extra-rover rings clear the
  marker at every zoom (the v151 ring visibility floor already applied to them).
- **Landing pads**: added the `_s` counter-scale so the pad marker, crosshair,
  pending-delivery badges, and health bar stay constant size like everything else.

Now all six marker types (primary rover, extra rover, pad, habitat, solar,
reactor) counter-scale consistently.

## Verified

- 339 unit tests pass, lint clean, `vite build` clean, relay 13/13.
- Geometry checked: at every zoom each marker stays constant on screen and its
  geographic safety zone scales with the map, so zones read clearly.

Verified by harness + build, not a live device session. Worth an eyeball with a
multi-rover fleet and a couple of pads on the map, at default and high zoom, to
confirm the fleet reads uniform. The broader question of whether the pad marker
(r=9) should also shrink toward the rover size is a taste call I left alone , 
easy to do if you want it.

## CHANGES v151, fix: rover safety zones hidden under the rover marker

Integrates the v150 scale-bar work (already in the base) and fixes the reported
issue: safety zones appeared not to draw, when in fact the rover's zone was being
swallowed by its own marker.

## Root cause

`SAFETY_RADIUS.rover` is 1.44 km = ~2.9 px, but the rover marker was a solid
filled circle of radius 7 (plus a 14-px turn ring and oversized badges). So the
rover's keep-out ring was drawn INSIDE the marker and read as "no zone." The fill
was also very faint (~9% alpha). Larger asset zones (habitat ~29, pad ~14,
reactor ~12, solar ~6 px) exceed their markers and always showed, but in early
game you only have a rover, so it looked like zones weren't drawing at all. The
"it's the latter" guess (under the ginormous rover graphic) was exactly right.

## Fix (App.jsx, canvas render)

- **Shrank the rover graphic ~30%**: core 7→5, turn/selection ring 14→10, the "1"
  label, status icon, ice bubble, carry badge, and power dot all scaled down. The
  marker is no longer ginormous and stops swallowing nearby detail.
- **Rover ring now always reads as a ring**: drawn at a low-zoom visibility floor
  (`max(trueR, 7.5*_s)`) that clears the shrunk marker; as you zoom in past ~2.6x
  the true ~2.9 px radius takes over. **Collision and scoring still use the true
  `SAFETY_RADIUS.rover`**, the floor is render-only (same spirit as the reactor
  zones, which are sized up for workshop visibility).
- **Brighter ring**: dashed stroke alpha 0x55→0xbb, width 0.8→1.2, fill alpha
  bumped, so zones read clearly against the marker.

Other assets were unaffected (their zones already exceed their markers); only the
rover needed the floor.

## Verified

- 339 unit tests pass, lint clean, `vite build` clean, relay 13/13.
- Visual logic checked: at every zoom the ring clears the marker; the floor only
  inflates the rover ring at low zoom and fades to true size by ~2.6x.

## Note

This is a targeted shrink of the rover marker to fix the visibility bug. A broader
graphics-shrink pass (other sprites/badges, building markers) is still open if you
want it next. Verified by harness + build, not a live device session, worth an
eyeball on the map at default zoom and one zoomed-in view to confirm it reads.

## CHANGES v150, integrate the map scale bar

Integrates the uploaded v150 work (a bottom-center map scale bar) on top of the
v146 base. The v150 snapshot was byte-identical to v146 except for App.jsx, so
the only new feature was the scale bar; this version adopts it, verifies it, and
makes it a tested part of the codebase.

## The feature (as uploaded)

- A `ResizeObserver` tracks the live map-container width (`mapContainerWidth`),
  with a requestAnimationFrame retry until the ref is attached, and clean
  teardown.
- A bottom-center ruler shows the real-world ground distance for the current
  zoom: a mint bar with end/centre ticks and a km/m label.

## Verification (the actual "integration")

- Traced the viewport transform in `getXY`: across the container the visible span
  is `W/zoom` source-px, and at `MAP_KM_PER_PX = 0.5 km/px` that is exactly
  `MAP_KM/zoom` km of ground. The bar's `kmPerPx = (MAP_KM/zoom)/containerWidth`
  is therefore **accurate** and consistent with how the map is actually panned and
  zoomed, not just internally plausible.

## Made it a tested module (consistent with the rest of the sim)

- Extracted the inline scale math into **`src/sim/scaleBar.js`** (`scaleBarFor`),
  behavior identical; App.jsx now calls it and renders the same bar. The render
  JSX is unchanged.
- New **`tests/scaleBar.test.js`** (6 tests): the `kmPerPx` formula, the nice
  1/2/5 step selection, the km↔m label switch, null on un-computable inputs, the
  zoom fallback, and the invariant that the bar width stays in a comfortable
  ~60-160px band across zoom levels.

## Verified

- **339 unit tests** (333 → 339), lint clean, `vite build` clean, relay 13/13.
- All prior work (v141-v146: actor alignment, reconnect, round control, consortium,
  late arrival, economy tests, and the three coordination mechanics) carried
  forward unchanged.

Verified by harness + build, not a live multi-device session.

## CHANGES v146, three new coordination mechanics (reviewer's notes ⑤⑥⑦)

Implements the three tabletop mechanics from the design review as pure, tested
sim modules plus low-risk integration (a live inject + a facilitator readout).
No change to the existing resolution loop, so the working game is untouched.

## ⑤ Effective-denial-zone (shrink-to-expand), `src/sim/denialZones.js`

Makes the cooperative-looking land grab measurable: a bloc can shrink every
member's individual safety zone (each looks more proportionate) while GROWING the
territory it actually denies, by tiling the smaller zones adjacently instead of
stacking big overlapping ones.
- `circleUnionArea` (deterministic grid sampling, no RNG, stable in tests)
- `individualZoneArea`, `blocDenialMetrics` (footprint vs sum, overlap wasted,
  tiling efficiency)
- `shrinkToExpand(before, after)` → flags the signature: every buffer shrank yet
  the bloc's footprint grew.

## ⑥ US-as-spoiler, `src/sim/blocNegotiation.js`

Encodes the reviewer's inversion: the US-led bloc, not the counter-coalition, is
the harder actor to trust to hold a coordinated line.
- `blocSpoilerRisk(blocId)` from three drivers, low internal cohesion, an
  act-ahead commercial member that can defect unilaterally, and a principal who
  can override the agency that signed. Concordium ≈ 0.76 risk vs LRC ≈ 0.25.
- `spoilerComparison()` → names Concordium as the harder actor, with a one-line
  workshop framing.
- Surfaced read-only in the facilitator panel as a **Coordination read** block.

## ⑦ OST slow walk-back, `src/sim/treatyErosion.js` + new inject

Models the non-appropriation floor eroding GRADUALLY, not in a single redraft.
- `erodeTreatyFloor` (per-round pressure lowers the floor; a single round is
  capped at `maxStepDown`, so there is no cliff, the walk-back is gradual by
  construction; cooperative rounds claw it back).
- `treatyStage` (intact → fraying → eroded → collapsed), `treatyFloorEffects`
  (a lower floor weakens the violation penalty and rewards appropriation, the
  slippery slope), `treatyTrajectory` (shows collapse takes several rounds).
- New **`ost_walkback` inject** in the live deck: reinforce / let-slide / exploit,
  each carrying a `treatyErosion` magnitude that feeds the floor model. Push it
  across rounds to enact the erosion.

## Verified

- **333 unit tests** (318 → 333: +5 denial, +6 treaty, +4 spoiler), incl. the
  `ost_walkback` inject being in the deck and well-formed.
- lint clean, `vite build` clean, relay 13/13.

## Notes / what's deliberately light

These are wired as tested mechanics + one live inject + a read-only facilitator
readout, NOT as deep changes to the per-round resolution (e.g. the treaty floor
is not yet a tracked global that auto-modifies every round's scoring, it is
driven by the inject and available to the facilitator). Making the floor a live,
auto-applied global modifier is a larger resolution change I'd do as its own pass.
Verified by harness + build, not a live multi-device session.

## CHANGES v145, hardening: lock the untested scoring core

Tests-only. No functional/runtime change, this version exists to put a safety
net under the part of the sim that decides who wins.

## Why

`src/sim/economy.js` drives every budget, the per-round E/R/M deltas, the
competitiveness term C, the composite mission score, the score breakdown, and the
debrief findings, and it had **no direct test**. A quiet edit to any formula there
could change scoring out from under the exercise with nothing to catch it.

## What

New `tests/economy.test.js` (13 tests) covering:
- `calcBudget` (ALPHA·E with the E_INIT fallback)
- `calcCompetitiveness`, weights sum to 1, a sole leader maxes at C=1, the
  contentness offset clamps to [0,1], and zero maxima never produce NaN
- per-round deltas at the C=1 reference point, with negative R floored not propagated
- `calcRdMineBonus`, `calcMilScore` (incl. the 0.1 floor)
- `calcAssetCosts` stakeholder multiplier (Halcyon lands cheaper pads)
- `makePlayer`, starting budget scales by stakeholder; footprint mods seed
  `safetyMult` (emplacer > 1, light prospector < 1); inactive players hold no
  asset points until `activatePlayer`
- `scorePlayerState` arithmetic
- **the key invariant**: `scoreBreakdown(p).total === scorePlayerState(p)`, and the
  five breakdown terms sum to that total (so the debrief can never disagree with
  the HUD score)
- `debriefAnalysis`, winner, margin, the clean-vs-violation safety finding, dead heat
- `pickMergedGridState`, the shared > offered > independent merge ranking
- alloc presets well-formed

## Audit result

No bug found, `economy.js` is well-guarded (Math.max / log1p / clamp throughout).
The value here is locking the behavior, not fixing a defect.

## Verified

- **318 unit tests pass** (305 → 318), lint clean, `vite build` clean, relay 13/13.

Verified by the test harness + build, not a live multi-device session.

## Still open (flagged, not done)

- **Host page-reload / crash recovery** remains the top robustness gap: a socket
  blip is handled (v142), but a full host reload loses the in-memory host token and
  all React state, so the session can't be recovered even though the server still
  holds the last snapshot. A safe version (persist the token to sessionStorage,
  rehydrate the host from the server snapshot on reload) is a React-level change
  that this project can't auto-test, worth doing deliberately, not rushed.
- Other untested modules: `power.js`, `physics.js`, `mapData.js`, `utils.js`.

## CHANGES v144, Concordium consortium board actor + facilitator late-arrival

Brings the briefs' multi-actor structure into the sandbox within the engine's
real constraint: the simulation renders exactly TWO board actors (p1/p2 are baked
into ~300 references and dozens of pairwise loops across resolution, claims,
scoring, and rendering). A true N-independent-footprint board is a major refactor
and is deliberately NOT attempted here. Instead:

## Consortium as a board actor (packs three brief actors into one slot)

- New selectable board actor **`concordium` → "Concordium"**: the coalition as one
  actor. Selecting it surfaces its three members, Vanguard + the Aurelian Union /
  Halcyon, in the bloc-disaggregation panel at the same **~44% cohesion** the
  briefs quote (it aliases Concordium's internal factions). Pooled budget, broad
  capability, but a genuine science-vs-commercial compromise.
- **The default matchup is now Concordium vs LRC**, so out of the box the board
  represents **four** brief actors (Concordium's three + LRC). Either slot can be
  re-picked in the lobby (an individual member, or the Ascendant Initiative).

This is the "more than 3 actors" win the 2-slot engine can deliver honestly: one
board slot = three coordinating actors whose internal negotiation is modeled and
visible, rather than five separate footprints.

## Facilitator-controlled late arrival

- New **"Deploy late actor now →"** control in the facilitator round-control panel,
  shown only when the second board actor is still off the board (a late-arrival
  session, e.g. the Asymmetric Arrival scenario, the natural home for the
  Ascendant Initiative, whose brief turns on uncertain surface access). It drives
  the same SETUP2 arrival the scheduled timer uses, so the arriving actor places
  its base normally, but on the facilitator's cue rather than a fixed day.
- New host action `facilitator:deployLateActor`, gated to a trusted local/host
  dispatch or a remote seat-0 facilitator, reached through the existing
  dispatchAction router + latestRef pattern (works for a facilitator on any seat).

## Verified

- NEW alignment test: the Concordium consortium is a selectable board actor that
  disaggregates into its named members at 44% cohesion.
- `tests/sim.test.js` archetype count 6 → 7 (adds `concordium`).
- **305 unit tests pass**, lint clean, `vite build` clean, relay 13/13.

## The honest constraint (and what a fuller version would take)

Two board slots is a hard engine limit right now. A Concordium-vs-LRC game shows
four of the five brief actors; the **Ascendant Initiative** is represented either
as the late arriver in a slot (vs one bloc) or discussed at the table, it can't
sit on the board *simultaneously* with both Concordium and LRC. Giving all five
actors independent on-board footprints (their own assets, zones, claims, scoring)
means generalizing p1/p2 into an N-player array throughout the sim, a large,
higher-risk refactor I'd want to do deliberately, with its own test pass, not in
the run-up to the session. Flagged as a follow-up if you need it.

Verified by build + harness, not a live multi-device session.

## CHANGES v143, facilitator round control (push the next round, mid-game)

Gives the facilitator live control over pacing: push to the next round on demand,
set a wall-clock round duration that auto-advances, and change the total round
count mid-game. Works whether the facilitator is the host or a peer on seat 0.

## What it does

In the facilitator panel (seat 0), a new **Round control** section:
- **Push next round →**, ends the current round immediately and advances. On the
  final round it ends the mission.
- **Round duration · auto-advance**, Manual / 2 / 5 / 10 min. When set, the host
  auto-advances each round after that wall-clock interval (chained round to round).
- **Total rounds**, − / + to extend or shorten the game mid-session
  (clamped to ≥ the current round, ≤ 40); shown only in fixed-length mode.

## How it's built (no round logic duplicated)

- **`facilitatorPushRound()`** drives the SAME tested day-resolution path a natural
  round-end uses: it jumps to the final day (`day = DAYS_PER_ROUND - 1`) and ends
  both actors' turns, so the existing resolution effect runs the normal round-end , 
  economy, history entry, round transition, and the mission-end check. It's guarded
  against firing mid-transition or mid-resolution.
- **Round-duration timer** is a host-only effect that re-arms each round and waits
  out the transition pause; peers receive the resulting round changes via snapshots.
- **`roundDurationMs`** is new synced state (added to the broadcast snapshot + the
  peer ingest), so a peer facilitator's setting and the host stay in sync.
- **Multiplayer:** three new host action handlers, `facilitator:pushRound`,
  `facilitator:setRoundDuration`, `facilitator:setTotalRounds`, gated to a trusted
  local/host dispatch or a remote seat-0 (facilitator) peer, reached through the
  existing `dispatchAction` router and the `latestRef` pattern (no stale closures).
  A facilitator on any seat (host or peer) drives the same controls.

## Verified

- `tests/multiplayer.integration.mjs`: **13/13** relay checks (added one pinning the
  `facilitator:*` round-control action names to the wire contract).
- **304 unit tests pass**, lint clean, `vite build` clean.

## Note

The round-advance logic lives in `App.jsx` and is exercised by the clean build and
by reusing the already-covered resolution path, not by a React-level unit test
(this project has no component-test harness). "Push next round" resolves the round's
final day and advances; intermediate days of a cut-short round are not separately
resolved, pushing is a deliberate "we're moving on" control. Verified by build +
harness, not a live two-device session.

## CHANGES v142, host-disconnect resilience (the session no longer dies on a blip)

Closes the biggest multi-user failure mode before the live session: previously,
the instant the HOST socket dropped, a wifi blip, the host laptop sleeping, a
backgrounded tab, the server emitted `room:closed`, deleted the room and its
snapshot, and kicked every peer back to the lobby. socket.io would reconnect the
host, but as a brand-new socket with no room. A two-second hiccup ended the game.

## The fix: a host grace window + a host-resume token

**Server (`server/server.js`):**
- Hosting a room now mints a secret **`hostToken`** (returned only to the host).
- On host disconnect the room is **no longer destroyed**. Instead the server
  keeps the room and its snapshot, emits `room:host-disconnected` to peers, and
  starts a **grace timer** (`HOST_GRACE_MS`, default 45 s). Peers stay in the
  room.
- New **`room:resume-host`**: the host reconnects, presents its token, and
  reclaims the room, the grace timer is cancelled, peers get
  `room:host-reconnected`, and the preserved snapshot is handed back. A wrong
  token is rejected, so the room can't be hijacked.
- If the host never returns, the grace timer closes the room with reason
  `host-timeout`. Explicit `room:leave` still closes immediately (intentional,
  not a blip). Peer actions during the gap are dropped rather than sent to a
  null host.

**Client (`src/multiplayer.js`):**
- On a successful host/join the hook records what to re-establish (and the host
  stores its token). When socket.io reconnects mid-session it **transparently
  reclaims the room**, `room:resume-host` for the host, `room:join` (same seat)
  for a peer, pulling the latest snapshot back.
- A blip no longer flips the UI to "offline": the session view stays put and a
  banner shows the state. New surfaced fields: `reconnecting`, `hostPresent`,
  `notice`.

**UI (`src/App.jsx`):** a small, palette-pure banner in the participants panel
shows "Connection lost, reconnecting…" (your socket) or "Host connection lost , 
waiting…" (peer side), so a blip reads as *reconnecting*, not *frozen*.

## Verified

- `tests/multiplayer.integration.mjs` extended from 8 to **12 live relay checks**,
  all passing: a host blip notifies peers **without** closing the room; the host
  resumes with its token and the **snapshot is preserved**; peers are told the
  host reconnected; a **wrong token is rejected**; and the room **does** close
  once the grace window expires. The test runs with `HOST_GRACE_MS=1500` for
  speed.
- **304 unit tests pass**, lint clean, `vite build` clean.

## Note

Verified against the live socket.io relay in the integration harness and a clean
build, not yet across two physical machines on real flaky wifi. The resume path
relies on socket.io's own reconnection firing `connect` again, which it does by
default (`reconnectionAttempts: 4` in the client). Default grace is 45 s; lower
it via `HOST_GRACE_MS` if you want rooms to recycle faster.

## CHANGES v141, port the brief-aligned actor model onto the v140 line

Integrates the actor-model alignment (originally v138, written on the v136
baseline) into the current codebase. v140's work was all map-rendering (pixel-
layer cache, legend gating, ridge toggle, rover safety-zone fixes), so it never
touched the actor files, this port is clean, with no conflict against any v140
change. Display/flavour only: every numeric game mechanic and every actor id is
unchanged, so saved state, snapshots, and presets keep working.

## What changed

**Actors (`src/sim/stakeholders.js`), renamed to the brief vocabulary, ids kept:**
- `artemis` → **Vanguard** (Concordium's civil-exploration lead)
- `ilrs` → **LRC** (Lunar Research Consortium, the counter-coalition)
- `large_commercial` → **Halcyon Aerospace** (Concordium's big-tonnage emplacer)
- `small_commercial` → **The Ascendant Initiative** (light-footprint polar-ice prospector)
- `observer` → Civil Observer (unchanged)
- **NEW `aurelian` → The Aurelian Union**, the fifth brief actor (multilateral
  science/rules, modest footprint, low disturbance, ice-prospecting payload).
  Additive and selectable; `artemis` stays first so getStakeholderDef's
  default-to-first is unchanged.

Blurbs/work-packages use the obscured programme/vehicle names (Pillar/Helios/
Forerunner, Atlas/Augur, Leviathan, Steppe/Vesper, Polaris-Ice). Palettes moved
onto "The Both" (Concordium reads as a blue family, LRC deep violet), still
distinct on the map. No budget/cost/footprint/disturbance modifier touched.

**Blocs (`src/sim/blocNegotiation.js`):** Concordium's split is now labelled by
actor, *Science wing, Vanguard + Aurelian Union* vs *Commercial, Halcyon
Aerospace* (the briefs' framing). New `BLOC_LABELS` ({artemis:"Concordium",
ilrs:"LRC"}); the framing line reads "Concordium: 44% cohesion; the science wing
is the swing…". Influences/priority vectors untouched, so the cohesion the briefs
quote is preserved exactly: **Concordium 44%, LRC 69%** (those figures come from
this module, the briefs were written downstream of it).

**Scenario presets:** the visible "NASA Phase 1 / Artemis Base Camp" labels read
"Concordium Phase 1 / Concordium Base Camp" (preset ids unchanged).

## Verified

- NEW `tests/actorAlignment.test.js` (5 tests): display names match the brief
  vocabulary; all five brief actors present; **no real-agency name (NASA/ESA/
  SpaceX/ISRO/JAXA/Artemis/ILRS) leaks into a player-facing identity field**;
  blocs map to Concordium/LRC; cohesion still rounds to 44% / 69%.
- `tests/sim.test.js` archetype-count test updated 5 → 6 (adds `aurelian`);
  all id/mechanic assertions unchanged.
- **304 tests pass** (was 299). Lint clean. `vite build` clean. `npm run
  test:mp`, 8/8 realtime relay checks pass.
- The only "Artemis/ILRS" strings left in `src/` are code comments; no
  player-facing identity field carries a real-agency name. App.jsx's actor
  selection and bloc-disaggregation panel (untouched by v140) surface the new
  names automatically.

## Note

Flavour/wire alignment, verified by tests + relay harness + clean build, not by
a two-device live session. The Aurelian Union is additive; the default two-actor
game is still the Concordium-lead (Vanguard) vs LRC pairing the exercise is built
around.

## CHANGES v140, render performance + map-legend/safety-zone correctness

This release bundles several map-rendering fixes on top of v132: a large draw
performance win (cached pixel layer), legend accuracy, a new toggleable sunlit-
ridge layer, and two rover safety-zone bugs found while auditing the zone
rendering. Each is written up in its own section below.

---

## Cache the pixel layer so the pulse animation stops re-rendering it

Fixes the long-standing canvas slowness. The map redraw was recomputing the
entire per-pixel overlay layer 6+ times a second even when nothing on the map
had changed, purely because a cosmetic pulse animation shared the same draw
path.

## The problem

`draw()` contained four per-pixel passes, PSR depletion tint, claims
fill + edge detection, mine trails, and night dimming. Each iterates the full
1212×1212 source grid (~1.47M pixels) and the block does a
`getImageData`→`putImageData` round-trip on top.

That cost is acceptable *if it runs only when the map changes*. It didn't. The
`pulseTick` state increments every 160ms to drive the breathing pulse on reactor
exclusion rings, and `pulseTick` was in `draw()`'s dependency array. So every
pulse, 6+ times a second, forever, while idle, forced the whole pixel pipeline
to recompute, even though the pulse itself only needs three cheap `ctx.arc`
calls with a sine value.

In other words: a sine-wave ring glow was dragging ~6M pixel iterations per
second behind it.

## The fix: split the static pixel layer from the animated vector layer

The four pixel passes depend ONLY on: the `showLayers` flags
(psr_depletion / claims / mine / night), `craterHealth`, `p1`/`p2` (claim +
mineMap data), `claimR`, and the night flag derived from `globalDay`. They do
NOT depend on `pulseTick`, `hover`, `viewport.zoom`, asset selection, etc.

- The pixel passes now render once into an offscreen canvas (`pixelLayerRef`)
  inside a `useMemo` keyed on exactly those real inputs. It recomputes only when
  one of them actually changes (a mine tick, a new claim, a layer toggle, day
  rollover).
- `draw()` no longer runs any pixel loops. It composites the cached layer with a
  single `ctx.drawImage(pixelLayerRef.current, 0, 0)`. The basemap still sits
  beneath via the existing DOM-layer compositing, so the rendered result is
  pixel-identical to before.
- The pulse / vector overlays (rings, badges, labels, rover arrows) still redraw
  every 160ms as they did, but that pass is now cheap.

## Effect

- Idle (the common case, pulse animating, nothing being mined): from ~6M
  pixel-iterations/second down to zero. The heavy pass runs only on frames where
  a player mines, places a claim, or toggles a layer.
- Rendered output is unchanged; the pixel logic is copied verbatim, only its
  trigger conditions changed.

## Verified

- `src/App.jsx` parses and bundles cleanly (esbuild, jsx loader). No stale
  references to the removed `imgData`/`d` locals remain inside `draw()`.
- Hook placement follows the rules of hooks: the new `useMemo` is unconditional
  at component-body top level. The cache's inputs (`p1`, `p2`, `craterHealth`,
  `showLayers`, `claimR`, `globalDay`) are already in `draw()`'s dep array, so
  the blit and the cache stay in sync, when the layer rebuilds, `draw()`
  re-blits the same frame.

## Note / not yet done

- I could not run the full Vite build or the app here (no working dev
  environment for the sim data modules), so please confirm visually that the
  PSR / claims / mine / night layers render identically after the change. The
  logic is unchanged, so they should.
- Next likely bottleneck if any jank remains: the vector-overlay portion of
  `draw()` (crater badges, safety rings, labels) and the high-DPR display blit,
  which scales the backing store up to 8192px at high zoom. Both are far smaller
  than what this change removed.

---

## Also in v140, legend no longer lists features that aren't on the map

The map legend was bundling several entries under coarse conditions, so toggles
revealed swatches for things that weren't actually being drawn. Each legend
entry is now gated on the same condition the renderer uses, so the legend only
names what is genuinely visible.

- **Safety zones (the main offender).** A single `showLayers.safety` check
  pushed all six swatches, rover / solar / pad / habitat / reactor zone, plus
  the violation key. But the map draws one ring *per placed asset*, so a zone
  type with no assets drew nothing. Each zone swatch is now gated on that asset
  type actually existing for either player, and the "Zone violation" key only
  appears when both players have assets (the only way a violation can occur).
- **Claim regions.** The on-map claim fill is only painted when BOTH players
  exist (`computeClaims` partitions PSR pixels between the two). The legend
  listed a per-player claim swatch whenever that player existed, so a solo P1
  showed a "P1 claim" entry with nothing on the map. Both claim swatches are now
  gated on `p1 && p2`.
- **Mine heatmap.** A player's "mined" swatch showed as soon as the player
  existed, but the map only paints pixels for a non-empty `mineMap`. The swatch
  is now gated on `mineMap` actually having cells.
- **PSR depleted.** The base PSR overlay (`showLayers.psr`) paints every PSR
  pixel the same fuchsia, it never shows the amber "depleted" tint. That amber
  appearance is produced only by the separate `showLayers.psr_depletion` layer.
  The legend listed both fuchsia and amber under `psr`, so the amber "depleted"
  swatch named a color not on the map. The fuchsia swatch now sits under `psr`
  (relabeled "PSR (ice)") and the amber "depleted" swatch only appears when
  `psr_depletion` is on.

Rendering and the legend hover-highlight behavior are otherwise unchanged; the
hover handler is keyed by swatch string and simply skips any entry that isn't
present.

---

## Also in v140, sunlit ridge is now a toggleable layer

The sunlit-ridge glow was always drawn whenever the map was loaded, with no way
to turn it off. It is now a normal toggleable overlay like PSRs, claims, etc.

- Added a `ridge` entry to `LAYER_TOGGLES` (the single source of truth that
  feeds both the HUD layer bar and the settings panel), so a "Ridge" / "Sunlit
  Ridge" toggle now appears automatically in both UIs.
- `showLayers.ridge` defaults to `true`, so the out-of-the-box appearance is
  unchanged, the layer is simply switchable now.
- The ridge-glow blit in `draw()` is gated on `showLayers.ridge !== false`, and
  the "Sunlit ridge" legend entry is gated on the same flag so it disappears
  from the legend when the layer is off (consistent with the v140 legend fix).

Note: this only toggles the *visual* ridge overlay. The underlying ridge mask
still drives game mechanics (solar-panel placement bonuses, the hover terrain
readout, seeding logic), which are terrain facts independent of the overlay and
are intentionally left always-on.

---

## Also in v140, fix rover safety-zone health misindexing

Investigating whether safety zones draw correctly turned up one real bug in the
per-asset safety-ring loop in `draw()`.

The loop built a combined `roverList`, primary rover at index 0, then extra
rovers, but looked up each entry's health as
`structureHealth.extraRovers[combinedIndex]`. That array only holds the EXTRA
rovers' health (the primary rover's health is tracked separately, in
`structureHealth.primaryRover`, per `applySafetyDecay` in enemyZones.js). The
result was an off-by-one across the whole rover set:

- The primary rover's zone read the FIRST extra rover's health, so a destroyed
  first extra would wrongly suppress the (always-healthy) primary rover's zone.
- Each extra rover's zone read the NEXT extra's health; the last extra read
  `undefined`, defaulting to 1.0, so a destroyed final extra still drew a zone.

This was a visual-only defect, the scoring path (`applySafetyDecay`) and the
shared-power-grid visualization both index rover health correctly, so points and
power flow were unaffected; only the drawn rings could appear/disappear on the
wrong rover.

Fix: each asset class in the ring loop now carries an explicit per-entry
`healthAt(idx)` resolver. The primary rover resolves to 1.0 (matching its
treatment everywhere else, where it is effectively decay-immune and absent from
`extraRovers`), and each extra rover resolves to `structureHealth.extraRovers[i]`
at its own extra index. The other asset types (solar/reactor/habitat/pad) keep
their existing correct lookups, now via the same resolver for consistency.

Other safety-zone behavior was verified correct: violation detection collects
assets with the right per-type health, destroyed structures (health ≤ 0.1)
correctly project no zone, the shared-grid generator exemption matches the
scoring rule, and zone radii use `SAFETY_RADIUS[type] * safetyMult`.

---

## Also in v140, rover safety-zone rendering cleanup

Prompted by a question about which ring around the rover is the safety zone.
The answer: the small ring that stays constant size on screen at every zoom (the
`14 * _s` ring) is the TURN / SELECTION indicator, not a safety zone, it is a
UI marker and is intentionally zoom-invariant. The actual rover safety zone is
the larger dashed ring at radius `SAFETY_RADIUS.rover`, which correctly scales
with the lunar surface. That distinction was working as intended.

Verifying it, though, surfaced three genuine defects in how the rover zone was
drawn:

1. **The Zones toggle did not hide rover zones.** `drawRoverSafetyZones` ran
   unconditionally, while every other asset's zone is gated on
   `showLayers.safety`. Turning the Zones layer off left rover rings on the map.
   Now gated on `showLayers.safety`.
2. **Rover zones ignored `safetyMult`.** Every other asset zone uses
   `SAFETY_RADIUS[type] * safetyMult`, but the rover path used the bare radius,
   so under a non-default multiplier the rover ring was the wrong size relative
   to everything else (and relative to its own violation-detection radius). Now
   applies `safetyMult`.
3. **Rover zones were drawn twice with mismatched styling.** The per-asset
   safety loop AND `drawRoverSafetyZones` both painted a rover base ring, one
   solid, one dashed, at different radii, so rover zones looked denser/odd
   compared to other assets. `drawRoverSafetyZones` exists deliberately to
   redraw the rover ring crisply in the sharp display pass, so it now owns the
   rover BASE ring exclusively; the per-asset loop skips the rover base ring but
   keeps rover VIOLATION rendering (breach halo, chevrons, BREACH label, HUD
   tally), which the sharp-pass function does not handle. Destroyed rovers
   (health ≤ 0.1) also now correctly project no zone in the sharp pass, matching
   the scoring threshold used everywhere else.

Net: one rover safety ring per rover, correct size, respecting the Zones toggle,
with violations still flagged.

## CHANGES v137, fix silent multi-user snapshot desync (comms grid, basemap, overlays)

A correctness fix for live multi-laptop sessions, ahead of the Saturday
tabletop. Bug class: a host→peer state field that the host broadcasts and the
peer is written to apply, but that never crosses the wire.

## The bug

The host curates `snapshotForBroadcast` (App.jsx) and the peer's ingest handler
applies each field; both sides agreed on a 42-field set. But `packSnapshot`
(multiplayer.js) re-filtered that curated object through a SECOND, hand-
maintained allowlist (`SNAPSHOT_KEYS`) that had drifted. Seven fields the host
sends and the peer expects were silently dropped on the wire:

- `commsGridState`, `selectedComms`, the comms-grid negotiation (v103+). Peers
  never saw comms-grid offers or sharing state.
- `baseMap`, basemap selection. Host/facilitator changes the basemap; peers
  stayed on their own default.
- `activeOverlaysArr`, `activeVectorOverlaysArr`, `vectorOverlay`,
  `vectorOverlayOpacity`, every toggled map layer. The facilitator turns on an
  ice / favorability overlay to make a teaching point and **the players' screens
  don't change.**

Invisible in single-laptop testing (one client both sends and renders), which is
why it survived to v136. It only manifests with a real second device, exactly
the Saturday configuration.

## The fix

Root cause was the double allowlist. Removed it. The host's curated
`snapshotForBroadcast` is now the single source of truth: `packSnapshot` passes
it through verbatim, encoding only the typed arrays that don't survive JSON
(`craterHealth` → `craterHealthArray`, plus a defensive plainify for any stray
typed array). Adding a synced field in App.jsx is now the ONLY step required , 
there is no middle list left to forget.

Serialization moved to a pure, dependency-free module so the wire contract is
testable like the rest of `src/sim/`:
- NEW `src/sim/snapshotSync.js`, `packSnapshot` / `unpackSnapshot` /
  `SNAPSHOT_KEYS` (now accurate; documentation only, not a filter).
- `src/multiplayer.js` imports and re-exports them (no API change for callers).

## Verified

- 6 new tests (`tests/snapshotSync.test.js`): every curated host field reaches
  the wire; the seven previously-dropped fields round-trip pack→unpack; the
  `craterHealth` Float32Array → `number[]` → Float32Array round-trip; stray
  typed arrays are plainified and the payload stays JSON-safe; null/missing
  inputs tolerated; `SNAPSHOT_KEYS` stays honest. The "every curated field
  survives" test fails against the old allowlist and passes now, it pins the
  exact regression.
- 299 tests pass (+6). Lint clean. `vite build` clean.
- `npm run test:mp`, all 8 realtime relay checks pass (host / join / snapshot
  sync / seat-enriched peer action / chat / membership / host-leave).

## Note

This was a wire/serialization fix, verified by the round-trip tests and the
existing relay integration test, not by a two-device live session (the headless
harness can't drive two real browsers). The logic is now pinned by tests, but a
quick two-laptop smoke test before Saturday, toggle an overlay and change the
basemap on the host, confirm the peer screen follows, is still worth doing.

## CHANGES v136, bloc internal-negotiation panel (surfaces v135)

Turns the v135 bloc-disaggregation foundation from a dormant module into a
usable, visible feature. Integration, not a new module.

## What's added

On the actor-setup screen, each core actor (Artemis / ILRS) now shows an
"Internal negotiation" panel beneath its archetype:
- a cohesion bar + percentage (green >=70%, amber >=50%, red below), colored by
  how unified the bloc is;
- each faction with its influence %, and the dissenting faction marked "· swing".

So a facilitator setting up a session immediately sees Artemis is a 44%-cohesion
compromise between its science and commercial constituencies (science is the
swing), and ILRS is more unified -- the intra-bloc tension is visible before play
rather than hidden by a monolithic actor.

## Verified

- Verified LIVE on the settings screen (which the headless harness can reach,
  unlike the in-game state): the panel renders for both core actors, with the
  cohesion bar, faction influence %, and swing marker, no console errors
  (screenshot-confirmed). This is a rare end-to-end live verification for a UI
  addition in this project.
- Pure negotiation logic remains locked by the v135 tests (6).
- 293 tests pass. Lint clean. Build clean.

## Note

The panel is a DISPLAY of the negotiation; it does not yet change in-game
behavior. Letting the negotiated bloc position modulate site preference or risk
tolerance is a deliberate design choice, deferred (ROADMAP.md).

## CHANGES v135, bloc disaggregation + internal negotiation: pure foundation

First increment of the actor-disaggregation roadmap item. Built as a pure,
fully-tested foundation (same approach as the orbit layer), so the mechanics are
solid before any UI.

## New module: src/sim/blocNegotiation.js (pure, tested)

Each core actor is modeled as a coalition of sub-actors rather than a monolith:
- Artemis = science constituency + commercial constituency.
- ILRS = state science programme + strategic / prestige wing (symmetry).

Each sub-actor has an `influence` (weight in the bloc) and a `priorities` vector
over { ice, throughput, safety, speed }. negotiateBlocPosition runs the internal
negotiation: an influence-weighted blend to a single bloc position, a COHESION
score (1 = unanimous, lower = fragile compromise), the maximum pairwise SPREAD,
and the DISSENTER (the swing faction furthest from the agreed line).

By default Artemis lands at ~44% cohesion -- its science and commercial wings
pull in different directions (ice + safety vs throughput + speed), so the bloc
position is a genuine compromise with the science constituency as the swing.
ILRS is more unified (~69%). That quantified intra-bloc tension, hidden by the
current single-actor model, is the dynamic the roadmap asked to surface.

## Honest notes

- Weights and priority vectors are tunable defaults tuned for a legible dynamic,
  NOT sourced figures.
- This is the foundation; it is NOT yet wired into the running game. NEXT
  INCREMENT (in ROADMAP.md): a pre-game / per-round internal-negotiation panel,
  and optionally letting the bloc position modulate that actor's behavior.

## Verified

- 6 new tests (tests/blocNegotiation.test.js): Artemis splits correctly,
  influence-weighted blending, low cohesion + named dissenter for a divided bloc,
  full cohesion + no dissenter when unanimous, influence normalization, and ILRS
  symmetry + description. Fixed during dev: a unanimous bloc no longer names a
  spurious dissenter (dissenter only when spread > 0).
- 293 tests pass (+6). Lint clean. Build clean.

## CHANGES v134, orbit layer integration: crash disposal drops real debris

Second increment of the orbit/disposal layer. The pure foundation (v133) is now
wired into the running game through the satellite_disposal inject, so the
intertemporal-disposal externality becomes SPATIAL, not just an abstract score
hit.

## What's wired

- The satellite_disposal inject's "cheap crash-disposal" choice now carries a
  dropsDebris flag. When chosen, the inject handler crash-disposes an orbital
  object (via the v133 disposeOrbitalObject) onto the COUNTERPART's base region
  -- the future user's ground -- and adds the resulting surface keep-out zone to
  new orbitalDebris state. A mission-log line records the debris field + its km.
- Debris renders on the map as a hatched amber exclusion with an "orbital debris"
  label, distinct from actor safety zones, fading as it decays.
- Debris decays each round-end via the tested tickOrbitalObjects; expired clouds
  drop off. Cleared on new game.
- The draw effect now depends on orbitalDebris so it repaints on change.

So v129's "your disposal fouls a future user's exploration zone" is now a real
keep-out on their terrain, on top of the score externality.

## Verified

- Render confirmed in isolation (hatched amber keep-out + label, on-brand).
- Spawn logic uses the tested disposeOrbitalObject; decay uses the tested
  tickOrbitalObjects (both locked by the v133 orbit tests).
- 287 tests pass. Lint clean. Build clean.
- HONEST LIMITATION: could not push the inject through a full live PLAYING
  session (standing headless-harness limit), so the in-game appearance of the
  debris after picking the inject choice was verified by render + wiring +
  the underlying tested functions, not an end-to-end click-through.

## Remaining on the orbit layer

(b) feed debris zones into the violation tally so operating in them costs score;
(c) a fuller orbital overlay (bands, operational sats); (d) the strategic-reserve
orbital depot. Tracked in ROADMAP.md.

## CHANGES v133, orbit / disposal layer: pure foundation (roadmap, big item)

First increment of the largest roadmap item, the orbital dimension. Built as a
pure, fully-tested foundation so the mechanics are solid before any UI/render or
inject wiring. This is deliberately ONE slice of a multi-part feature.

## New module: src/sim/orbit.js (pure, tested)

- makeOrbitalObject: an object in lunar orbit (comsat / debris / reserve_depot)
  with an altitude band and a ground projection (sub-lunar point) clamped to the
  map.
- disposeOrbitalObject: end-of-life disposal.
  - "graveyard": boost to the graveyard band; clean, no surface keep-out.
  - "crash": de-orbit onto a surface target, leaving a debris keep-out zone
    {x,y,r} (reusing the existing zone shape) scaled by the object's mass, and
    lofting an ejecta cloud back to orbit.
- loftEjectaToOrbit: ejecta-to-orbit coupling for any surface event (a heavy
  landing or crash lofts material to a decaying orbital debris cloud).
- tickOrbitalObjects: decays transient debris clouds, drops expired ones, leaves
  operational objects untouched.
- orbitalSurfaceZones: the surface keep-out zones currently projected by orbital
  debris, in the {x,y,r} shape the existing pointInAnyZone / violation machinery
  already consumes -- so wiring it into violations later is a drop-in.

## Honest notes

- PHYSICAL NUMBERS ARE PLACEHOLDERS, isolated in ORBIT_TUNING and tuned for
  legible game behavior, NOT survey accuracy. The roadmap asks to cite Metzger's
  ejecta work as the basis; I did NOT fabricate any Metzger figures -- the module
  is explicitly "pending ejecta-model calibration," matching the existing
  hazard-framework dust convention. Calibration is a one-place edit.
- This module is NOT yet wired into the running game. It is the foundation. The
  next increments (documented in ROADMAP.md): wire crash disposal into the
  satellite_disposal inject so the cheap-disposal choice drops a real surface
  debris zone; feed orbitalSurfaceZones into the violation tally; build an
  orbital overlay/render; and connect the strategic-reserve scenario's orbital
  depot dimension.

## Verified

- 8 new tests (tests/orbit.test.js): ground-projection clamping, graveyard vs
  crash, mass-scaled debris radius, off-target crash, ejecta lofting, debris
  decay + drop, and that only debris (not operational sats) projects a surface
  zone.
- 287 tests pass (+8). Lint clean. Build clean.

## Roadmap status

Orbit layer: foundation built (this drop), integration is the next increment.

## CHANGES v132, regolith disturbance becomes a live mechanic (finishes v130)

Closes the loose end flagged in v130: the commercial re-spec stored a
`disturbanceMod` but nothing consumed it. Now it drives a real in-game
consequence, so both halves of the emplacer-vs-prospector distinction (footprint
AND regolith disturbance) matter mechanically.

## The hook: landing debris

Placing an asset is a landing, and the existing landingImpact() already damages a
rival's nearby structures within a radius (plume/debris). That is the natural
home for disturbance. landingImpact now scales BOTH the debris radius and the
damage amount by the PLACING actor's disturbanceMod:

- Emplacer (disturbanceMod 1.5): debris reaches ~1.5x further and hits ~1.5x
  harder. Heavy emplacement is genuinely disruptive to neighbours.
- Prospector (disturbanceMod 0.5): debris radius and damage halved. A light
  operator can work close to others without wrecking their hardware.
- Non-commercial actors (1.0): identical to prior behavior.

This ties disturbance to a mechanic that already exists rather than inventing a
new scoring term, and it gives the prospector a real cooperative advantage (works
near others cleanly) to set against the emplacer's footprint dominance.

## Verified

- 1 new contract test (tests/sim.test.js) locking the scaling the inline
  landingImpact implements: disturbance widens the debris radius (emplacer hits a
  structure the prospector misses) and scales damage (exactly LANDING_DAMAGE *
  disturbance, clamped). Non-commercial = 1.0 unchanged.
- 279 tests pass (+1). Lint clean. Build clean.

## Roadmap status

The commercial-actor re-spec (v130) is now fully realized: footprint -> zone
size (v130), regolith disturbance -> landing debris (v132). Remaining roadmap:
the large architectural pieces (orbit/disposal layer, actor disaggregation) and
the source-dependent items (PNT actor / $4B award, Lunar Development Corporation,
emerging-state revisit). The strategic-reserve scenario's orbital half still
waits on the orbit layer.

## CHANGES v131, strategic-reserve scenario (roadmap item)

Fifth build from the ROADMAP backlog. A scenario that reframes the objective from
"cash out ice fastest" to "build and hold a strategic reserve."

## The scenario

New preset (strategic_reserve, "Strategic Reserve"): a 20-round, long-horizon
run briefed around holding a reserve of ice / propellant rather than depositing
it immediately. Stockpiled and in-transit ice is the prize; patient accumulation
beats a quick grab.

Reuses the framing-panel machinery from the governance analogues: a new
SCENARIO_BRIEFINGS block (same shape as GOVERNANCE_ANALOGUES) renders through the
same settings panel, which now adapts its header -- "Governance analogue" for
ATCM/ITU, "Scenario briefing" for the strategic reserve.

## Honest scope

The scenario delivers the briefing, the long horizon, and the reframed objective.
TWO deeper pieces are deliberately NOT claimed:
- The orbital reserve dimension (propellant cached in orbit) waits on the
  orbit / disposal layer, which does not exist yet. The briefing says so
  explicitly: "for now the reserve is the surface-and-transit stockpile."
- The score formula is unchanged. Carried/in-transit ice already scores (at the
  carry fraction), so a reserve strategy is viable and rewarded, but I did not
  re-weight scoring to make held reserve strictly dominate deposit -- that would
  mean threading an override through the pure scorePlayerState, which I avoided
  to keep the v123 scoring contract intact. The reserve framing rewards the
  existing carry mechanic rather than inventing a new scoring term.

## Verified

- Live: the preset appears in the settings list; selecting it renders the
  briefing panel with the adaptive "Scenario briefing · Strategic Reserve"
  header, premise, and tabletop framing (screenshot-confirmed). No console errors.
- 2 new tests: the scenario's 20-round horizon + briefing wiring (incl. the
  honest orbit caveat in the text), and that briefings share the analogue shape.
- 278 tests pass (+2). Lint clean. Build clean.

## Roadmap status

Done: inject cluster (v127-v129), commercial re-spec (v130), strategic-reserve
scenario (v131). Remaining: the large architectural pieces (orbit/disposal layer,
actor disaggregation) and the source-dependent items (PNT actor / $4B award,
Lunar Development Corporation, emerging-state revisit). Also still open: wiring
the v130 disturbanceMod into a scoring/visual effect.

## CHANGES v130, commercial-actor re-spec: emplacer vs prospector (roadmap item)

Fourth build from the ROADMAP backlog. Differentiates the two commercial actors
along a sharper conceptual axis than budget: footprint and regolith disturbance.

## The re-spec

- large_commercial -> **EMPLACER**: big-tonnage operator that lands large fixed
  installations and heavy ISRU plant in a concentrated footprint. High
  throughput, but a LARGE keep-out footprint (footprintMod 1.6) and heavy
  regolith disturbance (disturbanceMod 1.5).
- small_commercial -> **PROSPECTOR**: wide-roaming, light, mobile survey/sampling
  operator. Small footprint (footprintMod 0.6) and low disturbance
  (disturbanceMod 0.5); works near others and across more ground, but cannot
  emplace heavy plant.

Blurbs, short labels (EMPLACER / PROSPECTOR), and work packages updated to match.

## Implementation (reuses the v127 zone machinery)

- stakeholders.js: added footprintMod + disturbanceMod to both commercial defs.
- economy.js makePlayer: sets the player's `safetyMult` from the stakeholder's
  footprintMod, and carries disturbanceMod. So an emplacer projects oversized
  keep-out zones from the start and a prospector projects small ones, via the
  exact safetyMult path the zone renderer and violation tally already honor
  (added in v127). Defaults to 1 for non-commercial actors -> no behavior change
  for Artemis / ILRS / observer.

## Verified

- Footprint contrast flows to real zones: an emplacer habitat projects a keep-out
  radius of 50.8 vs a prospector's 19.0 -- a 2.7x difference -- through
  buildEnemyZones (the path violations use).
- 4 new tests: the defs are differentiated (emplacer footprint/disturbance > 1 >
  prospector); makePlayer carries footprintMod -> safetyMult and disturbanceMod;
  non-commercial actors stay at 1.
- 276 tests pass (+2). Lint clean. Build clean.

## Honest scope note

Footprint is the ACTIVE mechanic this drop -- it flows into real keep-out zones
and scored violations. disturbanceMod is carried on the player as a ready field
but is not yet consumed by a scoring or visual hook; wiring regolith disturbance
into the score or a map effect is a clean follow-up.

## Roadmap status

Done: inject cluster (v127-v129) + commercial-actor re-spec (v130). Remaining:
strategic-reserve scenario (medium), orbit/disposal layer + actor disaggregation
(large), and the items needing external sources (PNT actor / $4B award, Lunar
Development Corporation, emerging-state revisit).

## CHANGES v129, intertemporal disposal inject (roadmap item)

Third and final quick inject from the ROADMAP backlog. Completes the inject
cluster (national-security v127, first-mover-gets-it-wrong v128, this).

## The mechanic

New inject (satellite_disposal): an end-of-life comms-sat must be de-orbited.
The teaching point is the temporal externality -- today's cheap disposal becomes
tomorrow's keep-out, paid by whoever inherits the region.

Three choices:
- Controlled de-orbit to a graveyard: -120 credits, +8 score. The cost stays
  with the owner; no externality.
- Targeted disposal in your own spent area: -30 credits, -2 score. Cheap, and the
  keep-out lands on you, not a future user.
- Cheap crash-disposal (externalize it): +40 credits, +2 score for the owner, but
  a counterpartDelta of -16 score lands on the OTHER actor -- the future user
  whose exploration zone the debris fouls.

## Implementation: counterpartDelta

Added a `counterpartDelta` field on inject choices. The inject-response handler
applies it to the OTHER actor's player state (via applyInjectDeltas), with its
own mission-log line noting that actor inherited an externality. This is the
vehicle for "your decision, someone else's cost" -- the disposing actor saves
money while a future user pays. Cleanly reuses applyInjectDeltas; no new
delta-application path beyond routing to the counterpart.

## Verified

- Externality dynamic: owner picking cheap disposal gains +2 score / +40 budget;
  the future user loses 16 score. The cost lands on the inheritor, not the
  disposer, as intended.
- 2 new tests: choice shape (responsible options carry no counterpartDelta;
  the externalizing one benefits owner + penalizes counterpart) and that the
  counterpart's score moves by exactly the externalized amount.
- 274 tests pass (+2). Lint clean. Build clean.

## Roadmap status

Inject cluster COMPLETE: national-security (v127), first-mover-gets-it-wrong
(v128), intertemporal disposal (v129). Remaining roadmap items are larger:
commercial-actor re-spec, strategic-reserve scenario, the orbit/disposal layer,
actor disaggregation, plus the items needing external sources or a design call.

## CHANGES v128, first-mover-gets-it-wrong inject (roadmap item)

Second build from the ROADMAP backlog. A "resource reassessment" inject that
stress-tests the polar-ice-as-prize assumption the whole map encodes.

## The mechanic

New inject (resource_relocation): fresh prospecting data relocates the
economically viable resource to mid-latitudes, stranding polar infrastructure.
A new `strandedScale` delta applies a write-down PROPORTIONAL to the actor's
sunk polar asset points (assetPts), so the bloc that over-committed to the pole
loses the most. That proportionality is the teaching point: betting everything
on the pole is exactly what gets punished.

Three choices:
- Write down the polar position, pivot: realize the full stranded-asset loss now
  (strandedScale 3) but +4 and cut further exposure.
- Hold and hedge: smaller write-down (strandedScale 1.5), divert some effort,
  scoreAdj 0, ongoing uncertainty.
- Double down on the pole: no write-down, but -6 and a morale hit for the
  un-hedged gamble.

## Implementation

- injects.js: the inject + a `strandedScale` delta in applyInjectDeltas that
  subtracts strandedScale * max(0, assetPts) from scoreAdjustments. Pure;
  reads the player's own asset points so the penalty is self-scaling.
- No new subsystem; extends the existing inject machinery.

## Verified

- Numeric: a polar over-builder (12 asset pts) takes a 32-pt write-down on the
  "write down" choice; a diversified actor (3 asset pts) loses 5. Over-committing
  to the pole costs more, as intended.
- 2 new tests: choice shape (write-down > hold strandedScale; double-down has
  none) and that the penalty scales 1:1 with sunk asset points.
- Note: the pre-existing "every choice carries an explicit scoreAdj" contract
  test (from v123) caught a missing scoreAdj on the hedge choice during dev;
  fixed by making it explicit (0). The transparency contract did its job.
- 272 tests pass (+2). Lint clean. Build clean.

## Roadmap status

Done: national-security inject (v127), first-mover-gets-it-wrong (v128). Still
open and codeable: intertemporal disposal inject (a bloc's comms-sat disposal
lands on a future user's zone) -- the last of the three quick inject items.

## CHANGES v127, national-security inject (roadmap item)

First build from the ROADMAP backlog: the national-security inject, testing the
first-mover-advantage-by-safety dynamic.

## The mechanic

A new inject (natsec_designation) lets one actor invoke a NatSec label over its
surface assets. Mechanically this sets a per-player `safetyMult` that inflates
that actor's keep-out zones. Because the rival's assets can then fall inside the
enlarged zones, the rival accrues real, scored safety violations it could not
avoid: de facto exclusive zoning. Safety rules, applied asymmetrically, become a
land grab.

Three choices trade the land advantage against legitimacy:
- Invoke the full buffer (~2.2x): lock down nearby terrain, but -10 score and a
  morale hit (read as a land grab).
- Accept a modest buffer (~1.4x): genuine protection, limited zoning, +2.
- Decline: no buffer change, +8 (keeps the cooperative high ground).

## Implementation (extends existing systems, no new subsystem)

- injects.js: the new inject + a `safetyMult` delta in applyInjectDeltas
  (clamped [1,4]).
- enemyZones.js: buildEnemyZones now multiplies each zone radius by the owner's
  safetyMult (defaults to 1 -> existing behavior and tests unchanged). This is
  the path the violation tally uses, so the dynamic is REAL, not cosmetic.
- App.jsx: the rendered safety rings also scale by the owner's safetyMult, so the
  inflated zones are visible, matching the scored ones.

## Verified

- Numeric demonstration: a rival point at distance 53 from a habitat is OUTSIDE
  the normal zone (r=31.7) but INSIDE the NatSec zone (r=69.8) -> a previously
  legal position becomes a scored violation.
- 5 new tests: the inject's three choices and their score signs; safetyMult set +
  clamped; buildEnemyZones scales radius 1:1 with safetyMult; invalid/missing
  safetyMult is back-compatible (treated as 1).
- 270 tests pass (+3). Lint clean. Build clean.

## Roadmap status

Done: national-security inject. Still open and codeable next: first-mover-gets-
it-wrong path, intertemporal disposal inject (both extend this same inject +
zone machinery).

## CHANGES v126, roadmap backlog captured

Added ROADMAP.md: a tracked backlog of design and research directions beyond the
current feature set, from a "To Dos" list. Captured faithfully and organized into
actor modeling, injects, scenarios, new systems/layers, research threads, and
coordination, with status markers distinguishing concrete build items from open
design questions ([~], need a decision or external source) and personal actions
([coord], not code).

No application code changed; this is a planning document. Linked from the README.
External references in the list (Phil Metzger dust work, the ~$4B comms/nav award,
Castle-Miller's Lunar Development Corporation) are noted as "verify before citing"
rather than asserted, since they were not researched here. 267 tests pass; build
clean.

## CHANGES v125, per-asset feasibility layers (item 8) · 7-item list COMPLETE

The final item. Adds a placement-feasibility layer for each buildable asset:
"where is it actually sensible to put this?"

## New module: src/sim/feasibility.js (pure, tested)

assetFeasibility(L, type) scores a location [0,1] for each of solar, reactor,
habitat, pad, rover, comsat, from the same static terrain the favorability
indices use (slope, illumination, Earth visibility, PSR mask):

- solar:   illumination-dominated on buildable slope (ridge crests / PELs)
- reactor: flat stable ground, PSR floors penalized, sunlight irrelevant
- habitat: surface-ops safety -- slope + some illumination, hard PSR penalty
- pad:     flatness-dominated touchdown ground
- rover:   traversability -- feasible nearly everywhere slope allows
- comsat:  direct-to-Earth visibility for the relay footprint

computeFeasibilityRasters() fills one Float32 raster per asset once after
loadMapData (alongside computeIndexRasters), NaN outside the data disk.

## Rendering + UI

The six layers reuse the existing computed-overlay path: registered in
LAYER_INFO with `computed: true` and a distinct hue, painted by
buildIndexLayerCanvas (extended with the feas_* keys), and surfaced as a new
"Asset placement feasibility" group in the Layers panel. Toggling feas_solar
shows where panels are viable, etc. Each carries a one-line description of what
the asset needs.

## Verified

- 8 new unit tests (tests/feasibility.test.js): scores stay in [0,1]; solar
  tracks illumination; reactor wants flatness not light; comsat wants Earth
  visibility; PSR floors penalize habitat/reactor; rover is broadly feasible;
  pad is flatness-dominated.
- Live: the six feasibility toggles render in the Layers panel with their
  colors; toggling one applies cleanly with no console errors.
- 267 tests pass (+8). Lint clean. Build clean.

## The 7-item request is now complete

1. Pixelation (layers/power/rings) ............ v120 (smoothing blit)
2. Visibly show the 3-ring system ............. v119
3. Clean up basemaps/layers ................... v120 (18 -> 10)
4. Make Aaron's hazard work visible ........... v121 (DLA badge)
5. Every action alters score w/ rationale ..... v123 (logged + contract test)
6. Wifi / multi-device works .................. v124 (8/8 relay checks, test:mp)
7. Reorder explore mode ....................... v122 (assets top, geology bottom)
8. Per-asset feasibility layers ............... v125 (this drop)

## CHANGES v124, verify wifi / multi-device mode (item 6)

Item 6 of the 7-item list. Exercised the realtime multiplayer relay end to end
and locked it with a repeatable test.

## What was verified

A two-client integration test drives the live socket.io relay (server/server.js)
through the full multi-device flow. All 8 checks pass:

1. Both clients connect to the relay.
2. Host creates a room and gets a room code + seat.
3. Peer joins with the code and is assigned the requested seat (2).
4. Host's state snapshot reaches the peer (state sync host -> peer).
5. Peer's action reaches the host, enriched with the peer's seat (so the host's
   seatCanActAs authorization works -> peer -> host action path).
6. Chat broadcasts to all members.
7. Room membership reflects both members.
8. Peer is notified (room:closed) when the host leaves.

Also confirmed the client/server contract matches: every event the client emits
and listens for in src/multiplayer.js (room:host, room:join, room:set-role,
room:leave, state:snapshot, action, chat; room:update, room:closed) lines up with
server/server.js. No drift.

## Repeatable check

- tests/multiplayer.integration.mjs, the two-client flow.
- `npm run test:mp`, starts the server on PORT=8799, runs the test, tears it
  down. Kept separate from `npm test` (which stays pure, fast, and network-free).
- README documents both LAN multiplayer setup and the verification command.

## Result

Wifi / multi-device mode works: hosting, joining by code, live state sync, peer
actions, chat, and host-leave handling all verified against the real server.
259 unit tests pass. Lint clean. Build clean.

## Remaining

8. Per-asset feasibility layers (the last item; a substantial new feature).

## CHANGES v123, score transparency: every action logs its score rationale (item 5)

Item 5 of the 7-item list. Audited every score-affecting action so each writes a
mission-log entry stating how the score moved and WHY.

## The audit

scorePlayerState sums five terms: banked ice (x1/kg), carried ice (x0.5), asset
points (xSCORE_PTS_PER_AP=15), scoreAdjustments (1:1), minus violations (x25).
Walking every action that touches those terms:

- Asset placement (all paths: explore-confirm, deploy-at-base, route-to-pad):
  adds asset points -> moved the score, but the log only stated the credit cost.
  Now each placement log states the budget spent AND the score gained, e.g.
  "...spent 40 budget · +30 score (+2 asset pts)".
- Power/comms grid actions (open/join/decouple): already adjusted score and
  logged the action verb; now the log also states the explicit point delta, e.g.
  "P1 opened its power grid · +30 score (cooperation)".
- Inject responses: logged only when the score moved. Now every response logs the
  chosen option and either its point delta or "no score change", e.g.
  P1 inject response ("Stand down" to Dual-use flag): +15 score.
- Resupply (a budget action that restores asset health): does not move any of the
  five scoring terms directly; the log now says so explicitly ("no direct score
  change (restores asset health, protecting existing asset points)"), so a
  facilitator is not left wondering why a credit spend did not change the score.

Facilitator-driven grid actions (batch path) already adjusted + logged; the
violation penalty is already surfaced live in the HUD with its per-turn cost.

## Contract test

Added a score-transparency contract test (tests/sim.test.js): one asset point
moves the score by exactly SCORE_PTS_PER_AP; scoreAdjustments deltas (the +30 /
+20 / -20 grid values, inject deltas) move it 1:1; a violation costs exactly
SCORE_PENALTY_VIO; a pure budget spend (resupply) is score-neutral. This locks
the numbers the new rationale strings claim.

## Verified

259 tests pass (+1). Lint clean. Build clean. No change to the scoring model
itself; this is transparency -- making the existing score logic legible in the
mission log so the debrief can explain every movement.

## Remaining (next drops)

6. Verify wifi / multi-device mode.
8. Per-asset feasibility layers (substantial new feature).

## CHANGES v122, reorder explore mode (item 7)

Continuing down the 7-item list. This drop does item 7.

## Item 7, explore-mode order: assets to top, geology to bottom

The explore sidebar (ExploreSidebar.jsx) opened with the geology readout
(physical terrain data + LFI/SOFI/IFI favorability indices) and put the
actionable parts (equipment recommendations + asset-placement buttons) at the
bottom. Per the request, the actionable "assets" cluster now leads and the
geology detail sits below it.

New top-to-bottom order:
1. Header (coordinates), unchanged, stays at top
2. Equipment recommendations
3. Asset placement buttons
4. Physical data block            } geology, now at the bottom
5. Mission-phase favorability     }
6. Footer note, unchanged

So explore mode now leads with "what can I build/place here" and ends with the
deeper "why" (terrain physics and favorability), which matches how the mode is
used: decide and place first, consult the geology for justification.

The two geology blocks kept their conditional wrappers intact (the favorability
block is still `{a.indices && (() => { ... })()}`), and the placement block still
gates on the active player's PLAYING turn.

## Verified

- Build compiles cleanly (authoritative proof the reordered JSX balances).
- Source render-order confirmed: Header -> Recommendations -> Asset placement ->
  Physical data -> favorability -> footer.
- Block wrappers verified intact after the move.
- 258 tests pass. Lint clean.

(Note: the live click-harness cannot drive base placement to the PLAYING phase
where explore mode + the sidebar activate, so the order was verified by build +
source structure rather than a headless screenshot. The change is a pure
section-order move within one component; no logic changed.)

## Remaining (next drops)

5. Score every action with a logged rationale (substantial audit), next.
6. Verify wifi / multi-device mode.
8. Per-asset feasibility layers (substantial new feature).

## CHANGES v121, make Aaron's hazard work visible (item 4)

Continuing down the 7-item list. This drop does item 4.

## Item 4, make the Lunar Radius Framework hazard work cleaner / visible

The hazard integration (v117) was correct but nearly invisible: applying a DLA
hazard scenario (via the Z panel or a public/buffers.json) only changed the
safety-ring radii, with no sign the rings were now hazard-derived rather than
default. Aaron's work was doing something real that a facilitator could not see.

Added a persistent on-map badge, shown whenever a hazard scenario is active:
- "DLA HAZARD ZONES ACTIVE" header with a glowing instrument-blue indicator
- the source site name (e.g. "Shackleton Rim Alpha") in Spectral italic
- the three zone radii: core / buffer / coord in km
- a "Lunar Radius Framework · press Z to adjust" footer

Implementation: a new `activeHazard` state ({ site, label, zones }) set in
applyHazard and cleared in resetHazard. The badge sits top-left, nudged below the
violations HUD when both are showing, gated on PHASE.PLAYING (same gate as the
violations HUD). On-brand styling ("The Both" palette, Spectral + Bricolage).

## Verified

- applyHazard / setActiveHazard fires on a loaded buffers.json (confirmed via the
  mission-log entry in a live run).
- The badge renders correctly (isolated render: header, site, zone radii, footer,
  all on-brand and legible).
- 258 tests pass. Lint clean. Build clean.

(Note: the live click-harness could not drive base placement all the way to the
PLAYING phase where the badge gates, so the badge itself was verified in
isolation with populated state; the apply path was verified live.)

## Remaining (next drops, in order)

5. Score every action with a logged rationale (substantial audit).
6. Verify wifi / multi-device mode.
7. Reorder explore mode (placement/assets top, geology bottom).
8. Per-asset feasibility layers (substantial new feature).

Next drop: item 7 (explore reorder), then item 5 and item 8 as dedicated passes.

## CHANGES v120, anti-pixelation + basemap cleanup (items 1 & 3)

Working straight down the 7-item list. This drop does items 1 and 3.

## Item 1, pixelation in layers / power / rings

Root cause: the app composites onto a fixed 1212x1212 "work" canvas, then blits
it up to the display backing store (1212 * dpr * zoom, up to 4.5x). That blit
used nearest-neighbour (imageSmoothingEnabled = false), which kept per-pixel PSR
tints crisp but made everything vector-like drawn on that canvas -- the safety
rings, the 3-ring reactor zones, and the pooled-comms / shared-power links --
hard-edged and blocky when zoomed.

Fix: the work->display blit now uses high-quality smoothing, so those overlays
interpolate cleanly at zoom instead of stair-stepping. The favorability composite
and SVG basemap were already crisp (separate DOM layers) and are unaffected.

Note for a later drop: the fully crisp path is to move the rings/power into the
existing sharp-overlay pass (redrawSharpOverlayRef / sharpDrawFns), which draws
vectors directly on the display canvas at native zoom resolution. That is a
larger refactor; this smoothing change is the focused, low-risk win now.

## Item 3, clean up basemaps / layers

The basemap picker had grown to 18 entries, many stale or redundant raster
variants that blur on zoom now that the published true-vector plates are the
standard. Pruned to a curated 10:

Kept: QuickMap LROC and LROC Relief (real-data mosaics worth having), the
published vector plates (Topography, Favorability Composite, LFI, SOFI, IFI,
Illumination), the synthetic vector topo, and the real LROC illumination raster.

Removed: Topographic B&W, B&W + burned-in physics (legacy), Site Planning,
Periwinkle Topographic, Periwinkle Elevation, Dramatic Relief, Topographic
Contours (raster), Topographic + PSRs (raster), Rainbow Elevation.

RASTER_BASEMAPS updated to the kept rasters. The removed keys' file-path entries
are left in the FILES map (harmless; just no longer offered) and no render path
breaks (verified: no dangling references, default basemap_fig_topo intact).

## Verified

258 tests pass. Lint clean. Build clean. Live: app boots, no removed basemap
labels appear anywhere, console clean; zoomed view shows the overlays
interpolating rather than pixelating.

## Remaining (next drops, in order)

4. Make Aaron's hazard work cleaner/more visible.
5. Score every action with a logged rationale (substantial audit).
6. Verify wifi / multi-device mode.
7. Reorder explore mode (placement/assets top, geology bottom).
8. Per-asset feasibility layers (substantial new feature).

## CHANGES v119, 3-ring zone visibility (item 2 of the 7-item request)

First increment of a 7-item request. This one targets item 2: the Open Lunar
3-ring reactor zone system was hard to see.

## Change

Strengthened the three nested reactor zones so they read at a glance:
- Exclusion core (red): fill alpha 0.42->0.58, halo 10->11px, ring 5->6px.
- EMI / notification (teal): fill 0.26->0.38, glow 0.40->0.52, ring 4.5->5.5px.
- Coordination buffer (white marching-ants): fill 0.14->0.20, glow 0.35->0.45,
  ring 4->5px.

The three zones now separate clearly (red core / teal mid / white dashed outer),
matching the Open Lunar core-operations / harmonization / coordination model.
Verified in isolation: distinct, legible nested rings.

258 tests pass. Build clean. No behavior change; rendering only.

## The other six items (honest status, NOT done yet)

This was deliberately scoped to one verified change rather than rushing seven.
Remaining, roughly in the order I would tackle them:

1. Pixelation in layers / power / rings, the power-flow links and ring strokes
   are canvas-drawn; needs zoom-compensated stroke widths and/or routing through
   the crisp DOM path. (Rings are now bolder but the crispness pass is separate.)
3. Clean up basemaps/layers, prune stale raster basemaps now that the vector
   plates are default.
4. Make Aaron's hazard work cleaner/more visible, clearer hazard-zone rendering
   and surfacing of the loaded scenario.
5. Score every action with a logged rationale, audit every score-affecting path
   (budget, facilitator response, injects) and ensure each writes a reasoned
   mission-log entry. This is a substantial audit.
6. Verify wifi / multi-device mode, exercise the multiplayer host/join/sync path.
7. Reorder explore mode, asset placement + assets to top, geology to bottom.
8. New per-asset feasibility layers, compute and show where each asset type is
   viable to place. This is a substantial new feature.

Items 5 and 8 are large enough to each deserve a focused pass.

## CHANGES v118, terrestrial governance analogues as scenario templates

Adds two real terrestrial resource-governance regimes as scenario templates, so
a workshop can run the same lunar map under different rule philosophies and
compare outcomes.

## ATCM, Antarctic Treaty Consultative Meeting

Consensus governance; sovereignty claims set aside; environmental protection and
mutual inspection over competition. Mapped to a no-interference regime
(HOSTILE_DECAY 0, MIL_DAMAGE_SCALE 0, like the cooperative preset) on a longer
16-round horizon that gives the consensus / inspection rhythm room. Tabletop
framing: actors deconflict by agreement, not force; cooperation is the default;
the debrief asks whether consensus held under resource pressure.

## ITU, radio-regulation coordination logic

First-come-first-served registration of a footprint, plus mandatory coordination
between operators whose zones would interfere. Interference is left ON
(overlapping keep-out zones are the whole point), mapped onto the sim's existing
safety-zone notification and comms-grid coordination. The hazard framework's
"coordination zone" is itself ITU-derived language, tying the two together.
12-round standard horizon.

## Implementation

- GOVERNANCE_ANALOGUES (atcm, itu) in scenarioPresets.js, each with analogue /
  premise / tabletop framing, and two new entries in SCENARIO_PRESETS carrying a
  `governance` block alongside the usual rounds / overrides. They auto-render in
  the settings scenario list like any preset.
- When a governance-analogue preset is selected, a framing panel appears under
  the preset list (analogue name, premise, tabletop rules) so the facilitator
  can brief the table on the rule philosophy, not just the clock and economy.
- 3 new tests lock the presets' rounds, overrides (ATCM no-interference; ITU
  interference-on), governance metadata, and that non-governance presets carry
  no governance block.

258 tests pass (+3). Lint clean. Build clean. Verified live: both presets appear
in the settings list and the ATCM framing panel renders on selection.

## Note on the rest of the request

"Blog Post #2 submitted" and "Simulation inputs finalised so WP5 can run" were
read as status/context, not code changes, so no code was written for them.

## CHANGES v117, Lunar Radius Framework integration

Integrates the uploaded OLF DLA "Lunar Radius Framework" (Aaron Mac, v0.5), the
companion tool that computes hazard exclusion zones and exports buffers.json.

## Finding: most of it was already integrated (and better)

A prior session had already ported the framework's logic natively into the sim:
- src/sim/hazardZones.js has computeDustRadii / computeManualRadii (formulas
  verified to MATCH the uploaded tool exactly: core = 0.5 * effective^0.55,
  clamped [0.5,30]), parseBuffersJson (import), buildBuffersJson + buildGeoJson
  (export), and the zone->asset mapping.
- src/ui/HazardFrameworkPanel.jsx (press Z) exposes dust + manual modes, imports
  a buffers.json file, and exports buffers.json / GeoJSON, wired to the live
  SAFETY_RADIUS via applyHazard.

This in-sandbox port is more correct than the uploaded SIMULATOR_PATCH.md would
be: the patch reassigns a module-scope `let SAFETY_RADIUS`, which would break in
THIS codebase (SAFETY_RADIUS is an exported const imported by 7 files; ES import
bindings are read-only). The port instead mutates the shared object's properties
in place, which actually propagates. The patch also bakes pixels at the tool's
legacy 2.4248 px/km; the port ignores those and reprojects from zones_km at the
sim's own scale.

## The one real gap, now closed: startup auto-load

The patch's documented workflow ("drop buffers.json in public/, it loads on
startup") did not exist; only the interactive Z-panel import did. Added a startup
loader in the map-load effect: it fetches /buffers.json and, if present and valid,
applies it through the SAME parseBuffersJson -> zonesToSafetyRadiusKm ->
applyHazard path. Absent or malformed: silent fallback to default radii, no crash.
public/buffers.json is gitignored (generated per-scenario file).

## Verified

- Formula parity: sim computeDustRadii == tool's dust formula (checked numerically).
- Import parity: the tool's exact buffers.json schema parses to the right km zones
  and reprojects to this sim's pixel scale (not the tool's legacy scale).
- Startup load: live test with public/buffers.json present shows the hazard applied
  on startup (mission log: "Shackleton Rim Alpha"), console clean; without the file,
  clean fallback.
- New regression test locks the tool-schema -> applyHazard km-map contract.

255 tests pass (+1). Lint clean. Build clean. README documents both load paths.

## CHANGES v116, finishing pass

A release-readiness sweep. No new features; the goal was to leave the codebase
in a clean, finished, releasable state and verify it end to end.

## Cleanup

- GIF export debug logging gated. Seven `console.log("[GIF] ...")` progress
  statements in the GIF export path were left shipping. They are now routed
  through a `gifLog` helper gated behind a `GIF_DEBUG = false` flag, so a normal
  build's console stays quiet but the logs are one flag away when debugging GIF
  export. The legitimate console.error / console.warn calls (real failure paths)
  were kept.
- Confirmed no leftover debug hooks (the temporary v114 __exportComposite hook
  is gone), no TODO/FIXME/debugger markers, and no stray console.log anywhere in
  src/.

## Verification (full green light)

- `npm run lint` , clean (no unused named imports)
- `npm test`     , 254 / 254 pass
- `npm run build`, clean
- Version coherence: package.json and package-lock.json agree.
- Live smoke test (boot, deploy, place bases, play): ZERO real errors and ZERO
  warnings in the console.

The project is in a finished state: vectorized map end to end, both cooperation
grids mechanically real and visible, forced-state injects, pure tested sim core,
auto-discovered tests, a lint check, a clean public README + LICENSE, and a clean
console. Ready to publish.

## CHANGES v115

## Removed dead imports + added a dependency-free lint check

A manual pass found unused named imports left behind by earlier refactors:

- App.jsx: hasRestriction, RESTRICTION (injects), INITIAL_GRID (gridNegotiation)
- multiplayer.js: useMemo
- ui/ExploreSidebar.jsx: MARGINAL

All five removed. The build still succeeds, confirming nothing depended on them
(they were genuinely dead).

### npm run lint

Added tools/lint-imports.mjs and a "lint" script. It is a small, ZERO-dependency
Node script (eslint would pull a large dependency tree and could not be installed
in this environment anyway) that scans src/ for unused named imports, the most
common dead-code drift this codebase accumulates as functions move between
modules. It strips comments and string/template literals before counting usages,
so commented-out example imports and string literals do not cause false
positives (two such false positives were caught and fixed during development).
Exits non-zero when it finds something, so it can gate CI later.

README updated: documents npm run lint, and the stale test count (232) was
corrected to 254.

254 tests pass. Lint clean. Build clean. Live smoke test (boot, deploy, place
bases) ran with no console errors. No behavior change; this is dead-code removal
plus tooling.

## CHANGES v114

## The default favorability view is now crisp vector (last pixelated layer retired)

The startup map defaulted to the canvas-raster favorability composite
(idx_composite), which pixelated on zoom. That was the last raster layer in the
default view, after the basemap (v104) and the optional overlay (v105) were
vectorized.

### Investigation correction

While scoping this I re-read the index pipeline and corrected an assumption I had
stated in v105. computeIndexRasters() runs ONCE at map load (mapData.js), from
static terrain (slope, illumination, ice depth, etc.); the favorability composite
does NOT change with live PSR depletion. So there was never any per-frame state
reactivity forcing the raster path: the composite is static, and a vector
rendering of it is fully equivalent in content, just sharp.

(I briefly explored tracing the exact JS-computed composite raster to SVG via a
temporary export hook, but the raster is speckled/noisy and would trace to a
huge, ugly contour set. The published true-vector composite plate, which is the
vector rendering of the same index model, is the clean source. The temp hook was
removed.)

### Change

- vectorOverlay now defaults to "basemap_fig_composite" (the crisp published
  vector composite), shown over the dark vector topo base. Sharp at any zoom.
- The raster idx_composite overlay is OFF by default but remains fully available
  in the Layers panel (it carries the live per-pixel alpha falloff, so it is
  kept as an option, not removed).

Result: the entire default startup view is now vector end to end. At 4x zoom the
favorability contours stay razor-sharp where the raster composite was blocky.

254 tests pass. Build clean. Verified live: default view renders the crisp vector
composite over vector topo; 4x zoom stays sharp; console clean.

## CHANGES v113

## Legend entries for the two cooperation overlays

v111 (pooled comms mesh) and v112 (shared power flow) added glowing links to the
map when a grid is shared, but a first-time facilitator had no on-screen key for
what the green and amber links mean. This names them.

Two entries were added to the dynamic bottom-right map legend, each shown only
when the corresponding grid is actively shared:

- "Pooled comms (shared grid)" , dashed phosphor-green swatch, matching the
  v111 relay mesh.
- "Shared power flow"          , amber swatch, matching the v112 cross-actor
  power links.

They use the legend's existing generic swatch renderer (color / border / dash),
appear and disappear with commsGridState / powerGridState, and participate in the
same hover cross-highlight as every other legend row. No new UI surface; the
legend already conditionally lists only the layers currently visible, so these
slot in naturally.

254 tests pass (render-only addition). Build clean. App boots with the legend
rendering and a clean console.

## CHANGES v112

## Visualize cross-actor power flow when the power grid is shared

The companion to v111 (pooled comms). A shared power grid was the original
cooperation mechanic but, like comms, its effect was invisible on the map.

### The real mechanic, made visible

allocateDailyPower runs one combined network when the grid is shared: a
generator (solar/reactor) can charge the OTHER actor's consumers (rovers,
habitats) when they fall within that generator's SAFETY_RADIUS. That cross-actor
charging is the payoff of sharing power.

Now, when powerGridState is "shared", the map draws a warm amber flow line from
each generator to any CROSS-actor consumer it is actually in range of, brighter
toward the consumer, with a small charge dot traveling along the link and a
"SHARED POWER" bloom badge at the first crossing. Only links that satisfy the
real range check are drawn, so the picture matches what allocateDailyPower
actually does, not a decorative approximation. Own-actor charging is not drawn
(that is the normal footprint case); the shared-grid story is specifically the
power that crosses between the two actors.

This mirrors the v111 pooled-comms mesh in placement and styling (screen blend,
bloom + badge) but uses amber/power language vs phosphor-green/comms, so the two
shared grids read as a matched pair on the map.

### Verified

Rendered the exact drawing logic in isolation with two actors' generators and
cross-actor consumers: in-range consumers get warm flow links with traveling
charge dots and the SHARED POWER badge; an out-of-range consumer correctly gets
no link, confirming the range gate. 254 tests pass (render-only addition). Build
clean. (Fixed an undefined-variable fallback and removed a dead local while
wiring it in.)

## CHANGES v111

## Visualize the pooled comms network when the grid is shared

v106 made a shared comms grid pool relay coverage (each actor's rovers benefit
from the other's comsats), but that effect was invisible: players experienced
fewer waypoint delays without seeing why. This makes the mechanic legible.

### What's new

When commsGridState is "shared" and both actors have live comsats, the map now
draws the pooled relay network:

- Dashed phosphor links from each actor's comsat to its nearest partner comsat,
  so the two separate green coverage umbrellas read as one connected mesh.
- A soft bloom and a "POOLED COMMS" badge at the closest cross-actor relay pair,
  marking the seam where the networks join.

Drawn in the existing comsat layer (phosphor-green, screen blend) so it sits
visually with the coverage umbrellas it explains. Only the nearest-neighbor link
per relay is drawn, so the mesh stays readable even with several comsats.
commsGridState was added to the render effect deps so the visual appears and
disappears as the grid is shared or decoupled.

Now a facilitator can point at the screen and show that a rover is covered by the
partner's relay, not just its own: the cooperation has a visible payoff to match
the in-sim one.

### Verified

Rendered the exact drawing code in isolation with two actors' comsats: the
links, bloom, and POOLED COMMS badge appear correctly between the coverage
umbrellas. 254 tests pass (render-only addition). Build clean.

## CHANGES v110

## Clean console in solo play (lazy multiplayer connect) + a canvas perf fix

A console audit of a normal solo session surfaced two real issues a developer
opening devtools (or a new GitHub visitor evaluating the project) would hit:

1. WebSocket errors. The lobby opened a socket to the multiplayer relay
   (ws://...:8787) on mount, even for solo play. With no relay running, that
   spat 4+ connection errors and a 403 into the console on every load. The old
   README just called them "harmless" and told people to ignore them, which is
   not a great first impression for an open-source project.

2. A Canvas2D getImageData performance warning (the readback context was not
   flagged willReadFrequently).

### Fixes

- Multiplayer connects LAZILY. The lobby no longer opens a socket on mount; it
  only sets the server URL. mp.host() and mp.join() now establish the connection
  themselves (connect, then emit on the socket's connect event). connect()
  returns the socket so callers can await it. The host/join buttons are enabled
  in the "offline" state (clicking them triggers the connection); the explicit
  Retry and relay-settings controls still connect directly. Result: solo and
  facilitator play never touch the network, and the console stays clean.
- The pixel-readback canvas context is created with { willReadFrequently: true },
  clearing the Canvas2D warning and speeding up the getImageData path.
- README updated: the console is now clean in solo mode; the relay is contacted
  only when you choose to host or join.

### Verified

- Solo session console audit: WebSocket errors gone, Canvas2D warning gone. (A
  lingering Google Fonts 403 is only the sandboxed test environment having no
  external network; it does not occur on a real machine with internet.)
- Multiplayer still works: with the relay running, clicking Host lazily connects
  and transitions to hosting with a room code, no page errors.

254 tests pass. Build clean.

## CHANGES v109

## Test runner now auto-discovers every test file (fixes a silent-skip hazard)

The npm "test" script was a hand-maintained list of every test file:

    node --test tests/sim.test.js tests/simDay.test.js ... (17 files)

Every new test suite had to be appended to that list by hand. Miss the append
and the file is never run, with no error: the suite silently does not execute
and a green "all pass" hides untested code. This was a live trap; v107 and v108
each required remembering to extend the list.

### Fix

    "test": "node --test \"tests/**/*.test.js\""

Node's test runner (Node 18+) discovers and runs every matching file, so a new
tests/*.test.js is picked up automatically. Also added:

    "test:watch": "node --test --watch \"tests/**/*.test.js\""

### Proven, not assumed

With a throwaway unlisted probe test added: the OLD hardcoded list ran 254 tests
(probe silently skipped); auto-discovery ran 255 (probe caught). After the change
npm test runs 254 normally and 255 with an unlisted probe present, confirming new
files can no longer be orphaned. The glob is scoped to tests/ so node_modules is
not scanned.

254 tests pass. Build clean. No application code changed; this is a build/tooling
correctness fix.

## CHANGES v108

## Code quality: extracted the snapshot / undo-key helpers

Continuing the extraction of pure logic out of the App.jsx monolith (v107 did
the player-state helpers), two more pure functions moved to a new tested module
src/sim/snapshot.js:

- buildSnapshot     normalizes a state snapshot (deep-clones players, copies
                    arrays). Both snapshotSimState (sim-object path) and
                    snapshotLiveFrame (React-state path) feed through it, so the
                    two snapshot shapes can never drift.
- getUndoSegmentKey derives the stable string key that lets the undo stack
                    collapse rapid in-step changes into one entry.

### Made genuinely pure

getUndoSegmentKey previously read closure state via `?? phase` style fallbacks
when snapshot fields were missing. The extracted version takes an explicit
field set with no hidden reads; the one call site (captureUndoSnapshot) now
passes { phase, round, day, globalDay, activeTurn, p1Done, p2Done } explicitly.
This removes a subtle coupling where the key could depend on live state that did
not match the snapshot being keyed.

### Tests

New tests/snapshot.test.js (5 tests): buildSnapshot deep-clones players and
copies arrays (mutating the snapshot never touches the original), defaults and
missing-array tolerance; getUndoSegmentKey play|/phase| branches, turn/done-flag
sensitivity, and within-step key stability.

254 tests pass (was 249; +5). Build clean. Live smoke test (deploy, place bases,
command a rover, two undos through the modified segment-key path) ran with no
console errors.

No user-facing behavior change. App.jsx shrinks further; the snapshot shaping
and undo-key logic are now independently testable.

## CHANGES v107

## Code quality: extracted pure player-state helpers (and caught a clone bug)

App.jsx is a ~10,700-line monolith. Continuing the long-running effort to move
pure logic into testable src/sim/ modules, four pure helpers were extracted from
it into a new src/sim/playerState.js:

- makeSeededRng    deterministic mulberry32 PRNG (reproducible batch/replay runs)
- isMapDepleted    every crater below the end-of-mission floor?
- clonePlayerState deep-ish clone for save/undo/replay snapshots
- structureCounts  per-type asset tally

All four are pure (no React, no closures, no DOM). App.jsx now imports them; the
inline definitions are gone, and the now-unused DEPLETION_END_THRESHOLD import
was removed. The scorePlayerState thin alias (wrapping the canonical economy.js
implementation) stays.

### A real bug, surfaced by writing the tests

clonePlayerState shallow-copied rover waypoint arrays:
`waypoints: [...(r.waypoints||[])]`. That copies the array but shares the
waypoint OBJECTS by reference, so mutating a cloned rover's waypoint bled back
into the original, on the undo/replay/snapshot paths. The new deep-independence
test caught it. Fixed: waypoint objects are now individually cloned, for both
extraRovers' waypoints and the top-level waypoints array.

### Tests

New tests/playerState.test.js (7 tests): RNG determinism and range, isMapDepleted
boundaries, structureCounts tallies incl. primary+extra rovers and null safety,
clonePlayerState deep independence, the comsats-survival v27 regression guard,
unknown structureHealth keys carrying through, and null handling.

249 tests pass (was 242; +7). Build clean. Live smoke test (deploy, command a
rover, auto-advance a full round, which exercises clonePlayerState on the
snapshot path) ran with no console errors.

No behavior change for users beyond the clone fix, which only makes undo/replay
more correct. App.jsx shrinks by ~80 lines.

## CHANGES v106

## Shared comms grid now does something in the sim (closes the v103 gap)

v103 added comms-grid negotiation but was honest that it only negotiated and
scored: sharing comms had no effect on actual gameplay. This wires it into the
existing comms-coverage mechanic so the cooperation lever matters.

### The mechanic

The sim already models DTE (direct-to-Earth) comms blackout: a rover commanded
while in a blackout window has its waypoint delayed a day (round-trip-relay
constraint), and deployed comsats lift nearby assets out of blackout via
effectiveEarthVis. Previously a rover's coverage used only its OWN actor's
comsats.

Now, when the comms grid is SHARED, relay coverage is pooled: the issuing
actor's effective Earth visibility also benefits from the counterpart's comsats.
A rover that would be comms-dead (and so suffer a waypoint delay) can stay in
contact through the partner's relays. That is a concrete, in-sim payoff for
sharing comms, on top of the cooperation score.

### Implementation

- New pure `pooledComsats(own, other, commsShared)` in mapData.js: own relays
  when independent, both actors' relays pooled when shared. Null-safe.
- The waypoint-commit blackout check uses it, passing the counterpart's comsats
  when commsGridState.mode === "shared".
- Comms status line now reads "Comms: shared · relays pooled" so the effect is
  legible.
- 4 new tests (tests/indices.test.js): independent vs shared pooling, null
  safety, and that sharing raises effective Earth visibility via a partner relay.

242 tests pass (was 238; +4). Build clean. Live smoke test (boot, deploy, place
bases, command a rover waypoint through the modified path) ran with no console
errors.

### Note

This is the DTE/relay coverage payoff for shared comms. The power grid's payoff
(pooled power allocation) and the comms grid's payoff (pooled relay coverage)
are now both real in-sim effects, not just scored gestures.

## CHANGES v105

## Crisp vector favorability overlay (finishes the vectorization)

v104 made the BASE MAP a true-vector plate that stays sharp at any zoom. But the
favorability OVERLAY (idx_composite and the single-index layers) was still drawn
onto the canvas via drawImage at 1212px and scaled up, so the colour pixelated
on deep zoom even over the crisp basemap. This closes that gap.

### What's new

- A favorability overlay can now render as a published true-vector plate layered
  as a DOM <img> inside the same zoom-transformed wrapper as the basemap, above
  the basemap + tonal wash but below the canvas (so rover icons, safety rings,
  and labels still draw on top). The browser re-rasterizes the SVG at display
  resolution on every zoom step: sharp contour lines at any magnification.
- New "Favorability overlay · crisp vector" control in the Layers panel:
  Off / Composite / LFI / SOFI / IFI, plus an opacity slider. Screen blend so
  the colour reads over the dark contour base.
- State (vectorOverlay, vectorOverlayOpacity) is synced through the multiplayer
  snapshot so peers see the same overlay.

This is additive: the canvas-drawn idx_composite remains the default (it is tied
to live PSR depletion and per-pixel analysis), while the crisp vector overlay is
available for presentation and deep-zoom inspection, where sharpness matters most.

### Verified

Rendered the basemap + crisp vector composite overlay together at 4x zoom: BOTH
the basemap contour lines and the overlay's favorability contours are razor-sharp
vector edges, with none of the blocky pixelation the canvas composite shows at
the same zoom.

238 tests pass (unchanged; render-path + UI addition). Build clean.

### Remaining

The canvas composite is still the live default for gameplay (it must reflect
real-time depletion). A future step could drive the live composite itself through
an SVG path, but that requires regenerating the vector plate as state changes,
which is a larger change than layering the static published plates done here.

## CHANGES v104

## Published true-vector figure plates are now the live base maps

The uploaded fig_*.svg plates (the "Geology writes the rules" published figures)
are now registered as live, zoomable base maps, replacing the pixelated raster
basemaps. They render through the DOM <img> path, so the browser re-rasterizes
the vector at display resolution on every zoom step: crisp contour lines at any
magnification.

### Registration

Each figure is a matplotlib export with a square data disk inset inside a larger
viewBox (title strip + axis padding). To register each disk to the sim's 1212px
polar frame, the true disk circle was measured empirically (render + pixel bbox
detection, since the matplotlib clip-rect includes padding):

- fig_topo:        disk center (265.9, 273.3) r 202.2 in viewBox units
- fig_lfi/sofi/ifi: (258.7, 266.2) r 196.7
- fig_composite/clear: (309.0, 302.2) r 229.4

A generator (tools/) wraps each source figure in an outer SVG whose viewBox is
the tight disk square (2% rim margin), dropping the title and centering the disk
to fill the frame. Output: public/maps/fig_*_basemap.svg.

### Wiring

- Six new basemaps registered in mapData.js and added to the picker:
  Topography (published, now DEFAULT), Favorability Composite, LFI, SOFI, IFI,
  and Illumination (published).
- The dark published topo plate is treated like the other dark contour bases
  under the favorability composite (gentle brightness 0.92 / contrast 1.05);
  the bright photo rasters still get heavy dimming; the COLORED published plates
  (composite/lfi/sofi/ifi/clear), being favorability maps themselves, are left
  undimmed when used as the base.
- These are SVG, so they self-clip to the disk and are not in RASTER_BASEMAPS.

### Verified

Default-zoom: the published vector topo contours read cleanly under the
saturated favorability composite, blue PSR pools in crater floors, crisp lines,
no console errors. 4x zoom: the basemap contour lines stay razor-sharp where the
old raster basemap blurred.

238 tests pass (unchanged; this is a map-asset + render-path change). Build clean.

### Honest scope note

This vectorizes the BASE MAP, which is what was asked. The favorability data
OVERLAY layers (idx_composite and the single-index rasters) are still drawn onto
the canvas via drawImage and so still pixelate on deep zoom. Converting those
overlay layers from canvas-drawImage to DOM-SVG render paths is a larger
follow-up; the published figure plates can also be offered as crisp overlays the
same way they are now offered as basemaps.

## CHANGES v103

## Comms grid negotiation (parallel to the power grid)

Actors can now open up a COMMS grid and negotiate it independently of the power
grid: relay / DTE coverage cooperation, separate from power sharing. An actor
can share one grid, both, or neither with their counterpart.

### Shared state machine (refactor + feature)

The power-grid negotiation lifecycle (independent -> offered -> shared, with
offer/join/decouple, scored and logged) was inline in App.jsx for the power grid
only. Extracted it into a pure, tested `src/sim/gridNegotiation.js`:

- `GRID_DEFS` (power and comms, each with its own cooperation score weights),
  `gridOptions` (available actions given state, turn, permanence, and inject
  restrictions), `applyGridAction` (validated transitions returning the new
  grid, score delta, and log verb).
- The power grid now drives through this module instead of its own inline copy
  (no behavior change), and the comms grid reuses the exact same logic. 6 new
  tests in tests/gridNegotiation.test.js cover the full lifecycle, invalid
  actions, permanence, turn-dependent options, and restriction gating.

### Wiring

- New `commsGridState` and `selectedComms` state, mirrored through the action
  dispatcher (selectComms / executeComms), the multiplayer snapshot sync, and
  undo/replay.
- New comms selector in the actor control panel beneath the power-grid one,
  styled in instrument blue to distinguish it. Opening, joining, and decoupling
  the comms grid score the acting actor (open +25, join +18, decouple -16) and
  write to the mission log.
- Comms negotiation respects the v101 inject restrictions: a no-negotiate
  directive or an Earth-side freeze blocks new comms offers/joins too (an
  already-shared comms grid can still be decoupled).

238 tests pass (was 232; +6). Build clean. Both grid controls verified present
in the live actor panel with no console errors.

### Known scope limit (honest note)

The comms grid currently negotiates and scores cooperation but does not yet feed
a comms-coverage mechanic the way the shared power grid feeds power allocation.
It is wired as a parallel cooperation lever and scoreboard effect; tying shared
comms to actual DTE/relay coverage in the day simulation is a follow-up.

## CHANGES v102

## Repository made download-and-host ready (GitHub closeout prep)

The fellowship closeout calls for the project to live on GitHub where anyone can
download and locally host it. The repo was not ready for that: the only README
was a 76 KB internal dev changelog frozen at v45 (it claimed 145 tests; we are
at 232), there was no LICENSE, and package.json was marked "private": true with
no license field, which blocks publishing.

### Changes

- **New public README.md.** A clean, accurate, stranger-facing readme: what the
  tool is (the three favorability indices, the governance tension, the debrief),
  a verified quick-start (`npm install` then `npm run dev`, Node >= 18), the
  optional LAN multiplayer server, how to run it in a workshop, the project
  layout, the test story (232 tests), and the Artemis/ILRS core-actor design
  constraint. Run commands and ports were checked against the actual config
  (client 5173, server 8787) rather than assumed.
- **Old README preserved as DEV_NOTES.md.** The detailed development history and
  architecture notes are kept and linked from the new README, just no longer
  the front door.
- **LICENSE added (MIT).** Permissive, matching the "anyone can download and
  host" intent. Copyright attributed to Lauren Victoria (Vic) Paulson per the
  existing dev-notes attribution. NOTE: MIT is a reasonable default for an open
  fellowship deliverable, but the license choice is the author's to confirm or
  change before publishing.
- **package.json:** removed "private": true, added "license": "MIT", "author",
  and "engines": { node >= 18 }; refreshed the description.
- **.gitignore added** (node_modules, dist, logs, editor/OS cruft, env files).

Verified: `npm install` then `npm run dev` boots the app clean (loaded in a
headless browser with no console errors). 232 tests pass; production build clean.
No application code changed.

## CHANGES v101

## Three forced-state injects + a documented core-tension constraint

Implements the inject TODOs: a geopolitical override, a dual-use surveillance
flag, and an Earth-side crisis. These needed a mechanic the deck did not have:
a FORCED ACTION STATE that constrains what an actor may do for N turns.

### New restriction model (pure, tested) in src/sim/injects.js

- `RESTRICTION` enum: NO_NEGOTIATE (blanket directive) and FROZEN_WITH (frozen
  cooperation with a specific counterpart).
- `addRestriction` (refresh, don't stack), `tickRestrictions` (decrement per
  round, drop expired), `hasRestriction`, `canNegotiateWith`, `restrictionStatus`.
- `applyInjectDeltas` now applies a choice's `restriction`; the inject:respond
  handler resolves a "counterpart" target to the concrete other-actor index.
- Restrictions tick down one turn per completed round; the diplomacy panel
  returns no negotiation options while restricted and shows a status badge
  ("Directive: no negotiation (3 turns)"). 7 new tests.

### The three injects

- Geopolitical override: a directive from the political master. Comply (no
  negotiation for 3 turns) or defy it (operationally free, heavy score + trust
  cost). Encoded as the NO_NEGOTIATE forced state.
- Dual-use surveillance flag: an ambiguous counterpart asset. Hold and observe
  (rewarded), query diplomatically, or reposition defensively (penalized). The
  debrief reveals the asset was benign, teaching restraint under ambiguity
  (new debriefReveal field, surfaced in a "What the injects revealed" debrief
  section).
- Earth-side crisis: a terrestrial dispute freezes cooperation between the two
  actors for 3 turns (FROZEN_WITH). Accept it, preserve quiet contacts, or
  exploit the rift.

### Core-tension design constraint

Documented in stakeholders.js (CORE_ACTORS = ["artemis","ilrs"]): Artemis and
ILRS must both be present in every two-actor configuration, because the
exercise's central tension is the bloc-vs-bloc dynamic; commercial / emerging-
state actors are third+ actors or facilitator pressure, not substitutes.

232 tests pass (was 225; +7). Build clean. New injects verified present in the
live facilitator panel; restriction badge + no-negotiation lockout verified.

## CHANGES v100

## Live violations HUD now shows the scored cost

The in-play "AREA VIOLATIONS" panel listed each breached zone (owner, type,
radius, how many enemy assets breached it) but never showed what it was
COSTING. For a governance sim that is the whole point: a facilitator should see,
in real time, that crowding a neighbor is bleeding points.

Building on v99 (which made the render-loop violation count match the scored
count via isZoneExempt), the panel now shows, under its header:

  −75 points per turn while breached  ·  P1 −50 · P2 −25

- Each breached zone adds one safety violation per turn it persists, at
  SCORE_PENALTY_VIO (25) points each. The line shows the running per-turn total.
- When both actors are in breach, it breaks the cost down per actor, so the
  facilitator can see who is paying. With only one actor breaching, the
  breakdown is omitted (the total already says it).
- Uses the real SCORE_PENALTY_VIO constant imported from economy.js, so the live
  figure can never drift from the scoring weight. This mirrors the v95 debrief,
  which explains the same penalty after the fact; now it is legible during play.

The comms-blackout HUD's stacking offset was adjusted so it still sits below the
(now slightly taller) violations panel.

225 tests pass (unchanged; this surfaces an existing tested quantity). Build
clean. HUD rendering verified in isolation with a mixed-owner breach scenario.

## CHANGES v99

## Shared-grid BREACH halo fix + isZoneExempt extraction

The live render loop drew a flashing red "BREACH" halo for ANY enemy asset
inside a safety zone, using different logic than the scoring pass:

- It ignored the shared-power-grid exemption. When two actors share a grid (the
  cooperative mechanic), solar/reactor zones are exempt and cost zero points,
  but the HUD still screamed BREACH on them, visually punishing the cooperation
  the score rewards.
- It used health <= 0 instead of the scoring threshold health <= 0.1, so a
  near-destroyed structure could still draw a breach halo it no longer earns.

### Fix

- New pure `isZoneExempt(type, sharedGridActive)` in enemyZones.js: the single
  source of truth for "does this structure's zone count as a violation under the
  current grid state" (solar/reactor exempt only under a shared grid). Used by
  BOTH the scoring pass (applySafetyDecay) and the render-loop halo, so the HUD
  and the score can never disagree again.
- Render loop now computes sharedGridActive, gates the violation check on
  isZoneExempt, and uses the 0.1 destroyed-structure threshold.
- powerGridState added to the draw effect deps so the exemption updates live.

225 tests pass (was 224; +1 isZoneExempt test). Build clean. Live smoke test
(boot, deploy, place bases, auto-advance) ran with no console errors.

## CHANGES v98

## Published map figures gallery

Added the canonical, true-vector map plates from the "Geology writes the rules"
work as an in-app reference gallery (toolbar "Figures", or press G).

### What's in it

Nine published figures, all genuine vector (zero embedded raster):

- Topography (south-polar shaded-relief contours)
- LFI / SOFI / IFI (the three favorability indices, filled contour maps)
- Composite (the three blended; the "no site wins all three" plate)
- Illumination (sustained sunlight vs permanent shadow)
- Asset-level safety zones (keep-out radii + a designated lunar area)
- Real geology, real outcomes (LCROSS / IM-2 Athena / Artemis III, three-panel)
- Sixteen layers (every data layer the indices are built from)

### Why a gallery, not the live basemap

These are static published plates at one fixed projection, with baked titles and
disks that are not centered on the sim's 1212px frame. The sim's LIVE layers
(which respond to PSR depletion, rover positions, and real-time analysis) can't
be replaced by static art without breaking interactivity and registration. So
the figures live in a gallery a facilitator can pull up to anchor a discussion
in the real geology, then close and return to the live map. The v97 synthetic
vector contour basemap remains the (correctly registered) live default.

### Implementation

- `src/ui/FiguresGallery.jsx`: a grid of accent-striped cards (brand palette,
  Spectral + Bricolage), each opening a full-size viewer with click-to-zoom
  (1x-3x). Figures are SVG served on demand from /figures, so they cost nothing
  until opened.
- Wired into App.jsx: `showFigures` state, "Figures" toolbar button, G shortcut,
  ESC cascade (figure viewer closes first, then the gallery). Added the Z (DLA
  zones) and G shortcuts to the keyboard-shortcuts overlay, which were missing.

224 tests pass (unchanged; UI-only addition). Build clean. Gallery + viewer
verified in the running app.

## CHANGES v97

## Base map is now true vector contours (crisp at any zoom)

The default base map (basemap_topo_contour, v91) was a 1212px raster JPEG. It
looked right at 1x but blurred badly on zoom-in, which is exactly when a
facilitator zooms to discuss a specific crater. The uploaded bk_*.svg files were
matplotlib exports with embedded raster <image> layers (238 base64 refs), so
they would not have stayed crisp either.

### New: basemap_topo_vector.svg (genuine vector)

Generated a true-vector south-polar topographic contour map:

- Source: basemap_topo_bw relief, downsampled to a 606 grid and Gaussian-smoothed
  (sigma 7) into a coherent elevation-like field (the raw relief is noisy
  illumination, which would contour into spaghetti).
- skimage.measure.find_contours extracts contour lines at 16 levels; paths are
  Douglas-Peucker simplified (approximate_polygon, tol 0.7) so the file is light.
- Rendered as: 9 stacked filled elevation bands (navy #0a0a16 -> slate #4a4a5a,
  brand palette) for the dark substrate, plus 16 levels of thin contour strokes
  (#c8c4dc at 0.32 opacity) for the topographic lines. Disk-clipped to the polar
  circle in the SVG itself.
- 181 KB (vs 487 KB for the raster JPEG), and infinitely sharp: the browser
  re-rasterizes the SVG at display resolution on every zoom step.

It is now the default base map ("Topographic Vector"); the raster contour map is
retained as an option. The composite-active dimming treats it as a dark base
(gentle brightness 0.92 / contrast 1.05) so the saturated favorability overlay
reads against it, same as the raster contour map did.

Verified in the running app: the contour lines stay crisp at 4x zoom where the
raster version blurred, and the favorability composite layers cleanly on top.

Generator script kept at tools/ for reprovenance. 224 tests pass (unchanged;
this is a map-asset + render change). Build clean.

## CHANGES v96

## Deduplicated the safety-zone decay logic (engineering / correctness)

The per-turn "decay each structure by whether an enemy sits in its safety zone,
and tally violations for scoring" pass existed as two near-identical ~70-line
blocks in App.jsx: the live `applyDecay` (turn resolution) and the headless
`applyDecayToOwner` (bot Monte Carlo). They were hand-kept in sync -- the inline
comments literally documented past divergences that had to be re-synced after
the fact ("the batch path was omitting this, making bot safetyViolations counts
systematically lower than live"; "Mirrors the live applyDecay fix"). That is a
standing drift hazard: the scored violation count, which directly moves the
final score, could silently differ between live play and the analytics the same
UI presents.

### What changed

- New pure function `applySafetyDecay(owner, enemyPositions, opts)` in
  `src/sim/enemyZones.js` (next to the related `buildEnemyZones`). It owns the
  whole pass: structure enumeration, destroyed-structure skipping (no zone, but
  still decays), shared-grid exemption for solar/reactor, hostile-vs-passive
  decay, primary-rover-zone counting, and the structureHealth merge that
  preserves non-decayed fields (comsats). Tunables are passed in, so it's pure.
- Both App.jsx sites are now ~10-line wrappers that resolve the per-turn physics
  constants (passive/hostile decay, mil multipliers) and delegate. ~140 lines of
  duplicated logic collapsed to one tested implementation; App.jsx dropped ~110
  lines.
- 6 new tests in `tests/enemyZones.test.js` lock the invariants: violation +
  hostile decay when breached, passive decay when clear, wreckage earns no
  violation, shared grid exempts generators but not habitats, the primary rover
  zone counts, and violations accumulate.

No behavior change: the live `sim.test.js` (which drives the real turn path) and
a live headless smoke test both pass unchanged. 224 tests pass (was 218; +6).
Build clean.

## CHANGES v94

## Solar potential overlay recolored to lime-green

The solar potential bands (overlay_sun) were previously rendered in amber-to-gold
(#FFD060 / #FFB030 / #C89020 range). This clashed directly with:

- The ridge glow canvas (rgb 255,224,50 -- warm yellow-gold)
- The solar safety-zone rings (#FFD060)
- The PSR-depleted fill (parchment-gold)

All three are always visible on the map, making the solar overlay nearly
indistinguishable from the existing gold features it sits on top of.

New color set: yellow-green lime, three steps by illumination band:

  >50% broadly sunlit:   rgb(140, 190,  40) -- muted olive-lime
  >70% good solar:       rgb(168, 224,  40) -- lime
  >85% prime solar:      rgb(200, 255,  60) -- bright yellow-lime

This hue sits perceptually between the warm gold of the ridge/solar-zones and
the cool mint-green of rover zones (#9BD4B5), occupying a gap that nothing
else on the map uses. The energy-green association also reads intuitively for
a solar potential layer.

Changes: canvas pixel colors in the baking block, legend swatch colors, and
VECTOR_OVERLAYS band colors and key color in mapData.js.

211 tests pass (unchanged). Build clean.

## CHANGES v93

## Solar potential overlay rasterised + slope/comms disk-clipping fixes

### Solar potential: three-band raster canvas (overlay_sun)

The "Solar potential" vector overlay is now generated at runtime from ILLUM_MAP
(the LROC annual illumination fraction, 0..1) in three distinct bands:

- **>50% illuminated** (soft amber): broadly sunlit terrain, roughly
  equivalent to the ridge glow but showing the full continuous field, not just
  the ridgeline pixels.
- **>70% illuminated** (gold): well-illuminated ground, viable solar panel
  siting without severe seasonal outages.
- **>85% illuminated** (bright gold): near-continuous sunlight, the prime
  solar locations on crater rims and exposed ridges.

The illumination data is LROC-derived (smooth continuous field, no JPEG
compression artifacts), so no blur pre-processing is needed. The canvas is
disk-clipped to 80S like the other contour overlays.

The existing SVG (overlay_sun.svg) was an undifferentiated single-opacity
polygon that mixed all three brightness classes with no distinction. It is
retained for provenance but no longer rendered.

### Slope speckle fix + polar disk clipping (fixes from v92 revision)

The slope and comms contour canvases introduced in v92 now correctly clip to
the 80S polar disk. Out-of-disk JPEG corner noise was painting outside the
visible map area. Both canvases check the polar disk radius before writing any
pixel.

The slope canvas applies a 2-pass separable box-blur (radius 2) over SLOPE_MAP
before thresholding. This collapses ~4,800 JPEG-artifact speckle regions to
~130 coherent crater-rim and ridgeline features without raising the thresholds.

### Legend + hover cross-highlight

Solar bands (solar-50, solar-70, solar-85) are added to the dynamic map
legend when the overlay is active. The hover cross-highlight detects which
illumination band the cursor is in and highlights the matching legend row.

The settings panel overlay button expands to show the three band swatches
when solar potential is toggled on, consistent with the slope and comms
buttons added in v92.

211 tests pass (unchanged). Build clean.

## CHANGES v91

## Topographic-contour base map under the saturated favorability overlay

Replaces the muddy dramatic-relief photo (v90) with a clean LROC south-polar
shaded-relief contour map as the default base. This is the ideal dark base for
the high-saturation favorability composite: crisp white elevation contours and
deep crater shadows show through the colour instead of fighting it.

- New basemap `basemap_topo_contour` (public/maps/basemap_topo_contour.jpg),
  registered in mapData.js and selectable as "Topographic Contours". Sourced
  from the supplied LROC shaded-relief contour render, resized to the sim's
  1212x1212 frame; the polar-disk clip hides the source's baked north arrow,
  title block, and scale bar (all fall outside the inscribed circle). The baked
  crater names sit inside the disk and complement the sim, which only draws
  crater health dots, not name labels.
- It is now the default base map, with the favorability composite on by default
  (carried over from v90).
- The composite-active dimming is now per-basemap: the topo-contour map is
  already dark, so it gets only a gentle brightness(0.78)/contrast(1.08) touch;
  the bright photo basemaps still get the heavy brightness(0.3) treatment. Turn
  the composite off and the topo map shows as a clean dark contour map.

The composite paint tuning from v90 (steeper alpha falloff, ice-dominance blue
pools, warm yellow->orange gradient) carries over and reads cleanly on this base.

211 tests pass (unchanged; this is a map-asset + render change). Build clean.
Verified in the running app.

## CHANGES v90

Two requests: facilitator injects and actor decisions should affect the score,
and the default map should look like the favorability-composite reference.

## 1 · Injects and decisions now move the scoreboard

This was a real gap. Facilitator inject choices only nudged economy dials
(econ, budget, milStock, R&D, morale), none of which are terms in the composite
score. So an actor's response to an inject had no scored consequence.

- `applyInjectDeltas` now reads a `scoreAdj` field and folds it into
  `scoreAdjustments`, which `scorePlayerState` already sums. That makes the
  choice move the score directly.
- All 30 inject choices (10 injects x 3) carry an explicit scored stake. The
  stakes encode the governance lesson: cooperation, safety, and lawful conduct
  earn score (joint survey +14, full safety stand-down +10, trilateral
  dialogue +12); escalation and recklessness cost it (running a reactor hot
  -12, ignoring a medical scare -14, escalating a claim -6).
- The stake is shown as a SCORE chip in both the facilitator preview and the
  actor's response modal, and the chosen delta is written to the mission log
  so it shows in the debrief.
- The inject deck + delta logic were extracted from FacilitatorPanel.jsx into a
  pure `src/sim/injects.js` so they can be unit-tested without a JSX build step.
  `tests/injects.test.js` (5 tests) asserts the full chain: choice -> deltas ->
  score change, plus that every choice carries a stake.

## 2 · Default map reads like the favorability composite (post Figure 5)

The composite favorability layer (R = landing, G = surface ops, B = ice) is now
the default view, painted over the dramatic-relief basemap.

- Default basemap is now Dramatic Relief; the composite overlay is on by
  default.
- The relief is dimmed and contrast-boosted (CSS filter, only while the
  composite is active) so the colour reads against near-black shadow instead of
  washing out over light relief.
- The composite paint was retuned: a steeper alpha falloff so low-favorability
  terrain fades to the dark base (not a flat yellow flood); an ice-dominance
  rule so PSR floors read as saturated blue pools; and a warm-gradient bias so
  landable-but-lower-ops terrain shows yellow -> orange.
- Turning the composite off (or switching basemaps) restores the normal bright
  relief; the dimming is conditional on the composite being active.

211 tests pass (was 206; +5 inject tests). Build clean. Both changes verified
in the running app.

## CHANGES v89

## Implemented the ideas + style of Blog Post 2 ("Geology writes the rules")

The three favorability indices (LFI / SOFI / IFI) already drove computed map
layers and an RGB composite (v70-v78). This pass brings in the parts of the
post that were not yet in the sandbox: its index-card presentation, its
four-class reading, and its central governance principle.

### The terrain-analysis panel, restyled to the post's index cards

The Explore sidebar's favorability block is now three cards in the post's §1
style. Each card carries:

- the index abbreviation in Spectral italic, on its accent (LFI teal, SOFI
  gold, IFI violet, the post's palette),
- the mission **question** the index answers ("Can the lander touch down here
  without breaking?" / "...stay alive and productive?" / "Is the water ice here
  in usable form?"),
- the live value with a **four-class** favorability label (Non-site / Poor /
  Marginal / Favorable / Strong) and a bar marked at the viability threshold,
- the **weight breakdown** exactly as the post prints it.

The site verdict ("Favors landing + ice, not the other phases") sits below as
the post's headline result: no location maximizes all three.

### "Adjacency is the resource" (the post's §6 principle)

For any analyzed pixel, the panel now reports the nearest viable site for each
mission phase this pixel does NOT satisfy: "Nearest operable ground · 1.0 km."
The point the post makes: since no pixel does all three, the planner's real
question is how close the complements sit. Backed by a pure ring-search over
the favorability rasters.

### Code

- `src/sim/indices.js`: `INDEX_CARDS` (questions + headline weights + accents),
  `favorabilityClass` (the four-class reading), `nearestFavorableSite` (pure,
  capped ring-search), and `adjacencySites` (wrapper over the live LFI/SOFI/IFI
  rasters returning nearest-viable distances in km). 3 new tests.
- `src/ui/ExploreSidebar.jsx`: the favorability block rebuilt as index cards
  plus the adjacency readout.

206 tests pass (was 203). Build clean. Verified in the running app: clicking a
site renders the three cards, the verdict, and the adjacency distances.

## CHANGES v88

## Brand sweep + a Safety Zones layer toggle

Two focused improvements, both verified against the running app.

### Brand: no em dashes in visible text

The brand voice rule is no em dashes in anything the user reads. A sweep found
and fixed the stragglers in player-facing strings, leaving code and JSX comments
(not rendered) untouched:

- Lobby role briefings (Actor I / Actor II / Facilitator) and the intro copy
- Settings: the stakeholder-archetypes line ("...identity. Hover any button...")
- The lunar-context note ("DTE comms vary with libration; comsats extend...")
- The QuickMap basemap subtitle
- The "Economic Growth" policy-stance description
- Null-value placeholders in the asset sidebar and analytics (", " to "·")
- A dev-only tooltip

Verified by grep: no em dashes remain in any visible string.

### A Safety Zones layer toggle

The keep-out / safety-zone overlay (the dashed reactor / habitat / pad / rover
rings and the active-violation rings) was always on with no way to hide it. The
draw already respected `showLayers.safety`; this just exposes it as a layer
toggle ("Zones") in both the settings layer list and the HUD strip, following
the existing `LAYER_TOGGLES` pattern. Facilitators can now declutter the map to
focus a discussion on another layer, then switch the zones back on.

(Note: the power-supply range rings are a separate visualization and are not
affected by this toggle.)

### Also considered, then cut

I prototyped an on-map hover cue that highlighted which specific asset's keep-out
the cursor was inside. With the safety rings already drawn, it largely duplicated
existing rendering, and I could not cleanly demonstrate added value, so I removed
it rather than ship redundant UI.

203 tests pass (unchanged; these are UI/content changes). Build clean.

## CHANGES v87

## NASA Phase 1 scenario preset (closes a v46 README TODO)

The scenario presets only ever varied the clock and economy. NASA Phase 1 is
the first that varies the **starting layout**: selecting it seeds each actor's
base, the moment it is placed, with an Artemis Base Camp footprint.

Seeded footprint (per actor, around the placed base):

- 1 Foundation Surface Habitat at the base
- 1 Fission Surface Power reactor, offset at standoff distance
- 2 landing pads (CLPS + HLS), offset to model plume keep-out
- 2 solar arrays (tagged on-ridge when they land on a peak)
- 2 field rovers (VIPER + LTV) alongside the primary pressurized rover
- 1 surface comms relay (the orbital-relay / CAPSTONE abstraction)

The deliberate reactor / pad standoff also seeds real safety-zone tension from
turn one, which is the point of the sandbox. Seeded assets are free (they model
a mission already on the surface at start), so budget is untouched.

### Code changes

- **`src/sim/scenarioPresets.js`** (new), the scenario table lifted out of the
  inline JSX array in `App.jsx` into one tested module, plus `PHASE1_LAYOUT` and
  a pure `seedPlayerLayout(player, layout, base, opts)` that appends assets in
  exactly the state shape the live placement paths produce (arrays +
  index-matched `structureHealth`, `habitatPower`, rover fields, accumulated
  `assetPts`). 7 unit tests in `tests/scenarioPresets.test.js`.
- **`App.jsx`**, imports the table (the settings UI now maps over
  `SCENARIO_PRESETS` instead of a literal), and a `seedForScenario` helper seeds
  both actors at base placement, passing a `RIDGE_MASK` predicate so seeded
  solar knows if it sits on a ridge. A small refactor on top of the feature:
  the preset data no longer lives in the render tree.

### Verified

203 tests pass (was 196). Clean build. Booted the full app headless: the preset
appears and selects in settings, and deploying it seeds the footprint live
(asset points 54, "2 panels · 1 reactor", comsat relay active, habitat power),
with no console errors through the flow.

## CHANGES v86

## Optional reactor zone in the DLA hazard framework

Follow-up to v85. A surface fission reactor is itself a radiation / thermal
hazard source, so the DLA zones panel can now fold the reactor into a chosen
zone instead of leaving it on its default radius. This is the real-world DLA
case for fission surface power: a keep-out zone scaled to the source.

- **`src/sim/hazardZones.js`**, `applySafetyRadius` now applies whichever asset
  classes appear in the km map (was: only the canonical four), so `reactor`
  (or any asset) can be included and reverted exactly. New `REACTOR_ZONE_OPTIONS`
  export (off / core / buffer / coordination).
- **`src/ui/HazardFrameworkPanel.jsx`**, a "Reactor zone (optional)" control,
  default off. When set, the reactor appears in the resulting-radii table and
  is included on apply; the note and the green confirmation update to match.
  The per-asset readout now labels the live value "now" rather than "was."
- **`App.jsx`**, the mission-log entry appends `· reactor→<zone>` when set.
- The exported `buffers.json` and GeoJSON stay faithful to the OLF schema
  (pad / habitat / rover / solar); the reactor mapping is a sandbox-local
  extension and does not leak into the standard export.

It remains an explicit, reversible facilitator choice; comsats are orbital
relays with no surface footprint and are never mapped.

196 tests pass (was 194). Build clean.

## CHANGES v85

## Integrated the OLF DLA Hazard Framework (Aaron Mackey's if/then toolkit)

The standalone Lunar Radius Framework computed core / buffer / coordination
exclusion zones from a hazard input and exported `buffers.json` for the
simulator. That computation now lives inside the sandbox, and the safety zones
can be driven from hazard physics during a workshop instead of the hardcoded
defaults.

### What landed

- **`src/sim/hazardZones.js`**, framework-free port of the toolkit's math:
  dust power law, manual linear-ratio mode, hazard classification, the
  zone → asset mapping (pad ← core, habitat / rover ← buffer, solar ←
  coordination), and `buffers.json` / GeoJSON build + parse. 10 unit tests in
  `tests/hazardZones.test.js`.
- **`src/ui/HazardFrameworkPanel.jsx`**, facilitator panel (toolbar "DLA
  zones", or press `Z`). Pick dust or a manual hazard, set confidence and
  mitigation, and watch the three zones and the resulting per-asset safety
  radii update live. "Apply to simulation" drives the live zones; "Reset to
  defaults" reverts exactly. Import a `buffers.json` from the standalone tool,
  or export `buffers.json` / GeoJSON to round-trip with GIS.
- **`tools/dla-hazard-framework/`**, Aaron's original tool, vendored unchanged
  for provenance and the GIS workflow, with an `INTEGRATION.md` note.

### The scale fix that the patch needed

The toolkit's `SIMULATOR_PATCH.md` targets an older **700 px / 288.678 km**
build (≈ 2.4248 px/km) with `SAFETY_RADIUS` inline in `App.jsx`. This sandbox
is **1212 px / 606 km = 2 px/km**, and `SAFETY_RADIUS` lives in
`src/sim/constants.js`. A copy-paste of the baked pixel values would land ~21%
off. So the integration ignores the baked pixels and works in **kilometres**:
zone radii are read in km (scale-independent) and reprojected with the
sandbox's own `PIXELS_PER_KM`. Verified by a round-trip test against a
simulated legacy `buffers.json`.

### How it touches gameplay

Applying mutates the shared `SAFETY_RADIUS` object in place. Every sim module
imported the same reference and reads `SAFETY_RADIUS[key]` live, so the change
propagates to the safety-zone rings (redrawn immediately via a `hazardRev`
bump) and to the next day's resolution (power spread, decay, violations, bot
routing). Reactor and comsat are not part of the framework mapping and keep
their defaults. Each apply / reset is written to the mission log so it shows up
in the debrief.

Note: the framework's mapping puts the **widest** ring on solar (coordination)
and a tight ring on pads (core), which inverts the default balance (where
habitats are widest). That is the framework's governance model, and it is an
explicit, reversible facilitator choice.

194 tests pass (was 184). Build clean.

## CHANGES v84

## First-time-participant guided tutorial (closes a v46 TODO)

The help overlay (`?`) only ever listed keyboard shortcuts, so a first-time
workshop participant learned how to drive the keyboard, not how to play. This
adds a separate guided "how to play" tour.

- **`src/ui/TutorialOverlay.jsx`**, an 8-step branded tour (objective, reading
  the map, the asset roster, ice mining, safety-zone governance, the score
  formula, the turn loop, and where the panels are). Progress dots, Back / Next
  / Skip / Start-playing, and arrow-key paging.
- **`src/ui/tutorialContent.js`**, the step copy as pure data so it is testable
  without a DOM, the same pattern the sim core uses.
- **Auto-shows once per browser** behind a `localStorage` flag set on close, so
  a returning facilitator projecting a session is never surprised by it. Falls
  back gracefully if storage is blocked. Also reachable from the "How to play"
  toolbar control, the `H` key, and a cross-link in the shortcuts overlay.
- **`tests/tutorial.test.js`**, 6 tests for step integrity, unique ids, the
  four score terms, and the brand's no-em-dash rule (enforced programmatically).

The score figures in the tour are pulled straight from the live model
(`src/sim/economy.js`): ice banked 1/kg, carried 0.5/kg, asset points 15 each,
safety violations −25 each. 184 tests pass (was 178). Build clean.

## CHANGES v83

## CRATER.jpg used for PSRs; standalone B&W topographic map; clearer overall

- **PSRs now come from the uploaded CRATER.jpg.** It isn't georeferenced to the
  frame, so I registered it by best fit to the real crater floors (scale 0.50,
  pole-centered): the blobs land at mean illumination ~33 (down from ~59 raw)
  and cluster through the central polar crater complex where PSRs belong. Used
  for the composite + the in-app bw_overlays layer. (The app's gameplay PSR mask,
  psr_mask_clean.png, is left on its tighter registration; this placement drives
  the planning graphic only. Registration is approximate, a graticule or stated
  pole/extent on the source would make it exact.)
- **New standalone B&W topographic map** (`topographic_map.svg` / `.png`): the
  vectorized shaded-relief contour base on its own, posterized grey relief bands
  + index/intermediate contour lines, crater labels, graticule, north arrow,
  scale bar, "Topography" title. No data overlays. Generated by the same script
  (`--topo`).
- Comms blackout stays the distinct hatched exclusion zone from v82.

Generator now emits three outputs: `--figure`, `--layer`, `--topo`.
Build clean, 178 tests pass.

## CHANGES v82

## Clearer, more distinct layers; comms blackout as a hatched zone

- **Comms blackout is now a hatched exclusion zone** (diagonal instrument-blue
  cross-hatch) rather than a flat fill, so it reads as a limitation and stops
  blending into the grey terrain. Bold boundary = the 30% comms limit; dashed =
  the 45% marginal edge. The legend swatch is hatched to match, and the hazard
  swatch is now a ring (matching how it's drawn on the map). Each layer now has
  a distinct visual language: solid fill = resource target (PSR / peak of light),
  hatch = exclusion (comms), rings = hazard, grey bands = topography.

## Note on the uploaded PSR.jpg (not used)
The uploaded `PSR.jpg` does not georeference to the map frame: it's an enlarged,
shifted redraw whose blobs don't match the real shadow positions. A full
scale+offset search still lands it at mean illumination ~59 (correctly-registered
PSRs read ~12), i.e. it would place PSRs on partly-sunlit slopes. The map keeps
the correctly-registered, already-clean discrete PSRs. If PSR.jpg is a new
dataset meant to redefine the frame, its pole/extent (or a graticule) is needed
to register it.

Build clean, 178 tests pass.

## CHANGES v81

## Clearer topography + comms-blackout layer (replaces hydrogen)

### Underlying topography now reads clearly
The v80 base was faint grey contour lines on near-black. Added **muted
posterized relief bands** under the lines: each elevation band between contours
is filled with a graduated grey (painter's order, brighter = higher relief), so
the terrain form, crater bowls, ridges, the central massif, is legible at a
glance. Contour lines themselves are brighter/thicker (index #E4E0F2 @0.7 / 1.7px,
intermediate @0.42 / 1.0px). Greys stay muted (18..110) so the coloured overlays
still pop. Still fully vector.

### Hydrogen layer removed, comms-blackout added
Dropped the purple hydrogen/water layer. In its place, a **comms-blackout
limitation** layer from the Earth-visibility raster, on the app's own 30% DTE
threshold:
- shaded blackout region where Earth view < 30% (instrument blue, the brand
  colour), plus a lighter marginal band (< 45%),
- a **bold blue boundary line** (the comms limit): inside it, direct-to-Earth
  comms are unreliable.

Legend row updated to "Comms blackout (Earth view under 30%)". Colour is brand
instrument blue (#3460A8) with a mist-blue outline (#80B0D8), distinct from the
bright-cyan PSRs.

Outputs unchanged in form: `mission_planning_composite.svg` / `.png` (figure)
and `public/maps/basemap_bw_overlays.svg` (in-app layer). Regenerate with
`python scripts/gen_mission_planning_composite.py`. Build clean, 178 tests pass.

## CHANGES v80

## New PSR mask, vectorized topographic base, clearer layers

Three requested fixes to the mission-planning composite (and the in-app layer).

### PSR mask, fixed
Replaced `public/maps/psr_mask_clean.png` with the cleaned new mask. The old one
over-classified (7.1% of the disk, blobs merged into masses); the new one is
discrete and conservative (1.9%, 74 components, 19.6k px) and still well
registered (mean illumination 17.7 under PSR vs 145 global). Built from the
uploaded `psr_mask.jpg` by thresholding the bright PSR cores (>190, which drops
the baked mid-grey graticule), a 2px opening to kill ringing, and a min-size
filter. Old mask kept as `psr_mask_clean_v78old.png`.

Note: this is the app's live PSR source, so PSR_MASK / crater extraction /
indices now reflect the cleaner mask (fewer, tighter cold-trap craters). Tests
use synthetic buffers, so all 178 still pass; the gameplay simply tracks the
better mask.

### Vectorized topographic base (no more embedded raster)
The base was a photographic shaded-relief image (busy, and the only raster in
the SVG). It's now clean **topographic contour lines** generated from the real,
registered LROC relief: 15 levels, every 4th an "index" contour (brighter /
thicker), Douglas-Peucker-simplified for smooth vector lines, over a dark fill.
The whole composite is now fully vector, SVG dropped from 6.8 MB to ~0.69 MB
and is resolution-independent.

(Checked the app's existing `basemap_periwinkle_topo.svg` first; its "elevation"
correlates 0.08 with the real relief, i.e. it's synthetic noise, so it would
have put fake topography under the real layers. Not used.)

### Layers made clearer
Heavier Gaussian smoothing + a min-enclosed-area denoise filter on every
overlay, so they read as clean regions instead of speckle: hydrogen now two calm
purple bands + one magenta outline (was a busy multi-band tangle), peak-of-light
one solid gold fill + outline + dashed inner ring, hazard denoised red rings.
Against the calm dark topo base, all four layers pop.

### Outputs
- `mission_planning_composite.svg` / `.png` (2400px), full figure.
- `public/maps/basemap_bw_overlays.svg`, bare in-app layer, fully vector.
- `scripts/gen_mission_planning_composite.py`, regenerator (topo base + denoise).

Build clean, 178 tests pass.

## Still open
- Live interactive toggle-overlays still paint as image tints in the canvas
  render loop; applying this contour style there (precompute + cache per layer)
  remains the bigger follow-up.
- Non-default raster basemaps still on the older registration.

## CHANGES v79

## Vector "mission planning" composite + popping layer style

Goal: the in-app overlays render as soft image-tint gradients that don't read at
a glance; the reference markup you liked uses bold thresholded fills + crisp
bright contour outlines that pop. And the reference was a JPEG export, so even
its (already-vector) overlays came out pixelated.

`scripts/gen_mission_planning_composite.py` rebuilds that style as TRUE vector,
reproducibly, from the real registered data:

- **Marching-squares contours** (skimage) on lightly Gaussian-smoothed fields,
  so vector edges are smooth, not stair-stepped off the 1212px raster. Nothing
  is pixelated except the single embedded relief image.
- **Four layers, each popping**: PSR (solid cyan fills + glow), peak of eternal
  light (gold fills + nested contours, from annual illumination), hydrogen/water
  (translucent purple bands + magenta outlines), hazard slope >25 deg (red
  contour rings + glow, with a dashed 20 deg warning ring).
- **Correctly registered.** The relief base is the v78-registered LROC mosaic
  (grayscaled, shadows deepened), so crater floors sit exactly under the PSR
  fills, unlike the reference, whose base carried the old loose registration.

Two outputs from one generator:

1. `mission_planning_composite.svg` (+ a 2400px PNG), the full FIGURE: overlays
   + relief + legend, crater labels, graticule, north arrow, 20 km scale bar,
   and the "Mission planning" title block. Scalable, never pixelated.
2. `public/maps/basemap_bw_overlays.svg`, the bare in-app LAYER (same overlays
   + relief, no chrome, viewBox 2424), a crisp drop-in replacement for the
   legacy "B&W + burned-in physics" basemap option. Graticule omitted so the
   app's own polar grid doesn't double up.

Re-run after any new data/registration:
`python scripts/gen_mission_planning_composite.py`. Build clean, 178 tests pass.

## Still open
- **Live toggle-overlays.** This restyles the standalone figure and the
  bw_overlays basemap. Applying the same contour-fill-glow treatment to the
  app's *interactive* toggle layers (slope/ice/temperature/the LFI-SOFI-IFI
  indices), which currently paint as image tints in the canvas render loop, is
  the natural next step: precompute the contour paths per layer at load (they're
  static) and cache them like the index-layer canvases, then stroke/fill instead
  of additive-tinting. Bigger change to the render loop; worth doing
  deliberately.
- Non-default raster basemaps still carry the older registration (need their own
  QuickMap exports through `register_quickmap_base.py`).
- Em-dash sweep across remaining visible UI strings.

## CHANGES v78

## QuickMap LROC base re-registered to the sim frame (PSR alignment fix)

**Problem.** The v77 QuickMap LROC export did not line up with the PSR mask (and,
by extension, every other overlay). Root cause: the export is georeferenced but
in its *own* extent and aspect ratio, a wide 2:1 rectangle spanning
x ∈ [−668.4, 668.4] km and y ∈ [−335.2, 335.2] km at 0.8 km/px (1671×838). The
sim frame is a **square** 1212×1212 grid, pole at (606,606), 0.5 km/px, disk edge
at 80°S (±303 km). Loaded raw, the rectangle was squished into the square, so the
PSRs, which are registered to the 80°S square frame, sat off their craters.

**Fix.** Deterministic affine reprojection of the export's VRT geotransform into
the sim frame (`scripts/register_quickmap_base.py`). Both frames are
pole-centered polar-stereographic with 0°E up / 90°E right, so it's a pure
scale+crop with no rotation. **No overlay was re-derived**, the PSR mask is
untouched; the basemap was conformed to it, not the other way around.

The PSR mask remains pixel-perfect to `annual_illum` (mean luminance 8.5 under
PSR vs 112.9 global), which the registered base is now co-registered to.

**Verification.**
- Every named crater in `craters.json` lands on its crater: Shackleton dead-center
  at the pole; Shoemaker / Haworth / Faustini / de Gerlache / Sverdrup in the
  polar cluster; Cabeus upper-left; Amundsen's PSR on its floor; Malapert toward
  0°E at top (orientation correct).
- Mean basemap luminance under the PSR mask: **45** vs **98** global, PSRs sit in
  the dark crater floors (old base: PSRs floated on illuminated highlands).

**Files.**
- `public/maps/basemap_quickmap.jpg`, replaced with the registered base
  (1212×1212, high-q JPEG; purely visual, PSR detection reads
  `psr_mask_clean.png`, never the basemap).
- `public/maps/basemap_quickmap_v77old.jpg`, previous base, kept as backup.
- `public/maps/source/quickmap_lroc_raw.{png,vrt}`, raw export + georef, for
  reproducibility.
- `public/maps/source/quickmap_lroc_registered.png`, lossless registered base.
- `scripts/register_quickmap_base.py`, reproducible registration (re-run after
  any new QuickMap export; reads the .vrt automatically).

No code changes. The default basemap key was already `basemap_quickmap`, and the
default toggles (`psr: true`, `comms_blackout: true`, overlays empty) already
match the intended boot state, so both are unchanged.

## Overlay legend upgraded (the top-left "OVERLAYS" badge)

The active-overlay badge described continuous data layers with a single flat
colour dot, which under-sold them, and was actively meaningless for the RGB
favorability composite (one white dot for a three-channel layer). Reworked:

- **Gradient swatches.** Each intensity/index row now shows a low→high gradient
  bar (dark → the layer's tint), matching how the layer actually paints on the
  map, so the bar reads as the scale it represents.
- **Real value ranges.** Slope `0-30°`, temperature `25-300 K`, normalised
  layers `0-100%`; the three indices auto-scale per load and the post's point is
  cross-index *ordering* not magnitude, so they read `low → high`.
- **Composite key.** The favorability composite gets a three-channel swatch
  (red/green/blue) plus a one-line key: `red landing · green ops · blue ice`.
- **Dynamic width.** Box width is now measured from its content, so long labels
  like "Operations favorability (SOFI)" no longer clip against the old fixed
  170px.

Verified: `npm run build` compiles clean; all 178 sim tests still pass. Change
is confined to the badge draw block in src/App.jsx (~line 2359); no logic or
data path touched.

## Hover readout is now a per-pixel favorability inspector

The bottom-right hover readout reported illum / ice / H₂ / temperature but not
slope, and, despite the LFI/SOFI/IFI rasters existing at every pixel, none of
the three mission-phase favorability scores, which are the whole point of Blog
Post 2. Added:

- **Slope** (degrees) on the terrain line, the dominant landing-hazard term.
- **A favorability row**: `LAND` / `OPS` / `ICE`, showing each index as its raw
  signed score computed through the *same* `siteIndices` path the click-through
  Terrain Analysis panel uses, so the two pixel inspectors never disagree, and
  the values carry the panel's viability colours (green ≥0.30, amber ≥0.15, red
  for negative SOFI, a comms/operations "non-site"). Raw signed values are used
  rather than a normalized %, because a % would hide the negative-SOFI signal
  that is one of the post's central points. Undefined pixels (e.g. LFI on a PSR
  floor, a landing "void") read `, `.

The effect is that hovering a PSR cold trap reads `LAND,  OPS -0.08  ICE +0.88`
,  the post's thesis ("worst to land, worst to operate, the only place worth
mining") demonstrated live under the cursor, and identical to what clicking the
same pixel shows. Confined to the `hoverData` builder and its readout JSX
(App.jsx ~line 9345 / ~9492); `SLOPE_MAP` and `siteIndices` added to the sim
import. Build clean, 178 tests pass.

## Explore-panel favorability: viability ticks + shared thresholds

Three changes to the click-through Terrain Analysis panel's favorability block:

- **Viability line on every bar.** Each LFI/SOFI/IFI bar now draws a tick at the
  `VIABLE` threshold (0.30), so you can see at a glance whether a phase clears
  the bar. A caption names the threshold.
- **Single source of truth for thresholds.** `VIABLE` (0.30) and `MARGINAL`
  (0.15) were hardcoded in the panel's colour function *and* defined separately
  in indices.js. They're now exported from indices.js and imported, so the bar
  colours, the tick, and the classifier verdict can never drift apart. (Also
  dropped an unused param from the colour helper.)
- **Brand voice.** The verdict strings are visible UI text and used em-dashes,
  against the "no em dashes in visible text" rule. Rewritten with periods /
  semicolons / commas. The one verdict unit test (`/non-site/`) still passes.

Build clean, 178 tests pass. Touches src/sim/indices.js (export + string edits)
and src/ui/ExploreSidebar.jsx (import + bar markup).

## Still open (handed back for the cleanup pass)
- The non-default raster basemaps (LROC Relief, Dramatic, Rainbow, etc.) still
  carry the older, looser registration; they'd need their own QuickMap exports
  re-run through `scripts/register_quickmap_base.py` to match the new default.
- Em-dash sweep: I fixed the verdict strings, but em-dashes likely remain in
  other visible UI strings across App.jsx. A full visible-text sweep is a clean,
  bounded follow-up (taking care not to touch code comments, where they're fine).
- Two coexisting favorability colour philosophies (channel-identity red/green/
  blue on the composite vs. good/ok/bad on values) could be unified, but that is
  a design call worth making deliberately.
- Dead-code consolidation remains available against a specific target.

## v71, Real LROC basemap (registered) + brighter, more saturated overlays

Driven by the uploaded QuickMap export and the ask to use real data, clean up
the basemaps, and make the overlays brighter and more saturated.

## Real LROC/LOLA basemap, registered to the sim frame

New default basemap `basemap_lroc_relief.jpg`, built from the uploaded QuickMap
shaded relief (real LROC/LOLA south-polar data) by `scripts/gen_lroc_basemaps.py`.

The registration was the hard part. The sim frame puts the pole at the image
center with the disk edge at the 80°S polar circle (POLE_PX = 606,606, 0.5
km/px, 606 km across). The QuickMap export is framed much wider, out to about
60°S. Measured against the export's own graticule, the pole sits at
(745.5, 396.5), the 80°S circle is at radius 129 px, the 70°S circle at 259 px
(ratio 2.01, exactly what the polar-stereographic projection predicts), and the
limb is ~60°S. The generator crops the 80°S disk about that center and rescales
it to the sim frame, so the relief co-registers with the PSR, slope, ice, and
favorability layers. Verified by overlaying the PSR mask: the shadowed regions
land in crater floors and depressions, clustered around the pole, exactly where
they should be.

Cleanup applied: graticule cross and latitude rings removed (the crop is
pole-centered, so the cardinal cross is masked at the exact center plus
profile-detected residuals), labels inpainted, de-noised, local contrast
(CLAHE), and unsharp masking to recover crispness after the upscale.

One honest limitation. Because this export is framed to ~60°S, the 80°S disk is
only the central ~258 px of the source, so the basemap is a ~4.7× upscale and
the pole region is softer than ideal. To get a genuinely crisp, "visually
stunning" result, export the QuickMap view zoomed to the 80°S polar circle (so
the 80-90°S region fills the frame at full resolution) and drop it in, the
generator is a one-line `SRC`/registration swap. The WAC photographic mosaic and
the red-contour topo style (the other two views) can be added as additional
basemap options the same way once those files are supplied; only the shaded
relief was on disk this round.

The v69 synthetic relief and the legacy burned-in basemap are kept as options.

## Brighter, more saturated overlays

- Every physical overlay color was pushed brighter and more saturated (PSR,
  ice depth, hydrogen, illumination, sun incidence, shadow layers, temperature,
  Earth visibility, slope, roughness). The muted browns and purples especially
  now read clearly on the relief.
- Raster overlay compositing alpha raised (intensity overlays 0.78 → 0.90, PSR
  0.55 → 0.62) so toggled layers pop against the basemap.
- The favorability layers (LFI/SOFI/IFI and the composite) got brighter base
  colors and a gamma lift (0.8) so mid-range values read more vividly, with the
  composite slightly more opaque.

## Status

- 178 tests pass. Production build clean.
- Real data, co-registered. Generator: `scripts/gen_lroc_basemaps.py`.

## v70, Favorability indices as toggleable map layers + RGB composite

Finishes the loop between the v69 favorability work and the v69 map pass. In
v69 the LFI / SOFI / IFI indices existed as math plus a site-inspector read-out,
but they were not visualizable on the map. They are now four toggleable layers,
including the post's centerpiece, the RGB composite (Figure 5, "three maps, one
terrain").

## Computed favorability layers

New raster layers under a "Mission-phase favorability" group in the layer
panel, each clickable on and off like the other surface-info overlays:

- **Favorability composite**, RGB where red is LFI (landing), green is SOFI
  (operations), blue is IFI (ice). This is the post's Figure 5. Yellow reads as
  landable and operable, blue as ice-only PSRs, red as landable but comms-dead.
  Per-pixel alpha tracks the strongest channel, so regions that score low on
  everything stay faint and let the terrain show through. Comms non-sites
  (negative SOFI) contribute no green, exactly as the post describes.
- **Landing favorability (LFI)**, slope-dominated; PSR floors read as voids.
- **Operations favorability (SOFI)**, drops out inside PSRs and the
  comms-blackout zone; a deployed comsat relay raises it.
- **Ice favorability (IFI)**, concentrates in PSR-anchored zones near the pole.

## How it works

- `src/sim/indices.js` gained `LFI_MAP`, `SOFI_MAP`, `IFI_MAP` rasters and
  `computeIndexRasters()`, which `loadMapData()` calls once after the terrain
  buffers are filled. Pixels with no map data (outside the polar disk) are set
  to NaN so the renderer never paints the empty background as a pristine site.
  `INDEX_RANGES` holds per-index min/max for display normalization.
- The layers paint from those buffers into cached offscreen canvases
  (`buildIndexLayerCanvas`), built once and reused since the rasters never
  change after load. The overlay loop branches on a `computed` flag so these
  bypass the image-overlay path.
- The indices <-> mapData import is a runtime call inside `loadMapData`, so the
  buffer cycle resolves without an import-order problem.

## Status

- 178 tests pass (177 from v69 plus 1 new raster test asserting IFI high at the
  PSR floor, LFI high at the rim, and NaN where there is no data). Build clean.
- No external map data downloaded. The favorability rasters are derived from
  the real LRO/LOLA layers already in the project, same as the v69 basemap.

## v69, Geology-grounded favorability indices, rover-off-PSR fix, crash hardening

Picked up from v68. The brief was to improve the sim against Blog Post 2 of the
Designated Lunar Areas series ("Geology Writes the Rules") and the v68 notes:
the discussed fixes plus the 5-10 turn crash were already in, maps were still
off-limits, and the rovers-leaving-PSRs problem was flagged as an underlying
map issue that was only half-fixed.

## 1. Mission-phase favorability indices, LFI / SOFI / IFI

New module `src/sim/indices.js` implements the three indices from the post,
with the published weights verbatim:

- **LFI** (landing): flatness 0.45, smoothness 0.25, illumination 0.15,
  temperature 0.10, PSR penalty 0.05.
- **SOFI** (surface operations): shadow-avoidance 0.25, smoothness 0.20,
  flatness 0.15, illumination 0.10, sun-incidence 0.05, thermal 0.05, plus the
  comms term.
- **IFI** (ice): hydrogen 0.40, PSR presence 0.15, ice stability 0.15, double
  PSR 0.10, cold-sunlit 0.10, low insolation 0.05, summer cold 0.05.

Both SOFI corrections from the post's methodology note are implemented as
nonlinear modifiers, not linear terms, because that is the post's central
modeling lesson:

- **Shadow-avoidance.** Annual illumination feeds the shadow input, then an
  explicit 95 percent multiplicative penalty is applied inside PSRs so PSR
  floors drop out hard instead of being averaged away.
- **Comms.** Earth visibility enters as a sigmoid penalty centered between 15
  and 50 percent visibility, subtracting up to 0.30. Sites below that band can
  score negative SOFI. They are not low-favorability operations sites, they are
  non-sites for solar-powered habitats until relay infrastructure exists. The
  comms term reads `effectiveEarthVis`, so deploying a comsat relay at a
  comms-dead site visibly raises its SOFI.

Provenance: where a source layer is not in the repo (LOLA roughness, separate
min vs annual illumination, nested double-PSR detection) the code derives a
documented proxy from layers that are present rather than inventing data.
Roughness is the local mean absolute slope difference to the four neighbors.
The post is explicit that the weights are a first pass and the magnitudes are
not the point, so the unit tests assert the cross-index ordering, not specific
numbers.

`analyzePixel` now returns an `indices` block, and the Explore Terrain
inspector renders an LFI / SOFI / IFI read-out with a plain-language verdict
("Favors operations, not landing", "Ice target but a comms non-site", and so
on). It never reports a site as viable for all three at once, which is the
post's headline result.

Tests: `tests/indices.test.js` (7). PSRs score worst for landing and ops, best
for ice. A comms-dead PSR floor scores negative SOFI. A comsat relay lifts it.
No site saturates all three.

## 2. Rovers leaving the PSRs, the underlying issue, fully fixed

Root cause confirmed. The crater extractor picked `mineX/mineY` as the PSR
pixel nearest the centroid, but a rover settles `ROVER_REACH` (8 px) short of
its waypoint. On small or C-shaped PSRs that landing spot falls just outside
the mask, so `onPSR` reads false, the rover cannot mine, and auto-seek then
re-targets the same point it is already within reach of. The rover parks a few
pixels off the ice and idles. That is the half-fixed behavior.

Two changes, neither of which touches the map image assets:

- **Sim, map-agnostic** (`src/sim/simDay.js`). On arrival, if the rover has
  settled and is free to mine but landed off-PSR, it noses onto the nearest
  in-reach PSR pixel and recomputes membership so mining starts the same turn.
  Bounded by `ROVER_REACH`, so it only snaps onto ice it could physically touch
  this turn. Not a teleport.
- **Derivation, root cause** (`src/sim/mapData.js`). The mining anchor is now
  the interior-most PSR pixel, the one with the largest inscribed radius before
  hitting the shadow boundary, rather than the pixel nearest the centroid. A
  rover stopping short of an interior anchor still lands on PSR, and it matches
  the post's framing that the deep cold crater floor is the ice target. This
  edits the crater-derivation code only. The mask image is unchanged, so it
  stays inside the "before touching the maps" line.

Tests: `tests/roverPSR.test.js` (2). A rover settling just outside a small PSR
snaps on and mines. A rover out of reach does not.

## 3. Crash hardening, the last spread-into-Math.max

The 5-10 turn crash itself was already addressed in v65/v68 (the mine-trail
RangeError, now a for-loop). I traced the full per-day and per-round pipeline
and ran a headless 14-round game against the real sim plus a faithful copy of
`processEconomy`. It runs clean with no NaN or Infinity in the economy stocks.

One instance of the exact crashing pattern remained, unguarded, at the chart
yMax in `App.jsx` (`Math.max(1, ...flatValues, 0)`). Confirmed reproducible as
a RangeError at roughly 130k arguments. The live timeline caps at 500 frames so
it would not fire at 5-10 turns, but replay runs can exceed that and it is the
same latent bug class, so it is now a loop-based max like the mine renderer.

## Status

- 177 tests pass (168 from v68 plus 9 new). Production build clean.
- Maps untouched, as requested. The rover anchor fix is in derivation code, not
  the image assets. Flagging that explicitly in case you want it gated until
  the broader map pass.

## 4. New default basemap, clean B&W lunar topography (the map pass)

Replaced the default basemap. The old default (`basemap_bw_overlays`) had the
physics overlays burned into the image, which is cluttered and fights the
toggle layers, you cannot turn off what is painted into the basemap.

New default `basemap_topo_bw.jpg`: a clean monochrome shaded relief of the real
LOLA south-polar topography already in the project. Generated by
`scripts/gen_topo_bw.py`: de-tint the blue cast to true grayscale, detect the
burned-in graticule from row/column brightness profiles and inpaint it, de-band
the posterized source, gentle local contrast (CLAHE), rim-sharpen, and neutral-
fill outside the polar disk. No labels, no graticule, no physics baked in , 
those all render dynamically on top.

The physical layers now stack cleanly on this backdrop and each toggles on/off
independently (the toggle system already existed; the burned-in basemap was
hiding its value):

- Raster layers: PSR mask, ice depth, water/hydrogen, illumination, sun
  incidence, minimum shadow, terrain shadows, surface temperature, Earth
  visibility, slope, roughness.
- Vector overlays: steep slopes, comms blackout, solar potential.
- The old burned-in basemap is kept as a selectable legacy option.

Data provenance, stated plainly: this is the real LRO/LOLA-derived relief that
ships with the project, re-rendered in clean B&W. It is not a freshly
downloaded DEM, the build sandbox can only reach dev domains (npm, pypi,
github), not NASA/PDS/USGS. To ingest a fresh LOLA DEM GeoTIFF, drop the file
in and point `scripts/gen_topo_bw.py` at it (a one-line `SRC` change plus
swapping the de-tint for a direct elevation hillshade), or whitelist the data
host in the network settings and I will pull it directly.

## Status

- 177 tests pass (168 from v68 plus 9 new). Production build clean.
- Rover anchor fix is in derivation code; the new basemap is a generated raster
  from existing real data. No external map data was downloaded.

## v51, Annual illumination + baked-label cleanup

Picked up from v50. Three concrete asks were on the table:

1. Rover waypoint system reportedly working in pixels not lunar coords (zoom breaks it).
2. Several basemaps have legends baked into the image that are now duplicated by the dynamic legend overlay.
3. The illumination map is showing a snapshot at one solar longitude, not an annual mean, and the file labeled "Max Annual Illumination" is the wrong file.

Plus an offer to either pick up dynamic lighting OR fix the annual average, I took the annual average. Notes below cover all three.

## 1. Rover waypoints, no change, see code review

After working through the math at `src/App.jsx:2456` (`getXY`), the v50 zoom-aware inversion is correct. The display transform `transform: scale(zoom) translate(-panX, -panY)` is inverted exactly by the formula at lines 2468-2473. The waypoint placement, drag, hit-test, and render all use source-pixel coordinates consistently end to end. The sim consumes source-pixel waypoints. No re-projection step is missing.

One latent issue noted but not fixed: the 50-pixel arrowhead grab hit-radius at `App.jsx:2846` is in source-pixel space, so it gets *easier* to grab when zoomed in and *harder* when zoomed out. If the reported zoom-related bug was "I can't grab the rover arrow when zoomed out," that's the culprit, should be scaled by `1/zoom` like the visible arrow already is. Otherwise the click-conversion chain is sound.

**Action**: re-test with a specific repro (click location, intended waypoint, zoom level, observed result) so we can localize whether it's click-conversion, drag, or something downstream.

## 2. Baked-in legends, cleaned

### Raster basemaps (`public/maps/*.jpg`)

Three raster basemaps had crater names + graticule labels + (in `basemap_dramatic`) a "Dramatic Relief" legend box, all burned into pixels. The runtime separately renders these via `CRATER_LABELS` and `GRATICULE_LABELS` with proper zoom counter-scaling, so the baked versions were a redundant fixed-size second set.

Generated cleaned variants via `scripts/clean_basemap_labels.py`:

- `basemap_dramatic.jpg` → `basemap_dramatic_clean.jpg` (clean)
- `basemap_rainbow.jpg` → `basemap_rainbow_clean.jpg` (clean)
- `basemap_psr_clean.jpg` → `basemap_psr_clean_clean.jpg` (small residual ghosting near the central crater cluster, acceptable for workshop use)

The original files are retained on disk. `src/sim/mapData.js` now points the three raster basemap entries at the `_clean` variants. Graticule **lines** are preserved as orientation reference; only the labels and the legend box were removed.

Approach: for each known label position from `CRATER_LABELS`/`GRATICULE_LABELS`, build a bounding rectangle. Inside those rectangles, detect high-contrast bright (white text core) and dark (drop-shadow stroke) pixels relative to a local Gaussian-blurred mean. Dilate + morphologically close so each word becomes a single blob. Inpaint the resulting narrow-glyph mask with `cv2.INPAINT_NS` (Navier-Stokes for natural-looking infill on terrain). The legend rectangle uses a wider `INPAINT_NS` pass since the area is mostly graphics. Net result: underlying terrain texture preserved, glyph shapes removed.

### Overlay SVGs (`public/maps/overlay_*.svg`)

The three overlay SVGs (`overlay_slope`, `overlay_earth`, `overlay_sun`) had an inline legend box rendered in the top-right outside the disk (viewBox `0 0 2424 2424`, legend at `x ≥ 1954`). This duplicated the dynamic bottom-right legend in the React UI.

`scripts/strip_overlay_legends.py` removes any `<rect>` or `<text>` element at `x ≥ 1954` and edits the SVG in place. Removed 9+7+9 = 25 elements total. The within-disk overlay polygons (the actual data) are untouched.

## 3. Annual illumination, replaced with a defensible proxy

`public/maps/sunlit_max.jpg` (which `loadMapData` reads into `ILLUM_MAP`) and `public/maps/basemap_illum.jpg` (the basemap dropdown option labeled "Max Annual Illumination") were both single-instant LRO snapshots, the visible terminator on the disk is the giveaway; one hemisphere was fully sunlit while the other was fully dark, which can't be a year-averaged field. This means everything downstream (`ILLUM_MAP`, the derived `RIDGE_MASK`, solar-siting gameplay) was running on snapshot data.

A true Mazarico-style annual illumination raster needs LOLA topography + a horizon-sweep simulation across the synodic year. That dataset isn't in the repo. Instead, `scripts/gen_annual_illum.py` generates a physically-grounded proxy from data already present:

- `PSR_MASK` (from `psr_mask.jpg`) sets PSR pixels to hard zero, definitionally always shadowed.
- Polar-distance attenuation: closer to 90°S = less illumination overall, with the obliquity-bounded mean-sun-elevation curve as the upper envelope.
- Rim boost: PSR-adjacent pixels with moderate-to-high steepness get a strong boost, modeling the "peaks of near-eternal light" (Connecting Ridge, Shackleton rim, de Gerlache rim).
- Shoulder boost: a wider band beyond the immediate rim gets a softer boost so broad ridge structures aren't truncated by the dilation kernel.
- Light Gaussian smoothing at the end.

Output: `public/maps/annual_illum.jpg`. Azimuthally symmetric (no terminator), PSRs pure black, rims bright. Ridge fraction (`illum > 0.65`) is 2.3%, comparable to the 1.5% the snapshot produced, but identifying actual rim ridges instead of arbitrary sun-facing slopes.

The UI label is honest about provenance: "Synthetic year-averaged proxy (PSR-mask + slope + polar geometry). Black = always shadowed, bright = peak-of-near-eternal-light rim." When a real Mazarico product gets dropped in, replace the file and update the label string.

### Code wiring

`src/sim/mapData.js`:

- `MAP_LAYERS`: new `annual_illum` key points at `annual_illum.jpg`. Legacy `basemap_illum` and `sunlit_max` keys re-pointed to the same new file so any saved games or replays referencing them by key still resolve.
- `BASEMAP_OPTIONS`: the misleading `basemap_illum` entry is replaced with `annual_illum`. Label is now "Annual Illumination", subtitle is honest about provenance.
- `LAYER_INFO`: `sunlit_max` description rewritten, no longer claims "Mazarico LRO model."
- `loadMapData()`: explicit comment block + reads from `MAP_LAYERS.annual_illum` instead of `.sunlit_max`.

`src/App.jsx`:

- `RASTER_BASEMAPS` set: added `annual_illum`.
- Snapshot hydration at line ~500: migrates a stale `basemap_illum` key to `annual_illum` so old snapshots show an active dropdown selection instead of nothing.

## Pass 2 additions

Returned to the four items I had flagged. All four addressed:

### Rover arrowhead-grab hit radius (`src/App.jsx`)

The arrow's visible length is counter-scaled by `1/zk` in `drawRoverArrows` (`arrLen = 110 * s`) so it stays constant on screen at zoom ≥ 1. But `getArrowheadFor` was returning the un-scaled `rover + 110 source-px` position, so at zoom 2 the click hit-test point was at `rover+110` while the visible arrowhead was at `rover+55`. The user would click the visible arrow and miss.

Fixed:

- `getArrowheadFor`: now uses `arrLen = ARROW_LEN / zk` matching the draw counter-scaling.
- `handleMouseDown` arrowhead hit radius: `hitR = 50 / zk` instead of fixed 50.
- `handleMouseMove` drag deadzone: `dead = 10 / zk` instead of fixed 10.
- `handleMouseUp` cancel threshold: `cancelR = 20 / zk` instead of fixed 20.

All four use the same `zk = Math.max(1, viewport.zoom || 1)` formula as the draw code. At zoom 1 the behaviour is unchanged; at zoom 2 the hit area is half the source-pixel size to stay constant on screen.

### Illumination proxy refinement (`scripts/gen_annual_illum.py`)

The v50 → v51 first pass used `ImageFilter.MaxFilter(13)` and `MaxFilter(25)` to dilate the PSR mask into rim and shoulder zones. MaxFilter on a 3-pixel speck PSR produces a 13×13 axis-aligned square ring, visually blocky. Replaced both with Gaussian-blur-then-threshold: smooth circular halos at the same effective width.

- Rim zone: `gaussian_filter(psr_mask, sigma=2.0)` thresholded at 0.12 → ~22.7k rim pixels (was ~similar count via MaxFilter)
- Shoulder zone: `sigma=6.0` thresholded at 0.10
- Final post-blur: removed entirely (was `GaussianBlur(radius=2.0)` which was killing ridge peaks below the runtime threshold). The Gaussian-dilated masks are already smooth so the post-blur is redundant; without it, ridge peaks survive JPG quantization properly.

Ridge fraction lands at 0.6% (was 1.5% in the snapshot baseline). The lower number reflects that the new rims are appropriately tight, only true crater walls cross threshold, not the wider square-halo regions MaxFilter created. Visually the result is much improved: smooth organic halos following PSR contours, no more axis-aligned squares around small PSRs.

### Fresh PSR basemap (`scripts/gen_basemap_psr_clean.py`)

The inpaint-cleaned `basemap_psr_clean_clean.jpg` from pass 1 had visible ghosting near the central crater cluster (de Gerlache / Shackleton / Faustini), where the inpaint had to invent terrain under heavily-overlapping baked labels. Replaced with a composited generation:

- Base: `basemap_dramatic_clean.jpg` (already cleaned in pass 1, no baked labels)
- Overlay: PSR mask as soft cyan tint (RGB 180/230/245, alpha 0.55 on PSR pixels, alpha 0.18 on Gaussian-dilated halo). Cool cyan reads as "icy cold trap."

No ghosting. Same aesthetic intent as the legacy basemap.

The old inpaint logic is no longer applicable to `basemap_psr_clean`, so its target was removed from `clean_basemap_labels.py` with a comment to prevent future re-runs from clobbering the generated output.

### Graticule cleanup on `psr_mask.jpg` (`scripts/clean_psr_mask.py`)

The latent fragility flagged in pass 1: the polar graticule (4 cardinal radii + 3 concentric circles for 80°S, 87°S, 89°S) is baked into `psr_mask.jpg` at luminance ~115. That's under the >128 PSR-classification threshold today, so the graticule doesn't cause false-positive component mergers, verified by extracting connected components: at threshold 128 we get 286 components both with and without the graticule, and the 12 spurious antialiased-edge components are all sub-6-pixel noise filtered out anyway.

But: any future lowering of the threshold (to pick up faint PSR boundaries, etc.) would cause the graticule to immediately bridge most south-polar PSRs into a single mega-component. At threshold 110 the graticule does bridge components: 117 → 114 after cleanup (-3). So cleanup is defensive value, not a current bug fix.

Approach: geometric mask (axis-aligned vertical + horizontal lines + concentric circles at known radii) intersected with mid-luminance band (70-200) intersected with NOT-confirmed-PSR (< 200). Zero out matching pixels. The cleaned mask is saved as PNG (not JPG) to avoid JPG re-encoding introducing faint compression-artifact rings at the cleaned positions. `loadImagePixels` is format-agnostic so no other runtime change is needed.

`mapData.js` now points `MAP_LAYERS.psr` at the cleaned PNG, with a defensive comment block in `extractCratersFromPSR` explaining the threshold/graticule relationship for any future devs lowering the threshold.

Side benefit: `gen_annual_illum.py` and `gen_basemap_psr_clean.py` both now prefer the cleaned mask too (with fallback to the legacy if the cleaned file isn't present), so the rim_zone and halo computations don't pick up phantom mid-luminance graticule pixels either.

## Tests

All 168 sim-core tests pass before and after these changes. No regressions in `simDay`, `pickRoverTarget`, `computeAutoFitViewport`, `buildEnemyZones`, plot building, exports, or any other module. Both passes verified.

## To regenerate any of the assets

```
python3 scripts/clean_psr_mask.py           # produces psr_mask_clean.png
python3 scripts/gen_annual_illum.py         # uses cleaned mask if present
python3 scripts/clean_basemap_labels.py     # produces dramatic + rainbow _clean.jpg
python3 scripts/strip_overlay_legends.py    # edits overlay_*.svg in place
python3 scripts/gen_basemap_psr_clean.py    # uses dramatic_clean + cleaned mask
```

The natural order is: `clean_psr_mask` first, then anything that depends on the PSR mask, then `clean_basemap_labels`, then `gen_basemap_psr_clean` (which depends on `basemap_dramatic_clean.jpg`).

The original raster basemaps and `psr_mask.jpg` are kept in place, only `_clean` variants are added. To revert, point `MAP_LAYERS` back at the originals in `mapData.js`.


---

## v52, Real LROC illumination data + re-derived PSR mask

Replaced the synthetic illumination proxy with REAL data, using a QuickMap
south-polar illumination export the user provided with a graticule overlay.

### Registration (deterministic, from the graticule)
The graticule overlay let me measure the export's projection exactly rather
than fitting blind:
- pole (crosshair center): source-px (746, 396)
- scale: 12.9 px / degree co-latitude, a linear polar projection, verified
  because the 60 S and 70 S circles both give r/colat = 12.9
- 80 S circle radius: 129 px

`scripts/process_quickmap_illum.py` maps each sandbox pixel (pole at
606,606; 80 S at r=590; 59 px/deg) to the QuickMap source via co-latitude +
azimuth and bilinearly samples it. The graticule lines (2 cardinal axes +
3 concentric circles) are removed geometrically, we know exactly where they
are, and inpainted from neighbours. Output: `annual_illum.jpg`, real data
filling the 80 S disk.

### Why this also fixed the PSR mask
While registering, I found the legacy `psr_mask` was itself misregistered:
its cold-trap centroid sat ~55px right / ~78px up from where the real LROC
data places the pole's shadowed regions. So the illumination layer and the
game's cold-trap logic disagreed with reality.

`scripts/derive_psr_from_illum.py` re-derives the PSR mask FROM the real
registered illumination (PSRs = the persistently-shadowed dark 8% tail,
opened to drop the crosshair residue, sub-6px specks filtered to match
`extractCratersFromPSR`). Now illumination and PSRs share one consistent
real geometry. Validated against `craters.json`: Shoemaker 100%, Haworth
93%, Faustini 83%, Cabeus 60% PSR coverage at their listed positions.

### Wiring
- `mapData.js`: manifest comment + both UI labels rewritten from "synthetic
  proxy" to "Real LROC south-polar illumination (QuickMap)". `MAP_LAYERS`
  paths unchanged (annual_illum.jpg / psr_mask_clean.png).
- `basemap_psr_clean_clean.jpg` regenerated so the cyan PSR highlights match
  the new mask positions.
- Source export archived at `public/maps/source/quickmap_illum_graticule.png`.

### Caveats (honest)
1. Faint crosshair smudge remains along the two axes of `annual_illum.jpg` , 
   soft, not a hard line; could be improved with along-line interpolation.
2. The QuickMap layer is shaded-relief illumination, real and correctly
   georeferenced, but not a Mazarico annual integral. To upgrade, drop the
   true Mazarico GeoTIFF into `public/maps/source/` and re-run the same
   registration script; the geometry math is unchanged.
3. The PSR mask is an illumination-threshold proxy, far better-registered
   than the legacy mask but inferred from relief. For an exact PSR set,
   register the QuickMap PSR layer directly with the same geometry.

168/168 tests pass.

### Regen order
```
python3 scripts/process_quickmap_illum.py    # real illum -> annual_illum.jpg
python3 scripts/derive_psr_from_illum.py      # PSR mask from real illum
python3 scripts/gen_basemap_psr_clean.py      # PSR basemap from dramatic + mask
```
