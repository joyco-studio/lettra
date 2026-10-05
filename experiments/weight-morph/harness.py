"""Ground-truth harness for weight-morphing experiments.

Every weight of a glyph is rendered through one shared transform, so all cells
sit on an identical lattice. That is the thing the old pipeline got wrong:
msdf-bmfont-xml derives each instance's translate from its own bbox, so bakes
of different weights were sub-pixel misaligned before any method ran.
"""
import json, os, subprocess, sys
import numpy as np
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.recordingPen import RecordingPen

FONT = '/tmp/lettra-fonts/Inter.ttf'
MSDFGEN = os.path.abspath('node_modules/.pnpm/msdf-bmfont-xml@2.8.0/node_modules/msdf-bmfont-xml/bin/darwin_arm64/msdfgen.osx')
OUT = 'templates/playground/public/experiments/weight'
GLYPHS = ['H', 'n', 'o', 'e', 'a', 's', 'g', 'M', 'R', '8', '%', 'W']
WEIGHTS = [400, 450, 500, 550, 600, 650, 700]
BASE, TARGET = 400, 700
EM_PX = 96.0
PXRANGE = 16
SUBDIV = 6

os.makedirs(OUT, exist_ok=True)

def outline(ttf_glyphset, name):
    p = RecordingPen(); ttf_glyphset[name].draw(p); return p.value

def flatten(rec, n=SUBDIV):
    pts, cur, start = [], None, None
    def b3(p0,p1,p2,p3,k):
        o=[]
        for i in range(1,k+1):
            t=i/k; m=1-t
            o.append((m**3*p0[0]+3*m*m*t*p1[0]+3*m*t*t*p2[0]+t**3*p3[0],
                      m**3*p0[1]+3*m*m*t*p1[1]+3*m*t*t*p2[1]+t**3*p3[1]))
        return o
    def b2(p0,p1,p2,k):
        o=[]
        for i in range(1,k+1):
            t=i/k; m=1-t
            o.append((m*m*p0[0]+2*m*t*p1[0]+t*t*p2[0], m*m*p0[1]+2*m*t*p1[1]+t*t*p2[1]))
        return o
    for op,args in rec:
        if op=='moveTo': cur=args[0]; start=cur; pts.append(cur)
        elif op=='lineTo':
            for i in range(1,n+1):
                t=i/n; pts.append((cur[0]+(args[0][0]-cur[0])*t, cur[1]+(args[0][1]-cur[1])*t))
            cur=args[0]
        elif op=='curveTo': pts+=b3(cur,args[0],args[1],args[2],n*2); cur=args[2]
        elif op=='qCurveTo':
            prev=cur
            for i in range(len(args)-1):
                nxt=args[i+1] if args[i+1] is not None else args[0]
                pts+=b2(prev,args[i],nxt,n*2); prev=nxt
            cur=prev
        elif op=='closePath':
            for i in range(1,n+1):
                t=i/n; pts.append((cur[0]+(start[0]-cur[0])*t, cur[1]+(start[1]-cur[1])*t))
            cur=start
    return pts

print('instancing masters (fontTools applies avar; msdfgen -varfont silently does not)...')
TMP = '/tmp/lettra-masters'
os.makedirs(TMP, exist_ok=True)
masters, master_ttf = {}, {}
for w in WEIGHTS:
    f = instantiateVariableFont(TTFont(FONT), {'wght': w}, inplace=False)
    path = f'{TMP}/inter-{w}.ttf'
    f.save(path)
    master_ttf[w] = path
    masters[w] = (f, f.getGlyphSet(), f.getBestCmap(), f['head'].unitsPerEm)
UPEM = masters[BASE][3]
SCALE = EM_PX / UPEM

# shared cell: big enough for the widest/tallest glyph at any weight, plus field padding
bounds = {}
for ch in GLYPHS:
    xs, ys = [], []
    for w in WEIGHTS:
        f, gs, cmap, _ = masters[w]
        pts = flatten(outline(gs, cmap[ord(ch)]))
        xs += [p[0]/UPEM for p in pts]; ys += [p[1]/UPEM for p in pts]
    bounds[ch] = (min(xs), min(ys), max(xs), max(ys))

pad = PXRANGE
need = max(max((b[2]-b[0]), (b[3]-b[1])) for b in bounds.values()) * EM_PX + 2*pad + 4
CELL = int(np.ceil(need/8)*8)
print(f'upem {UPEM}  scale {SCALE:.5f}  cell {CELL}px  pxrange {PXRANGE}')

manifest = {'cell': CELL, 'pxrange': PXRANGE, 'emPx': EM_PX, 'upem': UPEM,
            'weights': WEIGHTS, 'base': BASE, 'target': TARGET, 'glyphs': {}}

for ch in GLYPHS:
    x0, y0, x1, y1 = bounds[ch]
    # centre the union bbox in the cell; identical translate for every weight
    tx = (CELL/EM_PX - (x1-x0))/2 - x0
    ty = (CELL/EM_PX - (y1-y0))/2 - y0
    safe = 'pct' if ch == '%' else ch
    for w in WEIGHTS:
        dst = f'{OUT}/{safe}-{w}.png'
        cmd = [MSDFGEN, 'msdf', '-font', master_ttf[w], f'0x{ord(ch):x}',
               '-emnormalize', '-size', str(CELL), str(CELL), '-scale', f'{EM_PX:.6f}',
               '-translate', f'{tx:.6f}', f'{ty:.6f}', '-pxrange', str(PXRANGE), '-o', dst]
        r = subprocess.run(cmd, capture_output=True)
        if r.returncode != 0:
            print('FAIL', ch, w, r.stderr.decode()[:200]); sys.exit(1)
    # corresponding outline points, in cell pixel space
    def cell_pts(w):
        f, gs, cmap, _ = masters[w]
        return [((p[0]/UPEM+tx)*EM_PX, CELL-(p[1]/UPEM+ty)*EM_PX) for p in flatten(outline(gs, cmap[ord(ch)]))]
    pb, pt = cell_pts(BASE), cell_pts(TARGET)
    if len(pb) != len(pt):
        print(f'{ch}: point mismatch {len(pb)}/{len(pt)}'); sys.exit(1)
    manifest['glyphs'][ch] = {
        'file': safe,
        'advance': masters[BASE][1][masters[BASE][2][ord(ch)]].width / UPEM * EM_PX,
        'points': [[round(x,3), round(y,3)] for x, y in pb],
        'deltas': [[round(b[0]-a[0],4), round(b[1]-a[1],4)] for a, b in zip(pb, pt)],
    }
    print(f'  {ch}: {len(pb)} points, {len(WEIGHTS)} weights')

json.dump(manifest, open(f'{OUT}/manifest.json','w'))
print(f'wrote {OUT}/manifest.json')
