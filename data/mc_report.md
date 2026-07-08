# Monte Carlo sweep report
Source: lps_research_sweep.csv · 2550 trials · 13 configs · baseline: baseline

| config | n | P1 win | score1 ±CI | score gap | ice kg | vio/round | strand% | rescues | blocked% | extr% |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline | 300 | 50.0% | 781 ±219 | 19 | 473 | 8.1 | 12.7% | 0.01 | 20.3% | 1.90 |
| grid_off | 200 | 46.0% | 152 ±345 | -65 | 502 | 11.0 | 18.0% | 0.07 | 27.0% | 1.95 |
| grid_perm | 200 | 47.0% | 1008 ±224 | -23 | 430 | 6.1 | 8.5% | 0.01 | 11.0% | 1.86 |
| cooperative | 200 | 44.0% | 214 ±380 | 56 | 443 | 12.4 | 8.0% | 0.01 | 4.0% | 1.88 |
| atcm | 200 | 47.0% | -1167 ±823 | 200 | 453 | 21.5 | 82.0% | 0.57 | 10.0% | 2.12 |
| itu | 200 | 43.5% | -558 ±521 | -101 | 489 | 16.9 | 12.0% | 0.02 | 20.5% | 1.94 |
| strategic_res | 200 | 45.5% | 1639 ±377 | -232 | 388 | 8.8 | 88.0% | 0.79 | 35.0% | 2.39 |
| first_mover | 300 | 42.0% | 625 ±64 | -20 | 387 | 5.4 | 4.3% | 0.00 | 0.0% | 1.56 |
| arrival_d2 | 150 | 86.7% | 2268 ±322 | 1785 | 574 | 4.9 | 74.0% | 0.47 | 69.3% | 2.47 |
| arrival_d5 | 150 | 82.0% | 1964 ±381 | 1620 | 595 | 5.8 | 76.7% | 0.32 | 72.7% | 2.47 |
| arrival_d10 | 150 | 78.0% | 2098 ±368 | 1569 | 618 | 4.8 | 70.7% | 0.25 | 72.7% | 2.55 |
| arrival_d20 | 150 | 91.3% | 2428 ±307 | 2401 | 630 | 5.0 | 62.7% | 0.28 | 70.0% | 2.58 |
| long_horizon | 150 | 48.7% | 1610 ±436 | -195 | 512 | 8.8 | 86.0% | 0.68 | 35.3% | 2.39 |

## Paired deltas vs baseline (matched by seed)

| config | paired n | Δ ice kg ±CI | Δ vio/round ±CI | Δ score1 ±CI | verdict |
|---|---:|---:|---:|---:|---|
| grid_off | 200 | 13 ±11 | 2.55 ±0.69 | -535 ±114 | vio significant · ice significant |
| grid_perm | 200 | -59 ±17 | -2.31 ±0.54 | 321 ±98 | vio significant · ice significant |
| cooperative | 200 | -45 ±15 | 4.00 ±0.86 | -474 ±150 | vio significant · ice significant |
| atcm | 200 | -36 ±17 | 13.06 ±2.35 | -1854 ±584 | vio significant · ice significant |
| itu | 200 | 0 ±2 | 8.45 ±1.58 | -1246 ±257 | vio significant · ice n.s. |
| strategic_res | 200 | -100 ±12 | 0.39 ±0.56 | 952 ±188 | vio n.s. · ice significant |
| first_mover | 300 | -87 ±16 | -2.68 ±1.04 | -155 ±194 | vio significant · ice significant |
| arrival_d2 | 150 | 81 ±52 | -3.63 ±1.86 | 1544 ±390 | vio significant · ice significant |
| arrival_d5 | 150 | 102 ±51 | -2.66 ±2.01 | 1239 ±439 | vio significant · ice significant |
| arrival_d10 | 150 | 125 ±54 | -3.71 ±1.91 | 1373 ±408 | vio significant · ice significant |
| arrival_d20 | 150 | 137 ±55 | -3.52 ±1.91 | 1703 ±344 | vio significant · ice significant |
| long_horizon | 150 | 19 ±12 | 0.35 ±0.61 | 885 ±229 | vio n.s. · ice significant |

_Paired CIs use per-seed differences; "significant" = |Δ| exceeds its own 95% CI. Configs with different round counts compare violations per round._
## Round trends (early / mid / late terciles)

| config | rounds | Δvio E/M/L | Δice E/M/L | contested E/M/L | depleted E/M/L |
|---|---:|---|---|---|---|
| baseline | 1–12 | 5.4 / 11.6 / 7.3 | 97 / 13 / 8 | 0.04 / 0.00 / 0.00 | 0.0 / 0.0 / 0.0 |
| grid_off | 1–12 | 8.1 / 18.0 / 6.8 | 100 / 18 / 8 | 0.04 / 0.00 / 0.00 | 0.0 / 0.0 / 0.0 |
| grid_perm | 1–12 | 4.3 / 8.3 / 5.7 | 95 / 6 / 6 | 0.04 / 0.00 / 0.00 | 0.0 / 0.0 / 0.0 |
| cooperative | 1–12 | 5.5 / 15.0 / 16.7 | 99 / 7 / 5 | 0.04 / 0.00 / 0.00 | 0.0 / 0.0 / 0.0 |
| atcm | 1–16 | 10.2 / 23.9 / 28.9 | 82 / 5 / 3 | 0.04 / 0.00 / 0.00 | 0.0 / 0.0 / 0.0 |
| itu | 1–12 | 10.8 / 24.5 / 15.3 | 99 / 14 / 9 | 0.04 / 0.00 / 0.00 | 0.0 / 0.0 / 0.0 |
| strategic_res | 1–20 | 7.7 / 8.7 / 9.9 | 53 / 8 / 2 | 0.03 / 0.00 / 0.00 | 0.0 / 0.0 / 0.0 |
| first_mover | 1–4 | 2.8 / 4.6 / 7.2 | 350 / 5 / 16 | 0.13 / 0.01 / 0.01 | 0.0 / 0.0 / 0.0 |
| arrival_d2 | 1–20 | 6.4 / 2.8 / 5.6 | 74 / 7 / 12 | 0.02 / 0.00 / 0.00 | 0.0 / 0.0 / 0.0 |
| arrival_d5 | 1–20 | 7.5 / 4.6 / 5.7 | 74 / 9 / 12 | 0.00 / 0.00 / 0.00 | 0.0 / 0.0 / 0.0 |
| arrival_d10 | 1–20 | 5.7 / 3.7 / 5.0 | 76 / 7 / 16 | 0.01 / 0.00 / 0.00 | 0.0 / 0.0 / 0.0 |
| arrival_d20 | 1–20 | 4.1 / 6.7 / 4.0 | 74 / 11 / 15 | 0.01 / 0.00 / 0.00 | 0.0 / 0.0 / 0.0 |
| long_horizon | 1–20 | 7.9 / 8.6 / 9.9 | 72 / 10 / 2 | 0.03 / 0.00 / 0.01 | 0.0 / 0.0 / 0.0 |

_Per-round means within each tercile of the session. Rising Δvio or contested with rising depleted = scarcity-driven friction (the R6 hypothesis)._
