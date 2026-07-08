# Overlap

*A lunar policy sandbox.* Safety zones are the mechanic and the metaphor. The game is what happens where they overlap.

![Live session: DLA rings, deals panel, and the real south pole](docs/session.png)

Overlap is a browser-based governance simulation of the lunar south pole. Two coalition programs, an Artemis-style bloc and an ILRS-style bloc, compete and cooperate over water ice on terrain derived from LRO data (LOLA, LEND, Diviner). Every asset projects a three-tier keep-out zone from Christine Tiballi's Designated Lunar Area framework. Crowding a neighbor bleeds points every turn. Deconfliction is negotiated at the table, and every session exports its complete history.

Built by Vic Paulson for the 2026 Open Lunar Foundation fellowship, with Tommy Smith, and coded with the help of Claude (Anthropic). The zone geometry and the ISRU economics come from two AIAA SciTech 2026 papers; the terrain scoring comes from the LFI, SOFI, and IFI favorability indices from the same research line.

## Quick start

Requires [Node.js](https://nodejs.org/) 18+.

```bash
npm install
npm run dev
```

No install: grab the standalone build from Releases, unzip, run the start script.

![Setup: actor archetypes, internal bloc cohesion, scenario presets](docs/setup.png)

## Play it in a room

Pick a scenario, place bases, and let the round autopilot carry the logistics while players spend their attention on decisions. The facilitator pushes injects, watches the live violations HUD, and can convene a Conference of Parties that freezes the clock while the table talks. In our July session, the convene produced a negotiated 50-50 crater split, an Outer Space Treaty standoff, and zero safety violations in twelve rounds.

![Convene: clock frozen, rings on the table](docs/convene.png)

Zone radii can be driven by the Open Lunar Lunar Radius Framework: import a `buffers.json` in the hazard panel and the sim adopts those rings.

![Hazard framework: if/then radii into live zones](docs/hazard-framework.png)

## Research mode

The same simulation runs headless as a Monte Carlo instrument on deterministic seeds, so every cross-configuration comparison is a matched pair.

```bash
npm install -D puppeteer && npm run build
npm run mc:full      # 13-config battery + per-round telemetry + report
npm run mc:verify    # canonical hash for cross-machine reproducibility
```

Headline results from the 2,550-trial battery: governance regimes reprice friction without restricting extraction (ITU-style registration lands at exactly twice the baseline violation rate with ice unchanged), a permanent shared grid beats a reversible one, and arriving two days late already decides most sessions. Full findings in `data/mc_report.md`; methods in `MC_RUN_PLAN.md`.

## Data

`data/` ships the 2,550-trial battery with per-round telemetry, the analyzer report, and a complete human session export. `figures/` holds every chart from the showcase and the blog series in `docs/blog/`.

## Tests

```bash
npm test       # 511 tests
npm run lint
```

## Citing

See `CITATION.cff`.

## Acknowledgments

Tommy Smith, co-developer. Christine Tiballi, whose DLA framework the zones implement. Aaron Mackey, whose if/then hazard toolkit the buffers import supports. Claude (Anthropic), development assistant throughout. The June and July playtest crews, who argued with the tool until it improved. Open Lunar Foundation, 2026 fellowship.

## License

MIT. Lunar data products are from NASA LRO instruments (public domain).
