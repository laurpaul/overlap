#!/usr/bin/env python3
# gen_topo_bw.py -- generate the clean B&W topographic basemap (v69).
#
# Produces public/maps/basemap_topo_bw.jpg (2424x2424) and a 1x fallback from
# the real LOLA south-polar shaded relief already in the project. Steps:
# de-tint to grayscale, detect+inpaint the burned-in graticule from brightness
# profiles, de-band, gentle local contrast, rim-sharpen, neutral-fill outside
# the polar disk. Run from anywhere; it chdir's into public/maps.
#
# To swap in a freshly downloaded LOLA DEM later: drop the GeoTIFF in, set SRC
# to it, replace the de-tint with a direct elevation->hillshade, keep the rest.
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "maps"))

import numpy as np, cv2
from PIL import Image

N = 2424
SRC = "basemap_dramatic_clean.jpg"   # real LOLA shaded relief (south pole)

def load_gray(p, w=N):
    im = Image.open(p).convert("RGB").resize((w, w), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32) / 255.0
    return 0.30*a[...,0] + 0.45*a[...,1] + 0.25*a[...,2]

yy, xx = np.mgrid[0:N, 0:N]
cx = cy = N/2; R = N/2 - 2
disk = ((xx-cx)**2 + (yy-cy)**2) <= R*R

def graticule_mask():
    g8 = np.clip(load_gray(SRC)*255,0,255).astype(np.uint8)
    th = cv2.morphologyEx(g8, cv2.MORPH_TOPHAT,
                          cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(7,7))).astype(np.float32)
    m = np.zeros((N, N), np.uint8)
    # Detect the cross: the graticule's cardinal radii are the column / row
    # with anomalously high tophat brightness over their whole length.
    col = th.sum(0); row = th.sum(1)
    cth = col.mean() + 3.5*col.std(); rth = row.mean() + 3.5*row.std()
    for x in np.where(col > cth)[0]:
        cv2.line(m, (int(x), 0), (int(x), N), 255, 1)
    for y in np.where(row > rth)[0]:
        cv2.line(m, (0, int(y)), (N, int(y)), 255, 1)
    # Concentric circles + label ghosts: long thin bright structures. Isolate
    # them with directional opens (terrain blobs are not long+thin) + a plain
    # tophat threshold for the rest.
    t8 = (th).astype(np.uint8)
    horiz = cv2.morphologyEx(t8, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT,(41,1)))
    vert  = cv2.morphologyEx(t8, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT,(1,41)))
    m = cv2.bitwise_or(m, ((horiz>20).astype(np.uint8))*255)
    m = cv2.bitwise_or(m, ((vert >20).astype(np.uint8))*255)
    m = cv2.bitwise_or(m, ((t8>40).astype(np.uint8))*255)
    return cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(7,7)), 1)

def main():
    gray = load_gray(SRC)
    g8 = np.clip(gray*255,0,255).astype(np.uint8)
    gm = graticule_mask()
    g8 = cv2.inpaint(g8, gm, 5, cv2.INPAINT_NS)

    # de-band: edge-preserving smooth to kill posterization, keep structure
    g8 = cv2.bilateralFilter(g8, 7, 40, 40)
    g8 = cv2.medianBlur(g8, 3)

    # gentle local contrast
    clahe = cv2.createCLAHE(clipLimit=1.8, tileGridSize=(20,20))
    g8 = clahe.apply(g8)

    # crater-rim crispness via unsharp masking of the relief itself
    blur = cv2.GaussianBlur(g8, (0,0), 3)
    sharp = cv2.addWeighted(g8, 1.22, blur, -0.22, 0)

    out = sharp.astype(np.float32)
    # global tone: lift midtones slightly, deepen PSR floors for a clean look
    out = 255*np.clip((out/255.0)**0.92, 0, 1)
    out[~disk] = 12
    out = np.clip(out,0,255).astype(np.uint8)

    Image.fromarray(out,"L").save("basemap_topo_bw.jpg", quality=92)
    Image.fromarray(out,"L").resize((460,460)).save("_prev_topo_bw.png")
    # also a half-res 1212 just in case a non-retina path wants it
    Image.fromarray(out,"L").resize((1212,1212), Image.LANCZOS).save("basemap_topo_bw_1x.jpg", quality=90)
    print("wrote basemap_topo_bw.jpg", out.shape)

main()
