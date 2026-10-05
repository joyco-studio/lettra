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

| method | worst edge px | IoU | visual defects |
| --- | --- | --- | --- |
| snap to nearest bake | 2.42 | 0.795 | 32.9 |
| **two bakes + gvar warp** | **0.34** | **0.9976** | **0** |
| two bakes, linear blend | 0.67 | 0.9916 | 0 |
| one bake + nearest warp | 1.35 | 0.9942 | 1.2 (41 worst) |
| one bake + smooth warp | 1.40 | 0.9819 | 0.8 (25 worst) |

"Visual defects" counts holes punched in solid ink plus specks left in the
background. It exists because IoU scored a visibly torn stem at 0.9942: the
tear is a handful of texels, and overlap averages them away. Rank by this
column, not by IoU.

Both single-bake warps tear at medial axes, where the nearest outline point
flips from one edge of a stem to the other and the two deltas point opposite
ways. Projecting the displacement onto the field normal (which is continuous
across that seam) was tried and is worse: 1.81px, 3.0 defects.

Linear in w is enough: fitting a per-weight curve moved worst-case by 0.01px and
cost IoU. The weight axis has an `avar` table, but across 400-700 it is a uniform
0.9 scaling, so it stays linear in the normalised ratio.

The backward warp takes a **single step**. Converging the fixed point amplifies
the discontinuities in the nearest-point field: 2.05px converged vs 1.35px at one
step, and it was what made `two + warp` look mediocre (0.81px) until corrected.
