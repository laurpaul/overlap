# 2,550 rehearsals of the same moon

*Post 4, closing the Designated Lunar Areas series. Post 2 showed why the geology forces everyone onto the same sites. Post 3 showed what one table of humans did there. This one is about what happens when you run the experiment 2,550 times.*

Human sessions are rich and rare. We get a table of players for an evening, they produce two hours of negotiation and one twelve-round history, and every session is different because people are different. That is the point of playing, and it is also the limit: you cannot tell from one session whether an outcome came from the rules or from the room.

So Overlap has a second mode. The same simulation that runs a workshop also runs headless, with bot actors, on fixed random seeds. Seed 42 under ITU rules and seed 42 under Antarctic-style rules are the identical moon, the identical ice, the identical starting positions, with only the institution changed. Every comparison is a matched pair. In July I ran the full battery on my own machine: thirteen configurations, 2,550 trials, about twenty minutes, one command. A verification script prints a hash of a fixed ten-seed run so anyone can check their build reproduces mine before trusting anything else.

Here is what the battery says.

## Regimes reprice friction. They do not restrict extraction.

Plot every governance regime by the two things it might change, safety violations and ice mined, and the result is lopsided. Violations per round swing by more than thirteen units across regimes. Total ice barely moves 120 kilograms on a roughly 470 kilogram base, and for the ITU-style registration regime the change in ice is statistically zero.

*(figure: ../../figures/mc_reprice_scatter.png)*

That ITU cell is also the validation story. The mechanics weight violations against the later-registered party by a factor of two, and the measured effect lands at +8.45 violations per round on a baseline of 8.1. The knob does what the label says, to two decimal places, which is the kind of boring result that lets you trust the interesting ones.

For DLA design this is the finding I lead with. Zone rules are a pricing instrument on crowding, not a brake on industry. The recurring fear that coordination regimes will strangle extraction does not survive contact with the data: mining throughput is set by geology and logistics, and the institution decides who pays for friction, not whether ice comes out of the ground.

## Commitment beats optionality

The cleanest institutional result is about power sharing. Remove the option to share a grid and sessions get worse: +2.55 violations per round, 535 points poorer. Make grid membership permanent instead of reversible and sessions get better: 2.31 fewer violations per round, 321 points richer, at the price of roughly twelve percent of ice throughput. Commitment is not free. It is just clearly worth it, and the reversible middle option underperforms both honest extremes.

*(figure: ../../figures/battery_grid_institution.png)*

This is the credible-commitment literature showing up in a sandbox, and it has a direct DLA reading: coordination mechanisms bind best when joining them is hard to undo.

## Arriving late is priced in days, and the price is front-loaded

Delay one actor's arrival by two days and the first mover wins 87 percent of sessions, up roughly 1,785 points. Stretch the delay to twenty days and the numbers barely move further. Most of the penalty is being second at all.

*(figure: ../../figures/battery_arrival_dose.png)*

Post 3 showed a player discovering this dynamic live and reaching for treaty leverage to compensate. The battery says his instinct was correct: under simultaneous starts the win rate is a coin flip, and under any arrival gap it is not. Fairness at the pole is mostly a property of the starting gun.

## Scarcity breeds friction, round by round

The per-round telemetry shows violations climbing as sessions age while ice banked per round collapses, from about 72 kilograms per round early to 2 late in the long-horizon runs. The cause is local: pixels near established bases tap out while distant craters sit untouched. Crowding follows depletion around the map.

*(figure: ../../figures/battery_scarcity_friction.png)*

## The honest residual

One number in the battery is a bug report, and I am publishing it anyway. In configurations longer than twelve rounds, rovers strand in 60 to 88 percent of sessions. The night-operations logic that cut baseline stranding from 62 percent of sessions to 5 was tuned and verified at twelve rounds, and longer missions cross more lunar nights than it anticipates. The telemetry attributes the cause, the run plan documents it, and it is first on the roadmap. I include it because a research instrument that only reports its successes is an advertisement.

## What it adds up to

The geometry paper set the feasible zone sizes. The human sessions showed the behavior. The battery supplies the statistics: institutions move outcomes by amounts you can put confidence intervals on, and they move the political variables, not the industrial ones. The practical recipe for a DLA regime falls out of the three together. Name a number in the sub-2-kilometer band the geometry allows. Make commitments sticky. Price zone inflation, because Post 3 proved someone will try it. And put a room in the framework, because when we left the pressure nowhere to go, it went looking for the Outer Space Treaty.

Every figure in this series is reproducible from the repository with one command and a fixed seed. If your numbers disagree with mine, the verify hash will tell us whose build drifted, and I genuinely want to hear about it. That is what the sandbox is for.

*Overlap is free to use; its datasets and figures are CC BY 4.0. If you run a session, send me the export. The data behind this post, 2,550 trials plus per-round telemetry and the analyzer report, ships in the repository.*
