"""Experiments 2 (morph), 4 (warp + correction), 6 (is linear in w enough?)."""
import json, sys, numpy as np
sys.path.insert(0, 'experiments/weight-morph')
from methods import *
MID = [w for w in WEIGHTS if w not in (BASE, TARGET)]

agg = {}
def add(k, s):
    a = agg.setdefault(k, {'worst': [], 'iou': []})
    a['worst'].append(s['worstEdgePx']); a['iou'].append(s['iou'])

opt_w = {w: [] for w in MID}
for ch in M['glyphs']:
    b_rgb, t_rgb = rgb(ch, BASE), rgb(ch, TARGET)
    b_med, t_med = med(b_rgb), med(t_rgb)
    Dn = displacement(ch, 'nearest')
    for tw in MID:
        w = (tw - BASE) / (TARGET - BASE)
        truth = med(rgb(ch, tw))
        mix = b_med + w * (t_med - b_med)
        add('1 mix2', score(mix, truth))

        # exp 2: morph both bakes toward the target state, then blend
        fwd = med(warp(b_rgb, Dn, w))
        bwd = med(warp(t_rgb, -Dn, 1 - w))
        add('2 morph2', score(fwd + w * (bwd - fwd), truth))

        # exp 4: warp (one bake) + scalar thickness correction from the field gap
        wn = med(warp(b_rgb, Dn, w))
        corr = (b_med + w * (t_med - b_med)) - wn
        add('4 warp+corr', score(wn + corr, truth))
        add('4 warp+half', score(wn + 0.5 * corr, truth))

        # exp 6: best w for this glyph/weight vs the linear one
        best, bw = 1e9, w
        for cand in np.arange(0.0, 1.001, 0.02):
            e = np.abs((b_med + cand * (t_med - b_med)) - truth)
            edge = np.abs(truth - 0.5) < 0.25
            v = np.percentile(e[edge], 99.5)
            if v < best: best, bw = v, cand
        opt_w[tw].append(bw)

print(f"{'method':14} {'worst edge px':>14} {'IoU':>8}")
for k in sorted(agg):
    a = agg[k]; print(f'{k:14} {np.mean(a["worst"]):14.2f} {np.mean(a["iou"]):8.4f}')

print('\nexp 6 — is linear in w enough?')
for tw in MID:
    lin = (tw - BASE) / (TARGET - BASE)
    o = np.array(opt_w[tw])
    print(f'  wght {tw}: linear w={lin:.3f}  best-fit w={o.mean():.3f} (spread {o.std():.3f})')
