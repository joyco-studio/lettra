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
        cand = {
            'snap400': base_med,
            'mix2': base_med + w * (targ_med - base_med),
            'warpNearest': med(warp(base_rgb, Dn, w)),
            'warpSmooth': med(warp(base_rgb, Ds, w)),
        }
        per[tw] = {k: score(v, truth) for k, v in cand.items()}
        for k, s in per[tw].items():
            a = agg.setdefault(k, {'worst': [], 'iou': []})
            a['worst'].append(s['worstEdgePx']); a['iou'].append(s['iou'])
    results[ch] = per
    print(f"  {ch}: " + "  ".join(
        f"{k} {np.mean([per[t][k]['worstEdgePx'] for t in MID]):.2f}px/{np.mean([per[t][k]['iou'] for t in MID]):.4f}"
        for k in ['mix2', 'warpNearest', 'warpSmooth']))

print('\n== averages over all glyphs and middle weights ==')
print(f"{'method':14} {'worst edge px':>14} {'IoU':>8}")
for k, a in agg.items():
    print(f'{k:14} {np.mean(a["worst"]):14.2f} {np.mean(a["iou"]):8.4f}')

json.dump(results, open('templates/playground/public/experiments/weight/scores.json', 'w'))
