// ── Geometry + math utilities ───────────────────────────────────────────────
// Pure functions, zero dependencies. Used by both the simulation and the
// canvas renderer.

import { W, H, NIGHT_CYCLE, DAYS_PER_ROUND, DEPLETION_RATE, CRATER_REFERENCE_SIZE } from "./constants.js";
import { PSR_MASK, CRATER_DATA } from "./mapData.js";

// Euclidean distance between two {x, y} points.
export const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp  = (a, b, t) => a + (b - a) * t;

// One step of `speed` from `from` toward `to`. Returns the new position
// plus an `arrived` flag if we reached the target this step.
export function stepToward(from, to, speed) {
  const d = dist(from, to);
  if (d <= speed) return { x: to.x, y: to.y, arrived: true };
  const t = speed / d;
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    arrived: false,
  };
}

// Snap (x, y) to the nearest PSR pixel. Spiral search out to r = 400 px.
// Returns the input unchanged if no PSR is found within that range.
export function snapToPSR(x, y) {
  x = Math.round(x);
  y = Math.round(y);
  if (x >= 0 && x < W && y >= 0 && y < H && PSR_MASK[y * W + x]) {
    return { x, y };
  }
  for (let r = 1; r < 400; r++) {
    // top + bottom edges
    for (let dx = -r; dx <= r; dx++) {
      for (const dy of [-r, r]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H && PSR_MASK[ny * W + nx]) {
          return { x: nx, y: ny };
        }
      }
    }
    // left + right edges (excluding corners already covered)
    for (let dy = -r + 1; dy < r; dy++) {
      for (const dx of [-r, r]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H && PSR_MASK[ny * W + nx]) {
          return { x: nx, y: ny };
        }
      }
    }
  }
  return { x, y };
}

// Is it lunar night for non-ridge panels at this global day?
export const isNight = (globalDay) => (globalDay % NIGHT_CYCLE) >= 7;
// v209: days of daylight remaining before the next night phase begins.
// 0 while night is underway. The cycle is deterministic (7 light / 7 dark),
// so rovers can plan around it instead of being surprised by it.
export const daysUntilNight = (globalDay) => {
  const phase = ((globalDay % NIGHT_CYCLE) + NIGHT_CYCLE) % NIGHT_CYCLE;
  return phase >= 7 ? 0 : 7 - phase;
};

// Has the player's placement grace period expired (no incoming-landing damage
// while you're still putting your starting infrastructure down)?
export const hasPlacementGrace = (arrivalDay = 0, globalDay = 0) =>
  globalDay < ((arrivalDay ?? 0) + DAYS_PER_ROUND);

// Total ice yield of a crater at the given depletion rate. Bigger craters
// hold proportionally more.
export const getCraterIceCapacity = (crater, depletionRate = DEPLETION_RATE) =>
  crater.size / (Math.max(1e-6, depletionRate) * CRATER_REFERENCE_SIZE);

// Total ice across all craters on the map, respecting an optional depletion
// override.
export const getTotalMapIce = (po = {}) => {
  const depRate = po.DEPLETION_RATE != null ? po.DEPLETION_RATE : DEPLETION_RATE;
  return CRATER_DATA.reduce((sum, crater) => sum + getCraterIceCapacity(crater, depRate), 0);
};

// Trigger a browser download of a Blob with a given filename. Works around
// the bug where revoking the object URL immediately kills the download in
// Firefox/Safari before the save dialog has registered. Appends the anchor
// to the DOM, clicks it, cleans up after a delay.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try { document.body.removeChild(a); } catch {}
    try { URL.revokeObjectURL(url); } catch {}
  }, 4000);
}
