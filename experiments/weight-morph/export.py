"""Export displacement maps as RG textures so the browser can run every method."""
import json, sys, numpy as np
sys.path.insert(0, 'experiments/weight-morph')
from methods import *
from PIL import Image

scale = 0.0
fields = {}
for ch in M['glyphs']:
    for mode in ('nearest', 'smooth'):
        D = displacement(ch, mode)
        fields[(ch, mode)] = D
        scale = max(scale, float(np.abs(D).max()))
scale = float(np.ceil(scale))
print(f'displacement scale: +/-{scale:.0f}px')

for (ch, mode), D in fields.items():
    enc = np.clip((D / scale + 1) * 0.5, 0, 1)
    img = np.zeros((CELL, CELL, 3), dtype=np.uint8)
    img[..., 0] = (enc[..., 0] * 255).round()
    img[..., 1] = (enc[..., 1] * 255).round()
    Image.fromarray(img).save(f"{OUT}/{M['glyphs'][ch]['file']}-disp-{mode}.png")

M['dispScale'] = scale
json.dump(M, open(f'{OUT}/manifest.json', 'w'))
print(f'wrote {len(fields)} displacement maps')
