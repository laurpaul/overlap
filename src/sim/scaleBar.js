// ── Map scale bar ───────────────────────────────────────────────────────────
//
// Pure helper behind the bottom-center scale bar (v150). The map container is
// MAP_KM of ground across at zoom=1; at zoom z the same container width shows
// MAP_KM/z of ground, so km-per-screen-px = (MAP_KM/z) / containerWidthPx.
// Given that, we pick a "nice" round distance (1/2/5 x 10^n) whose on-screen
// width lands in a comfortable band, and return the bar width + label to render.
//
// Extracted from the inline render math so it can be unit-tested; behavior is
// identical. Returns null when the inputs can't produce a finite positive scale
// (zero/!finite container width, etc.), which the caller renders as "no bar".

export function scaleBarFor(mapKm, zoom, containerWidthPx, targetPx = 100) {
  const z = zoom || 1;
  const kmPerPx = (mapKm / z) / containerWidthPx;
  if (!isFinite(kmPerPx) || kmPerPx <= 0) return null;

  // Pick a "nice" distance so the bar renders in a comfortable on-screen band.
  const rawKm = targetPx * kmPerPx;
  const mag = Math.pow(10, Math.floor(Math.log10(rawKm)));
  const niceSteps = [1, 2, 5, 10];
  let niceKm = niceSteps[0] * mag;
  for (const step of niceSteps) {
    const candidate = step * mag;
    if (candidate <= rawKm * 1.6) niceKm = candidate;
  }

  const barPx = niceKm / kmPerPx;
  const label =
    niceKm >= 1
      ? `${niceKm % 1 === 0 ? niceKm.toFixed(0) : niceKm.toFixed(1)} km`
      : `${(niceKm * 1000).toFixed(0)} m`;

  return { kmPerPx, rawKm, niceKm, barPx, label };
}
