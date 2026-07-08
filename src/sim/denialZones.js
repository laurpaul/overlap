// ── Effective-denial-zone metric (shrink-to-expand) ─────────────────────────
//
// Reviewer's mechanic: a bloc can shrink each member's individual safety zone
// (every actor looks more proportionate and cooperative) while GROWING the
// bloc's combined footprint, by tiling the smaller zones adjacently instead of
// stacking large overlapping ones. The individual buffers contract; the union
// of them, the territory actually denied to outsiders, expands. It is a
// cooperative-looking land grab, and the point of this module is to make it
// measurable so the facilitator can show the room the difference between
// "each of us buffered less" (the optics) and "together we denied more" (the
// reality).
//
// A zone is { x, y, r } where r is the effective safety radius
// (base radius x the actor's safetyMult). All areas are in board units^2.

// Deterministic union area of a set of circles by uniform grid sampling over
// the bounding box. No RNG, so tests are stable; resolution trades accuracy for
// speed. Returns 0 for an empty set.
export function circleUnionArea(circles, samplesPerAxis = 240) {
  const cs = (circles || []).filter((c) => c && c.r > 0);
  if (cs.length === 0) return 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of cs) {
    minX = Math.min(minX, c.x - c.r); maxX = Math.max(maxX, c.x + c.r);
    minY = Math.min(minY, c.y - c.r); maxY = Math.max(maxY, c.y + c.r);
  }
  const w = maxX - minX, h = maxY - minY;
  if (w <= 0 || h <= 0) return 0;
  const nx = samplesPerAxis, ny = samplesPerAxis;
  const cellW = w / nx, cellH = h / ny;
  const cellArea = cellW * cellH;
  let covered = 0;
  for (let i = 0; i < nx; i++) {
    const px = minX + (i + 0.5) * cellW;
    for (let j = 0; j < ny; j++) {
      const py = minY + (j + 0.5) * cellH;
      for (let k = 0; k < cs.length; k++) {
        const c = cs[k];
        const dx = px - c.x, dy = py - c.y;
        if (dx * dx + dy * dy <= c.r * c.r) { covered++; break; }
      }
    }
  }
  return covered * cellArea;
}

// Sum of the individual zone areas (what each actor "shows" as its own buffer).
export function individualZoneArea(zones) {
  return (zones || []).reduce((s, z) => s + (z.r > 0 ? Math.PI * z.r * z.r : 0), 0);
}

// Core metric for a bloc's set of zones.
//   individualArea, sum of each member's own circle (shrinks when buffers shrink)
//   footprintArea , area of the UNION (the territory actually denied to outsiders)
//   overlapWasted , individualArea - footprintArea (coverage lost to stacking)
//   tilingEfficiency, footprintArea / individualArea in [0,1]; ~1 = perfectly
//                      tiled (no wasted overlap), low = large zones piled up
export function blocDenialMetrics(zones, samplesPerAxis = 240) {
  const individualArea = individualZoneArea(zones);
  const footprintArea = circleUnionArea(zones, samplesPerAxis);
  const overlapWasted = Math.max(0, individualArea - footprintArea);
  const tilingEfficiency = individualArea > 0 ? footprintArea / individualArea : 0;
  return { count: (zones || []).length, individualArea, footprintArea, overlapWasted, tilingEfficiency };
}

// Compare a "before" bloc layout (large individual buffers, typically stacked)
// against an "after" layout (each member shrank its buffer AND the bloc spread
// them out). The shrink-to-expand signature is: every actor's own buffer got
// smaller, yet the bloc's denied footprint got bigger.
export function shrinkToExpand(before, after, samplesPerAxis = 240) {
  const b = blocDenialMetrics(before, samplesPerAxis);
  const a = blocDenialMetrics(after, samplesPerAxis);
  const individualShrank = a.individualArea < b.individualArea;
  const footprintGrew = a.footprintArea > b.footprintArea;
  return {
    before: b,
    after: a,
    individualShrank,
    footprintGrew,
    // true when each member looks MORE proportionate while the bloc denies MORE.
    isShrinkToExpand: individualShrank && footprintGrew,
    individualDelta: a.individualArea - b.individualArea,
    footprintDelta: a.footprintArea - b.footprintArea,
  };
}
