// ── Plot data builder ───────────────────────────────────────────────────────
//
// Pure function that consumes a list of game-state frames + the mission log
// and produces an array of "plot definitions" -- each describing a chart to
// render (title, series data, y-label, tick formatter, legend layout, etc).
//
// Used by:
//   - The Plots panel in the live game (renders to canvas via drawPlotCanvas)
//   - GIF export overlays
//   - The batch-sim replay viewer
//
// No React, no canvas, no map state. Inputs are frames (game-state snapshots
// at specific globalDays) and the mission log. Output is a flat array of
// plot definitions ready to render.

import { dist } from "./utils.js";
import { PIXELS_PER_KM } from "./constants.js";
import { STATUS_INFO } from "./constants.js";
import { scorePlayerState } from "./economy.js";
import { structureLabel } from "./labels.js";

export function buildPlotDefinitions(plotSource) {
// Collapse to one frame per global day (last frame wins -- has the most log
// entries and the most up-to-date player state for that day).
const allFrames = plotSource.frames || [];
const dayMap = new Map();
allFrames.forEach(f => dayMap.set(f.globalDay ?? 0, f));
const frames = Array.from(dayMap.values());
const log = plotSource.log || [];
if (!frames.length) return [];

const xLabels = frames.map(f => `D${(f.globalDay ?? 0) + 1}`);
const PLAYER_PALETTES = {
  // Player 1 -- teal / aqua family (Actor I identity)
  1: {
    solar:    ["#28B9AE", "#4FCEC3", "#1E9E95", "#74DDD4", "#178A82", "#3FC3B8"],
    reactor:  ["#22ABA1", "#45C4B9", "#1A928A", "#6AD5CC", "#147F78", "#38BAB0"],
    habitat:  ["#3FC3B8", "#63D3C9", "#2FAFA5", "#88E0D8", "#259A91", "#4CCABF"],
    rover:    ["#1FA79D", "#40BEB4", "#188C84", "#63D0C6", "#137A73", "#33B4AA"],
    score:    ["#28B9AE"],
    violation:["#1A8F86"],
  },
  // Player 2 -- orange / amber family (Actor II identity)
  2: {
    solar:    ["#F0902E", "#F6A855", "#D67A1E", "#FABE7C", "#B86718", "#EE9C42"],
    reactor:  ["#EC8626", "#F4A048", "#D2721A", "#F8B66E", "#B25F14", "#E9933A"],
    habitat:  ["#E88020", "#F29A44", "#CE6C16", "#F6B266", "#AE5A12", "#E58E34"],
    rover:    ["#F49A3C", "#F8B060", "#DC842A", "#FBC486", "#C0701E", "#F1A64E"],
    score:    ["#F0902E"],
    violation:["#D67A1E"],
  },
};
const hexToRgba = (hex, alpha = 1) => {
  const h = hex.replace("#", "");
  const bigint = parseInt(h.length === 3 ? h.split("").map(ch => ch + ch).join("") : h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
};
const seriesColor = (playerId, type = "score", assetIdx = 1, alpha = 1) => {
  const paletteSet = PLAYER_PALETTES[playerId] || {};
  const palette = paletteSet[type] || ["#C0B8E8"];
  const hex = palette[(Math.max(1, assetIdx) - 1) % palette.length];
  return hexToRgba(hex, alpha);
};
const consumerPowerSeriesMap = new Map();
const generatorPowerSeriesMap = new Map();

const ensureSeries = (map, key, meta, frameCount) => {
  if (!map.has(key)) map.set(key, { key, data: new Array(frameCount).fill(null), ...meta });
  return map.get(key);
};

frames.forEach((frame, frameIdx) => {
  [frame.p1, frame.p2].forEach((player, pi) => {
    if (!player) return;
    const playerId = pi + 1;
    (player.panels || []).forEach((panel, idx) => {
      const key = `P${playerId}-solar-${idx+1}`;
      const series = ensureSeries(generatorPowerSeriesMap, key, {
        label: `P${playerId} Solar ${idx+1}`,
        color: seriesColor(playerId, "solar", idx + 1, 0.95),
        playerId,
        assetIdx: idx + 1,
      }, frames.length);
      series.data[frameIdx] = player.generatorSupplyTotals?.[`solar-${idx}`] ?? 0;
    });
    (player.reactors || []).forEach((reactor, idx) => {
      const key = `P${playerId}-reactor-${idx+1}`;
      const series = ensureSeries(generatorPowerSeriesMap, key, {
        label: `P${playerId} Reactor ${idx+1}`,
        color: seriesColor(playerId, "reactor", idx + 1, 0.95),
        playerId,
        assetIdx: idx + 1,
      }, frames.length);
      series.data[frameIdx] = player.generatorSupplyTotals?.[`reactor-${idx}`] ?? 0;
    });
    (player.habitats || []).forEach((habitat, idx) => {
      const key = `P${playerId}-habitat-${idx+1}`;
      const series = ensureSeries(consumerPowerSeriesMap, key, {
        label: `P${playerId} Habitat ${idx+1}`,
        color: seriesColor(playerId, "habitat", idx + 1, 0.9),
        playerId,
        assetIdx: idx + 1,
      }, frames.length);
      series.data[frameIdx] = player.habitatPower?.[idx] ?? 0;
    });
    const roverEntries = [player, ...((player.extraRovers || []))];
    roverEntries.forEach((rover, idx) => {
      const key = `P${playerId}-rover-${idx+1}`;
      const series = ensureSeries(consumerPowerSeriesMap, key, {
        label: `P${playerId} Rover ${idx+1}`,
        color: seriesColor(playerId, "rover", idx + 1, 1),
        playerId,
        assetIdx: idx + 1,
      }, frames.length);
      series.data[frameIdx] = rover?.power ?? null;
    });
  });
});

const consumerPowerSeries = [...consumerPowerSeriesMap.values()].sort((a, b) =>
  a.playerId - b.playerId || a.assetIdx - b.assetIdx
);
const generatorPowerSeries = [...generatorPowerSeriesMap.values()].sort((a, b) =>
  a.playerId - b.playerId || a.assetIdx - b.assetIdx
);

const roverIceMap = new Map();
const roverIceTotals = {};
const ensureRoverIceSeries = (playerId, roverId) => {
  const key = `P${playerId}-rover-${roverId}`;
  if (!roverIceMap.has(key)) {
    roverIceMap.set(key, {
      key,
      label: `P${playerId} Rover ${roverId}`,
      color: seriesColor(playerId, "rover", roverId, 1),
      playerId,
      assetIdx: roverId,
      data: new Array(frames.length).fill(null),
    });
  }
  return key;
};
let logCursor = 0;
frames.forEach((frame, frameIdx) => {
  [frame.p1, frame.p2].forEach((player, pi) => {
    if (!player) return;
    const playerId = pi + 1;
    const roverCount = 1 + ((player.extraRovers || []).length);
    for (let roverId = 1; roverId <= roverCount; roverId++) {
      const key = ensureRoverIceSeries(playerId, roverId);
      if (roverIceTotals[key] == null) roverIceTotals[key] = 0;
      roverIceMap.get(key).data[frameIdx] = roverIceTotals[key];
    }
  });
  while (logCursor < log.length && logCursor < (frame.logLength || 0)) {
    const ev = log[logCursor];
    if (ev?.type === "mine" && ev.actor && ev.roverId) {
      const key = ensureRoverIceSeries(ev.actor, ev.roverId);
      roverIceTotals[key] = (roverIceTotals[key] || 0) + (ev.kg || 0);
      roverIceMap.get(key).data[frameIdx] = roverIceTotals[key];
    }
    logCursor += 1;
  }
});
const roverIceSeries = [...roverIceMap.values()].sort((a, b) =>
  a.playerId - b.playerId || a.assetIdx - b.assetIdx
);

const roverDeliveredMap = new Map();
const roverDeliveredTotals = {};
const ensureRoverDeliveredSeries = (playerId, roverId) => {
  const key = `P${playerId}-delivered-rover-${roverId}`;
  if (!roverDeliveredMap.has(key)) {
    roverDeliveredMap.set(key, {
      key,
      label: `P${playerId} Rover ${roverId}`,
      color: seriesColor(playerId, "rover", roverId, 1),
      playerId,
      assetIdx: roverId,
      data: new Array(frames.length).fill(null),
    });
  }
  return key;
};
let deliveredLogCursor = 0;
frames.forEach((frame, frameIdx) => {
  [frame.p1, frame.p2].forEach((player, pi) => {
    if (!player) return;
    const playerId = pi + 1;
    const roverCount = 1 + ((player.extraRovers || []).length);
    for (let roverId = 1; roverId <= roverCount; roverId++) {
      const key = ensureRoverDeliveredSeries(playerId, roverId);
      if (roverDeliveredTotals[key] == null) roverDeliveredTotals[key] = 0;
      roverDeliveredMap.get(key).data[frameIdx] = roverDeliveredTotals[key];
    }
  });
  while (deliveredLogCursor < log.length && deliveredLogCursor < (frame.logLength || 0)) {
    const ev = log[deliveredLogCursor];
    if (ev?.type === "deposit" && ev.actor && ev.roverId) {
      const key = ensureRoverDeliveredSeries(ev.actor, ev.roverId);
      roverDeliveredTotals[key] = (roverDeliveredTotals[key] || 0) + (ev.kg || 0);
      roverDeliveredMap.get(key).data[frameIdx] = roverDeliveredTotals[key];
    }
    deliveredLogCursor += 1;
  }
});
const roverDeliveredSeries = [...roverDeliveredMap.values()].sort((a, b) =>
  a.playerId - b.playerId || a.assetIdx - b.assetIdx
);

const roverMoveMap = new Map();
const ensureRoverMoveSeries = (playerId, roverId) => {
  const key = `P${playerId}-move-rover-${roverId}`;
  if (!roverMoveMap.has(key)) {
    roverMoveMap.set(key, {
      key,
      label: `P${playerId} Rover ${roverId}`,
      color: seriesColor(playerId, "rover", roverId, 1),
      playerId,
      assetIdx: roverId,
      data: new Array(frames.length).fill(null),
    });
  }
  return roverMoveMap.get(key);
};
const roverMoveTotals = {};
frames.forEach((frame, frameIdx) => {
  [frame.p1, frame.p2].forEach((player, pi) => {
    if (!player) return;
    const playerId = pi + 1;
    const rovers = [player, ...((player.extraRovers || []))];
    rovers.forEach((rover, idx) => {
      const roverId = idx + 1;
      const key = `P${playerId}-move-rover-${roverId}`;
      const series = ensureRoverMoveSeries(playerId, roverId);
      if (roverMoveTotals[key] == null) roverMoveTotals[key] = 0;
      if (frameIdx > 0) {
        const prevPlayer = playerId === 1 ? frames[frameIdx - 1]?.p1 : frames[frameIdx - 1]?.p2;
        const prevRover = idx === 0 ? prevPlayer : (prevPlayer?.extraRovers || [])[idx - 1];
        if (prevRover && rover) {
          roverMoveTotals[key] += dist({ x: prevRover.x, y: prevRover.y }, { x: rover.x, y: rover.y }) / PIXELS_PER_KM;
        }
      }
      series.data[frameIdx] = roverMoveTotals[key];
    });
  });
});
const roverMoveSeries = [...roverMoveMap.values()].sort((a, b) =>
  a.playerId - b.playerId || a.assetIdx - b.assetIdx
);

const STATUS_ORDER = ["idle_nopsr", "idle", "moving", "mining", "carrying", "depositing", "depleted"];
const statusToValue = Object.fromEntries(STATUS_ORDER.map((s, i) => [s, i]));
const roverStateMap = new Map();
const ensureRoverStateSeries = (playerId, roverId) => {
  const key = `P${playerId}-state-rover-${roverId}`;
  if (!roverStateMap.has(key)) {
    roverStateMap.set(key, {
      key,
      label: `P${playerId} Rover ${roverId}`,
      color: seriesColor(playerId, "rover", roverId, 1),
      playerId,
      assetIdx: roverId,
      data: new Array(frames.length).fill(null),
    });
  }
  return roverStateMap.get(key);
};
frames.forEach((frame, frameIdx) => {
  [frame.p1, frame.p2].forEach((player, pi) => {
    if (!player) return;
    const playerId = pi + 1;
    const rovers = [player, ...((player.extraRovers || []))];
    rovers.forEach((rover, idx) => {
      const series = ensureRoverStateSeries(playerId, idx + 1);
      const status = rover?.status || "idle";
      series.data[frameIdx] = statusToValue[status] ?? statusToValue.idle;
    });
  });
});
const roverStateSeries = [...roverStateMap.values()].sort((a, b) =>
  a.playerId - b.playerId || a.assetIdx - b.assetIdx
);

const scoreSeries = [
  { key:"score-p1", label:"P1 Score", color:seriesColor(1, "score", 1, 1), data:frames.map(f => scorePlayerState(f.p1)) },
  { key:"score-p2", label:"P2 Score", color:seriesColor(2, "score", 1, 1), data:frames.map(f => scorePlayerState(f.p2)) },
];
const budgetSeries = [
  { key:"budget-p1", label:"P1 Remaining Credits", color:seriesColor(1, "score", 1, 1), data:frames.map(f => f.p1?.budget ?? 0) },
  { key:"budget-p2", label:"P2 Remaining Credits", color:seriesColor(2, "score", 1, 1), data:frames.map(f => f.p2?.budget ?? 0) },
];
const cumCreditsSeries = [
  { key:"cumcredits-p1", label:"P1 Cumulative Credits", color:seriesColor(1, "score", 1, 1), data:frames.map(f => (f.history || []).reduce((sum, h) => sum + (h.bud1 || 0), 0)) },
  { key:"cumcredits-p2", label:"P2 Cumulative Credits", color:seriesColor(2, "score", 1, 1), data:frames.map(f => (f.history || []).reduce((sum, h) => sum + (h.bud2 || 0), 0)) },
];
const violationSeries = [
  { key:"vio-p1", label:"P1 Violations", color:seriesColor(1, "violation", 1, 1), data:frames.map(f => f.p1?.safetyViolations ?? 0) },
  { key:"vio-p2", label:"P2 Violations", color:seriesColor(2, "violation", 1, 1), data:frames.map(f => f.p2?.safetyViolations ?? 0) },
];
const sharedSeries = [
  { key:"shared", label:"Shared Grid", color:"#C0B8E8", data:frames.map(f => f.powerGridState?.mode === "shared" ? 1 : 0) },
];
const p1SupplyAllocationSeries = [
  { key:"p1-to-p1", label:"P1 Generators → P1 Assets", color:seriesColor(1, "solar", 1, 1), data:frames.map(f => f.p1?.generatorSupplyByRecipient?.[1] ?? 0) },
  { key:"p1-to-p2", label:"P1 Generators → P2 Assets", color:"#C0B8E8", data:frames.map(f => f.p1?.generatorSupplyByRecipient?.[2] ?? 0) },
];
const p2SupplyAllocationSeries = [
  { key:"p2-to-p1", label:"P2 Generators → P1 Assets", color:"#C0B8E8", data:frames.map(f => f.p2?.generatorSupplyByRecipient?.[1] ?? 0) },
  { key:"p2-to-p2", label:"P2 Generators → P2 Assets", color:seriesColor(2, "solar", 1, 1), data:frames.map(f => f.p2?.generatorSupplyByRecipient?.[2] ?? 0) },
];
const structureHealthMap = new Map();
const ensureHealthSeries = (playerId, type, assetIdx) => {
  const key = `P${playerId}-${type}-health-${assetIdx}`;
  const healthTypeMeta = {
    panels: { label: "Solar Panel", colorType: "solar" },
    reactors: { label: "Nuclear Reactor", colorType: "reactor" },
    habitats: { label: "Habitat", colorType: "habitat" },
    extraRovers: { label: "Rover", colorType: "rover" },
    landingPads: { label: "Landing Pad", colorType: "reactor" },
  };
  const meta = healthTypeMeta[type] || { label: type, colorType: "solar" };
  if (!structureHealthMap.has(key)) {
    structureHealthMap.set(key, {
      key,
      label: `P${playerId} ${meta.label} ${assetIdx}`,
      color: seriesColor(playerId, meta.colorType, assetIdx, 1),
      playerId,
      assetIdx,
      data: new Array(frames.length).fill(null),
    });
  }
  return structureHealthMap.get(key);
};
frames.forEach((frame, frameIdx) => {
  [frame.p1, frame.p2].forEach((player, pi) => {
    if (!player) return;
    const playerId = pi + 1;
    const groups = [
      ["panels", player.panels || [], player.structureHealth?.panels || []],
      ["reactors", player.reactors || [], player.structureHealth?.reactors || []],
      ["habitats", player.habitats || [], player.structureHealth?.habitats || []],
      ["extraRovers", player.extraRovers || [], player.structureHealth?.extraRovers || []],
      ["landingPads", player.landingPads || [], player.structureHealth?.landingPads || []],
    ];
    groups.forEach(([type, list, healths]) => {
      list.forEach((_, idx) => {
        const series = ensureHealthSeries(playerId, type, idx + 1);
        series.data[frameIdx] = (healths[idx] ?? 1) * 100;
      });
    });
  });
});
const structureHealthSeries = [...structureHealthMap.values()].sort((a, b) =>
  a.playerId - b.playerId || a.label.localeCompare(b.label)
);

const purchaseSeriesMap = new Map();
const purchaseLabels = ["Solar Panel", "Nuclear Reactor", "Habitat", "Rover", "Landing Pad"];
const resupplyLabels = ["No Resupply", "Resupply"];
let purchaseCursor = 0;
const addPointSeries = (map, prefix, ev, idx, colorType, customLabel) => {
  const key = `${prefix}-${idx}`;
  const label = customLabel || ev.label || `P${ev.actor} ${structureLabel(ev.itemType)} ${idx + 1}`;
  map.set(key, {
    key,
    label,
    color: seriesColor(ev.actor || 1, colorType, idx + 1, 1),
    playerId: ev.actor || 1,
    assetIdx: idx + 1,
    data: new Array(frames.length).fill(null),
    pointOnly: true,
  });
  return map.get(key);
};
frames.forEach((frame, frameIdx) => {
  while (purchaseCursor < log.length && purchaseCursor < (frame.logLength || 0)) {
    const ev = log[purchaseCursor];
    if (ev?.type === "purchase" && ev.itemType) {
      if (ev.itemType === "resupply") {
        // handled below as a single baseline-plus-spike series
      } else {
        const typeKey = ev.itemType === "solar" ? "solar" : ev.itemType === "reactor" ? "reactor" : ev.itemType === "habitat" ? "habitat" : "rover";
        const series = addPointSeries(
          purchaseSeriesMap,
          "purchase",
          ev,
          purchaseSeriesMap.size,
          typeKey,
          `P${ev.actor} ${structureLabel(ev.itemType)}`
        );
        const yValue = { solar:0, reactor:1, habitat:2, rover:3, pad:4 }[ev.itemType] ?? 0;
        series.data[frameIdx] = yValue;
      }
    }
    purchaseCursor += 1;
  }
});
const purchaseSeries = [...purchaseSeriesMap.values()];
const resupplyData = new Array(frames.length).fill(0);
let resupplyLogCursor = 0;
frames.forEach((frame, frameIdx) => {
  while (resupplyLogCursor < log.length && resupplyLogCursor < (frame.logLength || 0)) {
    const ev = log[resupplyLogCursor];
    if (ev?.type === "purchase" && ev.itemType === "resupply") {
      resupplyData[frameIdx] = 1;
    }
    resupplyLogCursor += 1;
  }
});
const resupplySeries = [{
  key: "resupply-timeline",
  label: "Resupply Purchases",
  color: "#C0B8E8",
  playerId: 0,
  assetIdx: 1,
  data: resupplyData,
  spikeOnly: true,
}];

const makePlot = (id, title, series, opts = {}) => {
  const legendCols = opts.legendCols || 3;
  const legendRows = Math.max(1, Math.ceil(Math.max(1, series.length) / legendCols));
  return {
    id,
    title,
    series,
    xLabels,
    yLabel: opts.yLabel || "",
    xLabel: opts.xLabel || "Days",
    booleanPlot: !!opts.booleanPlot,
    categoricalTicks: opts.categoricalTicks || null,
    pointOnly: !!opts.pointOnly,
    tickFormatter: opts.tickFormatter || null,
    legendCols,
    width: 980,
    height: 270 + legendRows * 18,
  };
};

return [
  makePlot("power-state-over-time", "Power State Over Time", consumerPowerSeries, { yLabel:"Power units", legendCols: 4 }),
  makePlot("power-supplied-over-time", "Cumulative Power Supplied Over Time", generatorPowerSeries, { yLabel:"Power units", legendCols: 4 }),
  makePlot("p1-power-supply-allocation", "Cumulative P1 Power Supply Over Time", p1SupplyAllocationSeries, { yLabel:"Power units", legendCols: 2 }),
  makePlot("p2-power-supply-allocation", "Cumulative P2 Power Supply Over Time", p2SupplyAllocationSeries, { yLabel:"Power units", legendCols: 2 }),
  makePlot("ice-by-rover", "Cumulative Ice Mined Over Time By Rover", roverIceSeries, { yLabel:"kg", legendCols: 4 }),
  makePlot("ice-delivered-by-rover", "Cumulative Ice Delivered Over Time By Rover", roverDeliveredSeries, { yLabel:"kg", legendCols: 4 }),
  makePlot("movement-by-rover", "Cumulative Movement By Rover", roverMoveSeries, { yLabel:"km", legendCols: 4 }),
  makePlot("rover-state-over-time", "Rover State Over Time", roverStateSeries, { legendCols: 4, categoricalTicks: STATUS_ORDER.map(key => STATUS_INFO[key]?.label || key) }),
  makePlot("asset-purchases", "Asset Purchases", purchaseSeries, { legendCols: 3, categoricalTicks: purchaseLabels, pointOnly: true }),
  makePlot("resupply-purchases", "Resupply Purchases", resupplySeries, { legendCols: 2, categoricalTicks: resupplyLabels }),
  makePlot("structure-health-over-time", "Structure Health Over Time", structureHealthSeries, { yLabel:"Health %", legendCols: 4, tickFormatter:(v)=>`${Math.round(v)}%` }),
  makePlot("budget-over-time", "Remaining Credits Over Time", budgetSeries, { yLabel:"credits", legendCols: 2, tickFormatter:(v)=>`${Math.round(v)}` }),
  makePlot("cumulative-credits-over-time", "Cumulative Credits Over Time", cumCreditsSeries, { yLabel:"credits", legendCols: 2, tickFormatter:(v)=>`${Math.round(v)}` }),
  makePlot("score-over-time", "Score Over Time", scoreSeries, { legendCols: 2 }),
  makePlot("violations-over-time", "Safety Zone Violations Over Time", violationSeries, { legendCols: 2 }),
  makePlot("shared-status", "Shared Grid Status Over Time", sharedSeries, { booleanPlot: true, legendCols: 1 }),
];
}
