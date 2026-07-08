#!/usr/bin/env python3
"""
Strip the baked-in legend boxes from the three overlay SVGs:
  overlay_slope.svg, overlay_earth.svg, overlay_sun.svg

Each overlay had a legend box rendered in the top-right outside the disk
(viewBox 0 0 2424 2424, legend at x>=1954). That legend duplicated the
dynamic bottom-right legend in the React UI, creating two competing legends.

Approach: parse each SVG line by line and remove any <rect> or <text>
element that sits in the legend region (x >= 1954). The remaining elements
(the within-disk overlay polygons and the disk clip) are kept verbatim.

The originals are overwritten in place -- the legend strings are not
recoverable from any other source, but the legend SEMANTICS still live in
the React UI's dynamic legend system.
"""

import os
import re
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
MAPS_DIR = os.path.join(PROJECT_ROOT, "public", "maps")

# Files to clean.
TARGETS = ["overlay_slope.svg", "overlay_earth.svg", "overlay_sun.svg"]

# Threshold: elements with x attribute >= 1954 are in the legend region.
LEGEND_X_THRESHOLD = 1954


def strip_legend(svg_text):
    """Remove <rect> and <text> elements whose `x` attribute is >= the
    legend threshold. We do this with a regex over the SVG source, since
    the file structure is line-based and these are self-closed single-line
    elements (verified by inspection -- no multi-line text spans in these
    files). Returns (cleaned_svg, removed_count).
    """
    removed = 0
    out_lines = []
    # Pattern catches <rect ...> and <text ...>...</text> on a single line.
    # The x attribute is always present and is the first numeric attr.
    rect_pat = re.compile(r'<rect\b[^>]*?\bx="([\d.]+)"[^>]*/?>')
    text_pat = re.compile(r'<text\b[^>]*?\bx="([\d.]+)"[^>]*>.*?</text>')

    for line in svg_text.splitlines(keepends=True):
        # Check rect.
        m = rect_pat.search(line)
        if m and float(m.group(1)) >= LEGEND_X_THRESHOLD:
            removed += 1
            continue
        # Check text.
        m = text_pat.search(line)
        if m and float(m.group(1)) >= LEGEND_X_THRESHOLD:
            removed += 1
            continue
        out_lines.append(line)

    return "".join(out_lines), removed


def main():
    for name in TARGETS:
        path = os.path.join(MAPS_DIR, name)
        if not os.path.exists(path):
            print(f"Skipping {name}: not found")
            continue
        with open(path) as f:
            src = f.read()
        cleaned, removed = strip_legend(src)
        if removed == 0:
            print(f"  {name}: no legend elements found (already clean)")
            continue
        with open(path, "w") as f:
            f.write(cleaned)
        print(f"  {name}: removed {removed} legend element(s)")


if __name__ == "__main__":
    main()
