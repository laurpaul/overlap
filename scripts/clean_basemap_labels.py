#!/usr/bin/env python3
"""
Remove baked-in crater name labels, graticule text labels, and legend
boxes from the raster JPG basemaps.

Why this exists
---------------
The shipped raster basemaps (`basemap_dramatic.jpg`, `basemap_psr_clean.jpg`,
`basemap_rainbow.jpg`) have crater names, graticule labels (85°S, 0°E, etc.),
and in some cases a baked legend box and a partial gradient artifact, all
burned into the pixels. The runtime separately renders these via the dynamic
`CRATER_LABELS` and `GRATICULE_LABELS` overlays, which counter-scale with
zoom. The result was a double set of labels: one too-small fixed set in the
JPG plus a correctly-scaling set in the overlay.

This script generates cleaned copies of the raster basemaps:
  basemap_dramatic.jpg   -> basemap_dramatic_clean.jpg
  basemap_psr_clean.jpg  -> basemap_psr_clean_clean.jpg
  basemap_rainbow.jpg    -> basemap_rainbow_clean.jpg

Approach: for each known label position (from CRATER_LABELS / GRATICULE_LABELS),
paint a bounding rectangle into an inpaint mask. Add the legend boxes /
legend-gradient artifacts at known fixed positions. Inpaint with cv2 to fill
in plausible background pixels using local neighborhood. The graticule LINES
(circles, crosshair) are left alone -- they are useful orientation reference
even though their numeric labels are not.

Provenance preserved: original files are kept on disk. The mapData.js layer
manifest is updated separately to point at the _clean variants.
"""

import os
import sys
import numpy as np
import cv2

# ── Constants ───────────────────────────────────────────────────────────────
# Source map dimensions: 1212x1212 polar-stereographic, centered on 90°S.
W = 1212
H = 1212

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
MAPS_DIR = os.path.join(PROJECT_ROOT, "public", "maps")

# Mirror of CRATER_LABELS from src/sim/mapData.js. If those positions change,
# this list must be updated too. (Could be derived from a JSON in a future
# pass to keep them in sync.)
CRATER_LABELS = [
    ("Shackleton",  622.0,  619.0),
    ("de Gerlache", 515.1,  603.6),
    ("Sverdrup",    648.0,  686.7),
    ("Shoemaker",   687.3,  524.4),
    ("Faustini",    768.9,  588.9),
    ("Haworth",     619.2,  454.9),
    ("Cabeus",      426.3,  354.0),
    ("Nobile",      840.1,  432.7),
    ("Amundsen",    925.1,  565.7),
    ("Idel'son",   1088.5,  790.2),
    ("Slater",      712.1,  547.2),
    ("Malapert",    606.0,  296.5),
    ("Scott",       965.4,  288.0),
    ("Cabeus B",    232.9,  344.7),
    ("Wiechert",    692.4,  928.4),
    ("Kuhn",        575.5, 1042.2),
    ("Ashbrook",    125.0,  810.2),
    ("Hedervari",  1089.3,  555.2),
    ("Nefed'ev",   1034.3,  965.4),
]

# Mirror of GRATICULE_LABELS.
GRATICULE_LABELS = [
    ("85°S",  612.0,  298.6),
    ("87°S",  612.0,  420.0),
    ("89°S",  612.0,  541.4),
    ("0°E",   590.0,  20.0),
    ("90°E",  1157.0, 596.0),
    ("180°E", 586.0,  1197.0),
    ("270°E", 20.0,   596.0),
]


def text_bbox(label, cx, cy):
    """Approximate bounding box for a centered text label at (cx, cy) in
    source-pixel coordinates. Returns (x0, y0, x1, y1).

    The baked labels use a 14-16px sans-serif at the 1212x1212 resolution.
    Width is roughly 13px per character (sans bold; we err generous to
    catch antialiasing fringe and small descender pixels). The labels are
    centered horizontally on the crater centroid and vertically aligned
    to the centroid.
    """
    char_w = 13
    char_h = 22
    pad = 6
    w = len(label) * char_w + pad * 2
    h = char_h + pad * 2
    x0 = int(cx - w / 2)
    y0 = int(cy - h / 2)
    x1 = int(cx + w / 2)
    y1 = int(cy + h / 2)
    return max(0, x0), max(0, y0), min(W, x1), min(H, y1)


def build_label_mask():
    """Binary mask: 1 = inpaint, 0 = leave alone.

    Covers crater names + graticule labels + the bottom-left legend areas
    common to the three rasters. The legend areas vary slightly between
    basemaps; we use a single conservative envelope that covers all three.
    """
    mask = np.zeros((H, W), dtype=np.uint8)

    for label, cx, cy in CRATER_LABELS:
        x0, y0, x1, y1 = text_bbox(label, cx, cy)
        mask[y0:y1, x0:x1] = 255

    for label, cx, cy in GRATICULE_LABELS:
        x0, y0, x1, y1 = text_bbox(label, cx, cy)
        mask[y0:y1, x0:x1] = 255

    # Bottom-left legend region (in 1212-px source coords). The baked
    # "Dramatic Relief" legend in basemap_dramatic.jpg actually occupies
    # approximately (10, 1075) to (400, 1190) at 1212 source-pixel coords --
    # the JPG is shipped at 2424×2424 and the inspect-crop showed the box
    # ending at y≈1185. The rainbow and psr_clean basemaps also have a
    # legend artifact that occupies less area, but we use a single
    # conservative envelope that covers the largest case.
    mask[1075:1195, 0:410] = 255

    return mask


