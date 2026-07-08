#!/usr/bin/env python3
"""
Generate a graticule-free version of `psr_mask.jpg`.

Why this exists
---------------
`psr_mask.jpg` has the polar graticule baked in: the 0°/90°/180°/270°
meridian/parallel lines, plus the 80°S, 87°S, 89°S circles. The graticule
pixels sit at luminance ~115, just under the 128 PSR-classification
threshold used by `extractCratersFromPSR` in src/sim/mapData.js. So today
the graticule does NOT cause false-positive PSR classification, and audit
script confirms 0 spurious PSR component mergers.

That said, this is a latent fragility:
  - if anyone lowers the threshold (say, to 100 or 110), the graticule
    immediately becomes a giant connected component that merges every
    PSR it touches into one.
  - even at the current threshold, the antialiased graticule-PSR
    crossings create slight notches in real PSR edges that complicate
    rim-detection algorithms downstream.

This script removes the graticule from the mask deterministically. It
detects the graticule by its structure (narrow axis-aligned ribbon, mid-
luminance ~80-160, present on the 4 cardinal radii AND on the 3 polar
circles), and zeroes out any pixel matching that description that is NOT
already a confirmed PSR (luminance >= 200).

Output
------
public/maps/psr_mask_clean.png -- graticule-free mask. mapData.js gets
re-pointed to this. The legacy `psr_mask.jpg` stays on disk for reference.
Saved as PNG (not JPG) because JPG re-encoding of the cleaned mask
introduces faint compression-artifact rings at the original graticule
positions -- not a runtime problem (well under threshold) but visually
defeats the cleanup. PNG preserves the cleaned pixels exactly.

Verification: after this runs, the number of large (>=6 px) connected
components extracted at threshold=128 should be UNCHANGED from the
original, since the graticule was already sub-threshold. The benefit is
purely defensive -- robust to future threshold tweaks and downstream
analysis that operates on the mid-luminance band.
"""

import os
import numpy as np
from PIL import Image
from scipy import ndimage

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
MAPS_DIR = os.path.join(PROJECT_ROOT, "public", "maps")

# Map source dimensions and projection geometry.
W, H = 1212, 1212
CX, CY = 606.0, 606.0    # disk center
EDGE_RADIUS = 590.0       # radius of the 80°S boundary circle in source-px
# Polar parallels (concentric circles around CX, CY) in source-pixel radii.
# Derived from: r_px = EDGE_RADIUS * (90 - lat_deg) / 10
# 80°S -> 590, 85°S -> 295, 87°S -> 177, 89°S -> 59
PARALLEL_RADII = [590, 295, 177, 59]
# Tolerance bands around each graticule line, in pixels. Narrow enough to
# avoid eroding real PSR edges, wide enough to catch the antialiased line.
LINE_HALFWIDTH = 2.0
# Luminance bounds for "graticule pixel": bright enough to be intentional
# but dark enough to not be a real PSR.
GRATICULE_LUM_MIN = 70
GRATICULE_LUM_MAX = 200   # keep this safely under any real PSR (>=200)
# Confirmed-PSR threshold: a pixel this bright is never zeroed even if it
# falls inside a graticule band (handles meridian-crosses-real-PSR case).
PSR_PROTECT_LUM = 200


def build_graticule_mask():
    """Build a binary mask (1 = graticule pixel candidate, 0 = not). The
    mask is purely geometric -- no luminance check yet. We mark every
    pixel within `LINE_HALFWIDTH` of any of the known graticule lines:

      - 4 cardinal radii: meridian (vertical at x=CX), antimeridian
        (same line, lower half), 90°E parallel (horizontal at y=CY),
        and 270°E (same line, left half). In a polar-stereographic
        projection from above, the meridian is the vertical line and
        the 90°/270° pair is the horizontal line. Two lines total.
      - 3+ concentric circles at PARALLEL_RADII.
    """
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    dx = xs - CX
    dy = ys - CY
    r = np.sqrt(dx * dx + dy * dy)

    # Cardinal radii: vertical (|dx| <= halfwidth) AND horizontal (|dy| <=
    # halfwidth), but ONLY inside the 80°S disk (outside is junk anyway).
    inside_disk = r <= EDGE_RADIUS + 4
    vertical = (np.abs(dx) <= LINE_HALFWIDTH) & inside_disk
    horizontal = (np.abs(dy) <= LINE_HALFWIDTH) & inside_disk

    # Concentric circles: pixels with |r - r_target| <= halfwidth.
    circles = np.zeros_like(r, dtype=bool)
    for r_target in PARALLEL_RADII:
        circles |= np.abs(r - r_target) <= LINE_HALFWIDTH

    return (vertical | horizontal | circles)


