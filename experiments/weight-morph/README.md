# Weight morphing experiments

Research harness for "can one atlas replace N weight bakes?". Run from the repo root.

```bash
python3 experiments/weight-morph/harness.py   # ground truth + outline correspondence
python3 experiments/weight-morph/validate.py  # asserts the lattice/mapping is sound
python3 experiments/weight-morph/run.py       # exp 1 + 3, writes scores.json
python3 experiments/weight-morph/run2.py      # exp 2, 4, 6
python3 experiments/weight-morph/export.py    # displacement maps for the browser
```

Playground: `/experiments/morph`.

## Why the first attempt was wrong

msdf-bmfont-xml derives each instance's translate from *its own* bounding box, so
bakes of different weights were sub-pixel misaligned before any interpolation ran.
Every method was then scored against a shifted target and the error got blamed on
the interpolation math. The harness here renders all weights through one shared
transform, so the lattices match by construction.

Two other traps found along the way:

- msdfgen's `-varfont` silently ignores the axis value: 400 and 700 produced
  identical output. Masters are instanced with fontTools instead.
- msdfgen 1.12 defaults to legacy coordinates (font units / 64). `-emnormalize`
  gives em-space, where `pixel = (unit + translate) * scale` and
  `pixel_y = size - (y + ty) * scale` without `-yflip`.

## Results (12 glyphs, weights 450-650, Inter)

| method | worst edge px | IoU |
| --- | --- | --- |
| snap to nearest bake | 2.42 | 0.795 |
| **two bakes, linear blend** | **0.67** | **0.9916** |
| two bakes + gvar warp | 0.81 | 0.9959 |
| one bake + smooth warp | 1.48 | 0.9837 |
| one bake + nearest warp | 2.05 | 0.9904 |

Linear in w is enough: fitting a per-weight curve moved worst-case by 0.01px and
cost IoU. The weight axis has an `avar` table, but across 400-700 it is a uniform
0.9 scaling, so it stays linear in the normalised ratio.
