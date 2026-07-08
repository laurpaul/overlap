// ── Overlap simulation core ────────────────────────────────────
//
// One import to rule them all. Modules can also be imported individually:
//
//   import { simDay } from "./sim/simDay.js";
//   import { CRATER_DATA } from "./sim/mapData.js";
//
// Or all together:
//
//   import * as Sim from "./sim";
//
// The pure-JS sim is intentionally framework-free so it can be unit-tested
// in Node without jsdom or a build step.

export * from "./constants.js";
export * from "./stakeholders.js";
export * from "./mapData.js";
export * from "./utils.js";
export * from "./physics.js";
export * from "./indices.js";
export * from "./economy.js";
export * from "./governance.js";
export * from "./power.js";
export * from "./autoTarget.js";
export * from "./viewport.js";
export * from "./enemyZones.js";
export * from "./labels.js";
export * from "./plotData.js";
export * from "./exports.js";
export * from "./simDay.js";
export * from "./feasibility.js";
export * from "./orbit.js";
export * from "./blocNegotiation.js";
export * from "./gridNegotiation.js";
export * from "./deals.js";
export * from "./diplomacy.js";
export * from "./fogOfWar.js";
export * from "./claims.js";