def main():
    in_path = os.path.join(MAPS_DIR, "psr_mask.jpg")
    out_path = os.path.join(MAPS_DIR, "psr_mask_clean.png")

    print(f"Reading {in_path}")
    img = np.asarray(Image.open(in_path).convert("L")).astype(np.float32)
    if img.shape != (H, W):
        raise SystemExit(f"Unexpected shape {img.shape}, expected ({H}, {W})")

    n_above_threshold_before = int((img > 128).sum())
    print(f"  Source: shape={img.shape}, max={int(img.max())}, "
          f"pixels > 128: {n_above_threshold_before}")

    # Build graticule candidate mask
    grat_geom = build_graticule_mask()
    n_geom = int(grat_geom.sum())
    print(f"  Graticule geometric mask: {n_geom} pixels "
          f"({100*n_geom/img.size:.2f}% of image)")

    # Of those, the ones that look like graticule line pixels (mid-luminance)
    # AND are not confirmed PSR.
    grat_lum = (
        grat_geom
        & (img >= GRATICULE_LUM_MIN)
        & (img <= GRATICULE_LUM_MAX)
        & (img < PSR_PROTECT_LUM)
    )
    n_clear = int(grat_lum.sum())
    print(f"  Pixels to clear (geometric AND mid-luminance, NOT in real PSR): "
          f"{n_clear}")

    # Build cleaned image: graticule pixels set to background (0).
    cleaned = img.copy()
    cleaned[grat_lum] = 0.0

    # Sanity check: the count of confirmed-PSR pixels (>= PSR_PROTECT_LUM)
    # must be unchanged.
    psr_before = int((img >= PSR_PROTECT_LUM).sum())
    psr_after = int((cleaned >= PSR_PROTECT_LUM).sum())
    if psr_after != psr_before:
        raise SystemExit(
            f"REGRESSION: confirmed-PSR pixel count changed "
            f"({psr_before} -> {psr_after}). Aborting."
        )
    print(f"  PSR-protected pixel count unchanged: {psr_before}")

    # Sanity check: component count at threshold 128 should be unchanged
    # (the graticule was already sub-threshold). Verify and report.
    mask_before = (img > 128).astype(np.uint8)
    mask_after = (cleaned > 128).astype(np.uint8)
    structure = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], dtype=np.uint8)
    _, n_before = ndimage.label(mask_before, structure=structure)
    _, n_after = ndimage.label(mask_after, structure=structure)
    print(f"  Connected components at thr=128: {n_before} -> {n_after} "
          f"({n_after - n_before:+d})")

    # ALSO check at a hypothetical lowered threshold (say, 110) to see the
    # value of this cleanup. The graticule at ~115 would merge components
    # at threshold 110 in the OLD mask.
    mask_before_110 = (img > 110).astype(np.uint8)
    mask_after_110 = (cleaned > 110).astype(np.uint8)
    _, n_before_110 = ndimage.label(mask_before_110, structure=structure)
    _, n_after_110 = ndimage.label(mask_after_110, structure=structure)
    print(f"  Connected components at thr=110: {n_before_110} -> {n_after_110} "
          f"({n_after_110 - n_before_110:+d}) "
          f"<- defensive benefit if threshold ever lowered")

    # Save cleaned mask as PNG (not JPG). The mask is essentially binary
    # plus the original JPG quantization noise; JPG re-encoding would
    # create faint compression-artifact rings at graticule positions
    # that defeat the cleanup. PNG preserves the cleaned pixels exactly.
    # mapData.js's loadImagePixels uses an HTMLImageElement + canvas
    # which is format-agnostic, so the runtime cares not at all.
    out_img = Image.fromarray(cleaned.astype(np.uint8), mode="L")
    out_img.save(out_path, optimize=True)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
