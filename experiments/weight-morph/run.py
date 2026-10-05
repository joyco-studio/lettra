"""Experiments 1, 3a, 3b, 6 + the snap baseline, scored against ground truth."""
import json, sys, numpy as np
sys.path.insert(0, 'experiments/weight-morph')
from methods import *

MID = [w for w in WEIGHTS if w not in (BASE, TARGET)]

def wlin(target):
    return (target - BASE) / (TARGET - BASE)

results = {}
agg = {}
for ch in M['glyphs']:
    base_rgb, targ_rgb = rgb(ch, BASE), rgb(ch, TARGET)
    base_med, targ_med = med(base_rgb), med(targ_rgb)
    Dn = displacement(ch, 'nearest')
    Ds = displacement(ch, 'smooth')
    per = {}
    for tw in MID:
        w = wlin(tw)
        truth = med(rgb(ch, tw))
        fwd = med(warp(base_rgb, Dn, w))
        bwd = med(warp(targ_rgb, -Dn, 1 - w))
        cand = {
            'snap400': base_med,
            'mix2': base_med + w * (targ_med - base_med),
            'morph2': fwd + w * (bwd - fwd),
            'warpNearest': fwd,
            'warpSmooth': med(warp(base_rgb, Ds, w)),
        }

        def defects(r):
            """Holes punched in ink and specks left in the background. These are
            what the eye catches; IoU averages them away."""
            return int(((truth > 0.65) & (r < 0.5)).sum() + ((truth < 0.35) & (r >= 0.5)).sum())

        per[tw] = {k: {**score(v, truth), 'defects': defects(v)} for k, v in cand.items()}
        for k, s in per[tw].items():
            a = agg.setdefault(k, {'worst': [], 'iou': [], 'def': []})
            a['worst'].append(s['worstEdgePx']); a['iou'].append(s['iou']); a['def'].append(s['defects'])
    results[ch] = per
    print(f"  {ch}: " + "  ".join(
        f"{k} {np.mean([per[t][k]['worstEdgePx'] for t in MID]):.2f}px/{sum(per[t][k]['defects'] for t in MID)}d"
        for k in ['mix2', 'morph2', 'warpNearest', 'warpSmooth']))

print('\n== averages over all glyphs and middle weights ==')
print(f"{'method':14} {'worst edge px':>14} {'IoU':>8} {'defects':>9}")
for k, a in agg.items():
    print(f'{k:14} {np.mean(a["worst"]):14.2f} {np.mean(a["iou"]):8.4f} {np.mean(a["def"]):9.1f}')

json.dump(results, open('templates/playground/public/experiments/weight/scores.json', 'w'))