def clean_basemap(in_path, out_path, mask):
    """Remove baked labels without smearing the underlying terrain.

    Baked-in text labels are white pixels overlaying real terrain pixels.
    A direct inpaint (cv2.INPAINT_TELEA) fills the label rectangle with
    smeared nearest-neighbor averages — visually obvious as "ghost" boxes.
    A better technique: in the label region, identify only the bright text
    pixels (above local median + threshold) and inpaint THOSE narrowly.
    Terrain pixels around the text are left alone. The result preserves
    underlying texture and only removes the typographic glyphs.

    For the bottom-left legend box (large rectangular region) we inpaint
    the whole thing -- the area is mostly graphics/text, no useful terrain
    underneath. We use INPAINT_NS (Navier-Stokes) for large regions; it
    handles wider fills with more natural-looking diffusion than TELEA.
    """
    if not os.path.exists(in_path):
        print(f"  Skipping {in_path}: not found")
        return False
    img = cv2.imread(in_path, cv2.IMREAD_COLOR)
    if img is None:
        print(f"  Could not read {in_path}")
        return False
    h, w = img.shape[:2]
    if (w, h) != (W, H):
        scaled_mask = cv2.resize(mask, (w, h), interpolation=cv2.INTER_NEAREST)
    else:
        scaled_mask = mask

    # ── Split the mask into "label text" (everywhere except the legend
    # box) and "legend box" (the bottom-left rectangle). The legend box
    # uses a different inpaint strategy from the text labels.
    legend_mask = np.zeros_like(scaled_mask)
    # Match the same envelope used in build_label_mask().
    ly0, ly1 = int(1075 * h / H), int(1195 * h / H)
    lx0, lx1 = 0, int(410 * w / W)
    legend_mask[ly0:ly1, lx0:lx1] = scaled_mask[ly0:ly1, lx0:lx1]
    text_mask = scaled_mask.copy()
    text_mask[ly0:ly1, lx0:lx1] = 0

    # ── Narrow the text mask to label-ish pixels. Baked labels are white
    # text with a black drop-shadow stroke, so we detect BOTH high-contrast
    # bright pixels AND high-contrast dark pixels relative to local mean.
    # Combining catches the full glyph (white core + dark halo) without
    # eating into the smoothly-varying terrain underneath.
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (51, 51), 0)
    diff = gray.astype(np.int16) - blurred.astype(np.int16)
    high_contrast = ((diff > 25) | (diff < -25)).astype(np.uint8) * 255
    # Restrict to the candidate-label region.
    text_only = cv2.bitwise_and(high_contrast, text_mask)
    # Dilate substantially so connected glyph components merge into solid
    # blobs covering whole words (inpaint then fills the full word area).
    kernel = np.ones((3, 3), np.uint8)
    text_only = cv2.dilate(text_only, kernel, iterations=4)
    # Morphological close to fuse adjacent glyphs in a word.
    close_kernel = np.ones((5, 5), np.uint8)
    text_only = cv2.morphologyEx(text_only, cv2.MORPH_CLOSE, close_kernel)

    # ── Inpaint text pixels with NS (larger radius produces more natural-
    # looking infill on terrain backgrounds than TELEA for these word-
    # sized blobs).
    intermediate = cv2.inpaint(img, text_only, 5, cv2.INPAINT_NS)
    # ── Inpaint the legend box with Navier-Stokes (wider fills).
    cleaned = cv2.inpaint(intermediate, legend_mask, 7, cv2.INPAINT_NS)

    cv2.imwrite(out_path, cleaned, [cv2.IMWRITE_JPEG_QUALITY, 92])
    print(f"  Wrote {out_path}")
    return True


def main():
    mask = build_label_mask()
    print(f"Label mask: {mask.sum() // 255} masked pixels "
          f"({100 * mask.sum() / 255 / mask.size:.2f}% of image)")

    # v51: `basemap_psr_clean.jpg` is no longer cleaned via inpainting --
    # the central crater cluster has terrain too varied for the inpaint to
    # erase labels without visible ghosting. It is now regenerated from
    # scratch by scripts/gen_basemap_psr_clean.py, which composites the
    # cleaned dramatic basemap + the binary PSR mask. Do not add it back
    # to this list -- doing so would overwrite the cleanly-regenerated
    # output with the ghosted inpaint version.
    targets = [
        ("basemap_dramatic.jpg",  "basemap_dramatic_clean.jpg"),
        ("basemap_rainbow.jpg",   "basemap_rainbow_clean.jpg"),
    ]
    for src_name, dst_name in targets:
        src = os.path.join(MAPS_DIR, src_name)
        dst = os.path.join(MAPS_DIR, dst_name)
        print(f"\nProcessing {src_name}:")
        clean_basemap(src, dst, mask)


if __name__ == "__main__":
    main()
