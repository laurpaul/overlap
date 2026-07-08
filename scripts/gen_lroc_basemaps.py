import numpy as np, cv2
from PIL import Image

# Registration (measured): pole + 80S circle in the uploaded QuickMap frame.
SRC = "/mnt/user-data/uploads/quickmap-lroc.png"
PCX, PCY, R80 = 745.5, 396.5, 129.0
OUT = "/home/claude/work/sandbox/lunar-policy-sandbox/public/maps"
N = 1212  # sim frame; 80S circle == inscribed circle of the NxN square

def crop_to_80S(rgb):
    # crop the 80S disk (square of half-width R80 about the pole) and scale to N
    x0, y0 = int(round(PCX - R80)), int(round(PCY - R80))
    x1, y1 = int(round(PCX + R80)), int(round(PCY + R80))
    sub = rgb[y0:y1, x0:x1]
    return cv2.resize(sub, (N, N), interpolation=cv2.INTER_LANCZOS4)

yy, xx = np.mgrid[0:N, 0:N]
cc = N/2
disk = ((xx-cc)**2 + (yy-cc)**2) <= (cc-1)**2

def detect_graticule(g8):
    # the tan/orange cross + 80S ring: detect via brightness profiles + tophat
    th = cv2.morphologyEx(g8, cv2.MORPH_TOPHAT,
                          cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(7,7))).astype(np.float32)
    m = np.zeros((N,N), np.uint8)
    # The crop is pole-centered, so the cardinal cross is exactly at the center.
    c = N//2
    cv2.line(m,(c,0),(c,N),255,4)
    cv2.line(m,(0,c),(N,c),255,4)
    col = th.sum(0); row = th.sum(1)
    for x in np.where(col > col.mean()+2.5*col.std())[0]:
        cv2.line(m,(int(x),0),(int(x),N),255,2)
    for y in np.where(row > row.mean()+2.5*row.std())[0]:
        cv2.line(m,(0,int(y)),(N,int(y)),255,2)
    t8=th.astype(np.uint8)
    horiz=cv2.morphologyEx(t8,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_RECT,(41,1)))
    vert =cv2.morphologyEx(t8,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_RECT,(1,41)))
    m=cv2.bitwise_or(m,((horiz>16).astype(np.uint8))*255)
    m=cv2.bitwise_or(m,((vert >16).astype(np.uint8))*255)
    return cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5)),1)

def finish_gray(sub_rgb, name, sat_relief=False):
    gray = cv2.cvtColor(sub_rgb, cv2.COLOR_RGB2GRAY)
    gm = detect_graticule(gray)
    gray = cv2.inpaint(gray, gm, 5, cv2.INPAINT_NS)
    gray = cv2.bilateralFilter(gray, 5, 30, 30)
    clahe = cv2.createCLAHE(clipLimit=2.4, tileGridSize=(16,16))
    gray = clahe.apply(gray)
    blur = cv2.GaussianBlur(gray,(0,0),2.2)
    gray = cv2.addWeighted(gray,1.5,blur,-0.5,0)  # unsharp for crispness post-upscale
    out = gray.astype(np.float32)
    out[~disk]=12
    Image.fromarray(np.clip(out,0,255).astype(np.uint8),"L").save(f"{OUT}/{name}.jpg", quality=92)
    Image.fromarray(np.clip(out,0,255).astype(np.uint8),"L").resize((460,460)).save(f"{OUT}/_prev_{name}.png")
    print("wrote", name)

def finish_color(sub_rgb, name, saturate=1.0):
    # keep color (e.g. red contours), clean graticule, brighten + saturate
    g8 = cv2.cvtColor(sub_rgb, cv2.COLOR_RGB2GRAY)
    gm = detect_graticule(g8)
    bgr = cv2.cvtColor(sub_rgb, cv2.COLOR_RGB2BGR)
    bgr = cv2.inpaint(bgr, gm, 5, cv2.INPAINT_NS)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[...,1] = np.clip(hsv[...,1]*saturate, 0, 255)
    hsv[...,2] = np.clip(hsv[...,2]*1.12, 0, 255)
    bgr = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float32)
    rgb[~disk]=[12,12,16]
    Image.fromarray(np.clip(rgb,0,255).astype(np.uint8),"RGB").save(f"{OUT}/{name}.jpg", quality=92)
    Image.fromarray(np.clip(rgb,0,255).astype(np.uint8),"RGB").resize((460,460)).save(f"{OUT}/_prev_{name}.png")
    print("wrote", name)

rgb = np.asarray(Image.open(SRC).convert("RGB"))
sub = crop_to_80S(rgb)
# The file on disk is the clean LROC/LOLA shaded relief (Image 3). Render it as
# the registered B&W basemap. (WAC photo / contour styles can be added the same
# way if those files are supplied.)
finish_gray(sub, "basemap_lroc_relief")
print("done")
