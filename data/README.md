# Published datasets

These are the datasets behind the fellowship showcase and the DLA blog
series. Everything here regenerates from the code with a fixed seed.

- mc_trials_2550.csv: the full Monte Carlo battery. 2,550 trials, 13
  configurations, 52 columns, build 2.7.213, seed 0x5EED2026 with stride
  9973. Equal seeds across configurations are matched pairs.
- mc_rounds_2550.csv: per-round telemetry for every trial (violations, ice,
  contested and shared days, strandings, depletion).
- mc_report.md: the analyzer output for the battery. Per-config stats with
  95 percent CIs, paired deltas vs baseline, round-tercile trends.
- session_2026-07-01.csv: a complete human session export. Per-round
  metrics, every asset with declared vs baseline ring radii, rover traces,
  zone interactions, crater state, and the 181-event log.

Regenerate the battery: `npm run mc:full` (about 20 minutes). Check your
build reproduces this one first: `npm run mc:verify` against VERIFY.md.

Column documentation is in MC_RUN_PLAN.md at the repository root. If you
use these data, cite the project via CITATION.cff.
