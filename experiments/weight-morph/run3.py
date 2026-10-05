import json, sys, numpy as np
sys.path.insert(0, 'experiments/weight-morph')
from methods import *
MID=[w for w in WEIGHTS if w not in (BASE,TARGET)]
# global curve fitted in run2 (mean best-fit w per target weight)
CURVE={450:0.172,500:0.380,550:0.562,600:0.738,650:0.882}
agg={}
def add(k,s):
    a=agg.setdefault(k,{'w':[],'i':[]}); a['w'].append(s['worstEdgePx']); a['i'].append(s['iou'])
for ch in M['glyphs']:
    b,t=med(rgb(ch,BASE)),med(rgb(ch,TARGET))
    for tw in MID:
        lin=(tw-BASE)/(TARGET-BASE); truth=med(rgb(ch,tw))
        add('mix2 linear', score(b+lin*(t-b), truth))
        add('mix2 curved', score(b+CURVE[tw]*(t-b), truth))
print(f"{'method':14} {'worst edge px':>14} {'IoU':>8}")
for k in agg: print(f'{k:14} {np.mean(agg[k]["w"]):14.2f} {np.mean(agg[k]["i"]):8.4f}')
json.dump(CURVE, open('templates/playground/public/experiments/weight/curve.json','w'))
