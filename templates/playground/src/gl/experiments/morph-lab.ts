/* WebGL2 rig for the weight-morph experiments. Every method runs as real
 * shader math on the real atlases, so what you see is what would ship. */

export const METHODS = ['truth', 'mix2', 'morph2', 'warpNearest', 'warpSmooth'] as const
export type Method = (typeof METHODS)[number]
export const VIEWS = ['single', 'sideBySide', 'difference', 'inkXor'] as const
export type View = (typeof VIEWS)[number]

export interface Manifest {
  cell: number
  pxrange: number
  emPx: number
  weights: number[]
  base: number
  target: number
  dispScale: number
  glyphs: Record<string, { file: string; advance: number; points: number[][]; deltas: number[][] }>
}

export interface LabState {
  glyph: string
  weight: number
  method: Method
  view: View
  zoom: number
  panX: number
  panY: number
  showVectors: boolean
  showGrid: boolean
}

const VERT = `#version 300 es
in vec2 p; out vec2 v; uniform vec4 rect;
void main(){ v = vec2(p.x, 1.0 - p.y); gl_Position = vec4(rect.xy + p * rect.zw, 0.0, 1.0); }`

const FRAG = `#version 300 es
precision highp float;
in vec2 v; out vec4 o;
uniform sampler2D base, targ, truth, disp;
uniform float w, pxrange, dispScale, cell, zoom;
uniform vec2 pan;
uniform int method, view;
uniform bool showGrid;

float med(vec3 c){ return max(min(c.r,c.g), min(max(c.r,c.g), c.b)); }
vec2 D(vec2 uv){ return (texture(disp, uv).rg * 2.0 - 1.0) * dispScale / cell; }

// first-order backward warp. Iterating to convergence measurably hurts:
// the nearest-point field is piecewise constant, so the fixed point amplifies
// its discontinuities (2.05px converged vs 1.35px at one step).
vec2 solve(vec2 p, float amt){ return p - amt * D(p); }
float fieldAt(vec2 uv){
  if(method==0) return med(texture(truth, uv).rgb);
  if(method==1) return mix(med(texture(base,uv).rgb), med(texture(targ,uv).rgb), w);
  if(method==2){
    float f = med(texture(base, solve(uv, w)).rgb);
    float b = med(texture(targ, uv + (1.0-w) * D(uv)).rgb);
    return mix(f, b, w);
  }
  return med(texture(base, solve(uv, w)).rgb);  // 3,4 = warp (map differs)
}
float cov(float d){ float aa = fwidth(d) * 0.75; return smoothstep(0.5-aa, 0.5+aa, d); }

void main(){
  vec2 uv = (v - 0.5) / zoom + 0.5 + pan;
  if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0){ o = vec4(0.0); return; }

  float grid = 0.0;
  if(showGrid){
    vec2 g = fract(uv * cell);
    float lw = 0.5 * cell / (zoom * 900.0);
    if(min(g.x, g.y) < lw || max(g.x, g.y) > 1.0 - lw) grid = 0.18;
  }

  float m = cov(fieldAt(uv));
  float t = cov(med(texture(truth, uv).rgb));

  vec3 bg = vec3(0.871) - grid;
  vec3 col; float a;
  if(view==1){
    // the method is the subject; truth sits behind it as a pale reference, so
    // any mismatch reads as grey spilling out from under the ink
    vec3 c = mix(bg, vec3(0.66), t);
    c = mix(c, vec3(0.10), m);
    o = vec4(c, 1.0); return;
  }
  if(view==0){ col = vec3(0.1); a = m; }
  else if(view==2){ // signed: red = method too heavy, blue = too light
    float d = m - t;
    col = d > 0.0 ? vec3(0.83,0.28,0.16) : vec3(0.16,0.35,0.83);
    a = abs(d);
  } else { // only texels on the wrong side of the edge
    col = vec3(0.83,0.28,0.16);
    a = abs(step(0.5, m) - step(0.5, t));
  }
  o = vec4(mix(bg, col, a), 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
  return s
}

async function loadTex(gl: WebGL2RenderingContext, url: string) {
  const img = new Image()
  img.src = url
  await img.decode()
  const t = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return t
}

export interface MorphLab {
  render(state: LabState): void
  dispose(): void
  manifest: Manifest
}

export async function createMorphLab(canvas: HTMLCanvasElement, root: string): Promise<MorphLab> {
  const manifest: Manifest = await (await fetch(`${root}/manifest.json`)).json()
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false })!
  if (!gl) throw new Error('WebGL2 unavailable')

  const prog = gl.createProgram()!
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link')
  gl.useProgram(prog)

  const vao = gl.createVertexArray()!
  gl.bindVertexArray(vao)
  const buf = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'p')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

  const U = (n: string) => gl.getUniformLocation(prog, n)
  const cache = new Map<string, WebGLTexture>()
  const tex = async (name: string) => {
    let t = cache.get(name)
    if (!t) {
      t = await loadTex(gl, `${root}/${name}.png`)
      cache.set(name, t)
    }
    return t
  }
  // preload everything so sliding never stalls
  await Promise.all(
    Object.values(manifest.glyphs).flatMap((g) => [
      ...manifest.weights.map((w) => tex(`${g.file}-${w}`)),
      tex(`${g.file}-disp-nearest`),
      tex(`${g.file}-disp-smooth`),
    ])
  )

  const nearestWeight = (w: number) => manifest.weights.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a))

  let current: LabState | null = null
  const draw = async (s: LabState) => {
    current = s
    const g = manifest.glyphs[s.glyph]
    const dpr = Math.min(devicePixelRatio, 2)
    const W = Math.round(canvas.clientWidth * dpr),
      H = Math.round(canvas.clientHeight * dpr)
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W
      canvas.height = H
    }
    gl.viewport(0, 0, W, H)
    gl.clearColor(0.871, 0.871, 0.871, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)

    const bind = async (unit: number, name: string, uni: string) => {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, await tex(name))
      gl.uniform1i(U(uni), unit)
    }
    await bind(0, `${g.file}-${manifest.base}`, 'base')
    await bind(1, `${g.file}-${manifest.target}`, 'targ')
    await bind(2, `${g.file}-${nearestWeight(s.weight)}`, 'truth')
    await bind(3, `${g.file}-disp-${s.method === 'warpSmooth' ? 'smooth' : 'nearest'}`, 'disp')

    const w = (s.weight - manifest.base) / (manifest.target - manifest.base)
    gl.uniform1f(U('w'), w)
    gl.uniform1f(U('pxrange'), manifest.pxrange)
    gl.uniform1f(U('dispScale'), manifest.dispScale)
    gl.uniform1f(U('cell'), manifest.cell)
    gl.uniform1f(U('zoom'), s.zoom)
    gl.uniform2f(U('pan'), s.panX, s.panY)
    gl.uniform1i(U('method'), METHODS.indexOf(s.method))
    gl.uniform1i(U('showGrid'), s.showGrid ? 1 : 0)

    const aspect = W / H
    const panels = s.view === 'sideBySide' ? 1 : 1
    gl.uniform1i(U('view'), VIEWS.indexOf(s.view))
    // square viewport centred in the canvas
    const sw = aspect > 1 ? 2 / aspect : 2,
      sh = aspect > 1 ? 2 : 2 * aspect
    gl.uniform4f(U('rect'), -sw / 2, -sh / 2, sw, sh)
    void panels
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  return {
    manifest,
    render(s) {
      void draw(s)
    },
    dispose() {
      cache.forEach((t) => gl.deleteTexture(t))
      gl.deleteProgram(prog)
      gl.deleteVertexArray(vao)
      gl.deleteBuffer(buf)
      void current
    },
  }
}
