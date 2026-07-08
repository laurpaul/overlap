# Monte Carlo Research Plan (v2 · for builds ≥ 2.7.209)

Supersedes the July 5 plan. What changed since: governance regimes are now
mechanical (v206), operational failures cost score and can be rescued
(v206-v207), the stranding epidemic in bot play was diagnosed and fixed
(62% → 5% of baseline sessions across v206-v209), and the pipeline gained
per-trial telemetry, deterministic seeds, a sweep runner, and a paired-stats
analyzer.

## The pipeline
- `npm run mc:sweep`, 13-config battery (~2,550 trials, ~40 min) → one
  long-format CSV. Subsets: `node tools/mc-sweep.mjs baseline atcm`.
- `npm run mc:analyze <csv> [--baseline id] [--md report.md]`, per-config
  stats ±95% CI, violations **per round**, failure telemetry, and paired
  deltas vs baseline matched by seed (deterministic seeding makes equal-seed
  trials matched pairs, use these, they are far tighter than raw means).
- In-app equivalents: `⚗ Research sweep` and `CSV · all N trials`.
- **Never mix CSVs from different builds in one analysis.** Mechanics moved
  under v206-v209 deliberately; the version is part of the treatment.

## The runs
R1 `baseline` ×300, reference distributions. Check for bimodality first.
R2 `grid_off` / `baseline` / `grid_perm` ×200, the institutional-design
   lever: does the option to share power (and its reversibility) change
   join rates, shared days, ice, violations?
R3 `cooperative` / `atcm` / `itu` / `strategic_res` ×200, the regime
   comparison, now real: ITU weights late-party violations ×2, ATCM ×1.5.
   Compare per-round rates; expect ITU ≈ exactly double baseline violations
   with Δice ≈ 0 (registration priority reprices crowding without touching
   extraction, confirmed at n=40, worth the full-n replication).
   `strategic_res` (as of v212) escrows 25% of every deposit into a reserve
   ledger scoring ×1.5, compare its score/ice split against long_horizon,
   which is the same 20-round board without the escrow.
R4 `first_mover` ×300, symmetric-start sprint; pilot shows no P1 edge.
R5 `arrival_d2/5/10/20` ×150, the dose-response of arriving late; pilot
   slope ≈ +1,470 → +2,060 pts gap from 2 → 20 days. Fit the curve.
R6 `long_horizon` ×150, depletion dynamics over 20 rounds. Run with
   `--timeseries` (per-round CSV alongside the trials CSV) and pass it to
   `mc:analyze --rounds <file>` for the early/mid/late tercile trend table.
   Preliminary n=40: per-round violations rise 7.4 → 9.9 across terciles
   while per-round ice collapses 67 → 1 kg, friction rises as accessible
   ice runs out. Caveat: crater-level depletion stays ~0; the ice collapse
   is PROXIMITY exhaustion (pixels near bases tap out), so frame the finding
   as local scarcity, not global depletion, unless DEPLETION_RATE is raised.
R7 sensitivity (after R1-R6), `physOverrides.DEPLETION_RATE` ×{0.5, 2}.

## Reading the failure telemetry (columns)
- `stranded*`, `strand_night/far/other`, cause-attributed stranding. After
  the v206-v209 fixes (energy-budgeted dispatch, dynamic + predictive
  night-aware recharge trigger), baseline sessions strand ~5%; a config that
  strands much more is telling you something about that config.
- `strand_pen_days*`, `rescues*`, stranding now costs 2 pts/day and a
  funded actor auto-rescues after 3 days for 120cr; rescues per session
  measure how often the economy absorbs an operational failure.
- `dep_blocked*`, reads as a NIGHT-BROWNOUT indicator, not ice loss:
  blocks are transient habitat power dips; the ice banks at dawn (verified:
  identical total ice on identical seeds).
- `governance`, the mechanical regime applied to the trial.

## Statistical guidance (unchanged in spirit)
n=200 → ±7 pp on a 50% rate; compare per-round rates across regimes of
different lengths; report paired deltas vs baseline with their own CIs
(`mc:analyze` does this); replay 2-3 seeds of any surprising cell before
believing it.
