"""Reconstruction methods + scoring against the aligned ground truth."""
import json, numpy as np
from PIL import Image

OUT = 'templates/playground/public/experiments/weight'
M = json.load(open(f'{OUT}/manifest.json'))
CELL, PXRANGE = M['cell'], M['pxrange']
WEIGHTS, BASE, TARGET = M['weights'], M['base'], M['target']
YY, XX = np.mgrid[0:CELL, 0:CELL].astype(np.float32)

def rgb(ch, w):
    g = M['glyphs'][ch]
    return np.asarray(Image.open(f"{OUT}/{g['file']}-{w}.png").convert('RGB'), dtype=np.float32) / 255.0

def med(a):
    return np.median(a, axis=2)

def sample_rgb(img, x, y):
    x = np.clip(x, 0, CELL - 1); y = np.clip(y, 0, CELL - 1)
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int)
    x1 = np.minimum(x0 + 1, CELL - 1); y1 = np.minimum(y0 + 1, CELL - 1)
    fx = (x - x0)[..., None]; fy = (y - y0)[..., None]
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x1] * fx * (1 - fy)
            + img[y1, x0] * (1 - fx) * fy + img[y1, x1] * fx * fy)

def displacement(ch, mode):
    """Per-texel displacement from gvar point correspondence."""
    g = M['glyphs'][ch]
    pts = np.array(g['points'], dtype=np.float32)
    dlt = np.array(g['deltas'], dtype=np.float32)
    px = XX.ravel()[:, None]; py = YY.ravel()[:, None]
    out = np.zeros((CELL * CELL, 2), dtype=np.float32)
    CHUNK = 2048
    for i in range(0, px.shape[0], CHUNK):
        dx = px[i:i+CHUNK] - pts[None, :, 0]
        dy = py[i:i+CHUNK] - pts[None, :, 1]
        d2 = dx * dx + dy * dy
        if mode == 'nearest':
            k = np.argmin(d2, axis=1)
            out[i:i+CHUNK] = dlt[k]
        else:  # inverse-distance weighted, so a stem interior averages both edges
            wgt = 1.0 / (d2 * d2 + 1e-3)
            wsum = wgt.sum(axis=1, keepdims=True)
            out[i:i+CHUNK, 0] = (wgt * dlt[None, :, 0]).sum(axis=1) / wsum[:, 0]
            out[i:i+CHUNK, 1] = (wgt * dlt[None, :, 1]).sum(axis=1) / wsum[:, 0]
    return out.reshape(CELL, CELL, 2)

def warp(base_img, D, w, iters=1):
    """Backward warp. One step beats converging the fixed point: the
    nearest-point field is piecewise constant, so iterating amplifies its
    discontinuities (measured 2.05px converged vs 1.35px at one step)."""
    qx, qy = XX.copy(), YY.copy()
    for _ in range(iters):
        dx = sample_rgb(D[..., 0:1], qx, qy)[..., 0]
        dy = sample_rgb(D[..., 1:2], qx, qy)[..., 0]
        qx = XX - w * dx; qy = YY - w * dy
    return sample_rgb(base_img, qx, qy)

def score(recon_med, truth_med):
    err_px = np.abs(recon_med - truth_med) * PXRANGE
    edge = np.abs(truth_med - 0.5) < 0.25
    a = recon_med >= 0.5; b = truth_med >= 0.5
    inter = (a & b).sum(); union = (a | b).sum()
    return {
        'worstEdgePx': float(np.percentile(err_px[edge], 99.5)) if edge.any() else 0.0,
        'maxEdgePx': float(err_px[edge].max()) if edge.any() else 0.0,
        'iou': float(inter / union) if union else 1.0,
    }
