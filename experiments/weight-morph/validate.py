import json, numpy as np
from PIL import Image
OUT='templates/playground/public/experiments/weight'
M=json.load(open(f'{OUT}/manifest.json'))
def field(ch,w):
    g=M['glyphs'][ch]
    a=np.asarray(Image.open(f"{OUT}/{g['file']}-{w}.png").convert('RGB'),dtype=np.float32)/255.0
    return np.median(a,axis=2)
def sample(f,x,y):
    x=np.clip(x,0,f.shape[1]-1); y=np.clip(y,0,f.shape[0]-1)
    x0=np.floor(x).astype(int); y0=np.floor(y).astype(int)
    x1=np.minimum(x0+1,f.shape[1]-1); y1=np.minimum(y0+1,f.shape[0]-1)
    fx=x-x0; fy=y-y0
    return (f[y0,x0]*(1-fx)*(1-fy)+f[y0,x1]*fx*(1-fy)+f[y1,x0]*(1-fx)*fy+f[y1,x1]*fx*fy)
print('outline points on their own field (want 0.500):')
worst=0
for ch in M['glyphs']:
    g=M['glyphs'][ch]; p=np.array(g['points'])
    v=sample(field(ch,400),p[:,0],p[:,1])
    pt=p+np.array(g['deltas']); v7=sample(field(ch,700),pt[:,0],pt[:,1])
    d4=np.abs(v-0.5).mean(); d7=np.abs(v7-0.5).mean(); worst=max(worst,d4,d7)
    print(f'  {ch}: 400 {v.mean():.4f} (dev {d4:.4f})   700 {v7.mean():.4f} (dev {d7:.4f})')
print(f'\nworst mean deviation {worst:.4f} -> ' + ('HARNESS OK' if worst<0.05 else 'STILL WRONG'))
