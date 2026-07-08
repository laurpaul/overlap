// ── Tutorial content ────────────────────────────────────────────────────────
//
// Pure data for the "how to play" guided tour, kept framework-free (no React,
// no JSX) so it can be validated in isolation by tests/tutorial.test.js the
// same way the sim core is. TutorialOverlay.jsx imports and renders this.
//
// Numbers track the live model (see src/sim/economy.js):
//   score = ice banked (1/kg) + ice carried (0.5/kg)
//         + asset points (15 each) − safety violations (25 each)
// Asset points: solar 2 · habitat 10 · rover 3 · pad 5 · reactor 15 · comsat 6.
//
// Brand rule: no em dashes in any visible string. Enforced by the test.

export const TUTORIAL_STORAGE_KEY = "lps_tutorial_seen_v1";

export const TUTORIAL_STEPS = [
  {
    id: "goal",
    glyph: "◑",
    kicker: "The objective",
    title: "Stand up a lawful presence at the pole",
    body: [
      "You are operating infrastructure in the lunar south pole, where the permanently shadowed regions (PSRs) hold water ice that has been cold-trapped for billions of years.",
      "Your job is to build the most valuable, best-behaved presence on the surface. The simulation tracks every kilogram of ice you bank, every asset you stand up, and every time you crowd a neighbor's safety zone.",
    ],
  },
  {
    id: "map",
    glyph: "⊕",
    kicker: "Read the terrain",
    title: "The map is real LRO data, not decoration",
    body: [
      "PSR floors are the cold traps where ice is stable. Ridges catch near-constant sun and make good ground for power. Some basins fall into comms blackout, with no line of sight to Earth.",
      "Hover any pixel for a live readout of illumination, temperature in Kelvin, hydrogen abundance, and slope. Click to analyze a spot in detail before you commit an asset to it.",
    ],
  },
  {
    id: "assets",
    glyph: "▣",
    kicker: "Your toolkit",
    title: "Six assets, each a tradeoff",
    body: [
      "Solar arrays and reactors generate power. Habitats anchor your footprint. Landing pads receive resupply. Comsats relay through blackout zones. Rovers are your mobile miners.",
      "Each asset costs budget to place and is worth asset points toward your score. Reactors are the priciest and the most valuable. Spend deliberately: budget is finite and resupply is slow.",
    ],
  },
  {
    id: "mining",
    glyph: "⛏",
    kicker: "The main score lever",
    title: "Drive rovers into the dark and mine ice",
    body: [
      "Send a rover into a PSR and it will mine water ice, haul it back, and deposit it at your base. Banked ice is your single biggest source of points.",
      "Watch power and the day-night cycle. A rover on a steep crater rim can stall, and a rover far from sunlight runs its battery down. PSR floors also deplete as you work them, so spread the load.",
    ],
  },
  {
    id: "safety",
    glyph: "⊘",
    kicker: "The governance core",
    title: "Respect the safety zones",
    body: [
      "Every placed asset projects a safety zone around it. Driving into or building inside an opponent's zone counts as a violation, and each violation costs you 25 points.",
      "This is the whole point of the sandbox. Designated Lunar Areas are about deconfliction, so it pays to coordinate and give neighbors room rather than crowd the same crater.",
    ],
  },
  {
    id: "score",
    glyph: "∑",
    kicker: "How you are judged",
    title: "What the score actually adds up",
    body: [
      "Your mission score combines everything above into one number, shown live in the heads-up display.",
      "Bank ice, build worthwhile infrastructure, and keep your nose out of other operators' safety zones, and the number goes up.",
    ],
    formula: [
      ["+", "ice banked", "1 point per kg"],
      ["+", "ice still carried", "half a point per kg"],
      ["+", "asset points", "15 points each"],
      ["−", "safety violations", "25 points each"],
    ],
  },
  {
    id: "turn",
    glyph: "↻",
    kicker: "The loop",
    title: "Make your moves, then end your turn",
    body: [
      "Play runs in rounds. On your turn you place assets and aim your rovers, then end the turn. The simulation resolves several days, mines the ice, tallies decay and violations, and hands the next round back to you.",
      "Take your time during setup. Where you put your first habitat and rovers shapes the rest of the game.",
    ],
  },
  {
    id: "where",
    glyph: "⌘",
    kicker: "Find your way around",
    title: "The panels you will want",
    body: [
      "The heads-up display tracks your score and resources. The mission log records every event. Analytics charts your run over time, and physics parameters expose the model underneath.",
      "Reopen this tour anytime from How to play in the toolbar, or press H. For the keyboard shortcuts, press the question mark key.",
    ],
  },
];
