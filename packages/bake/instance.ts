import { execFile } from 'node:child_process'

const INSTALL_HINT =
  'instancing a variable font needs Python fontTools — install with `pip3 install fonttools` (or `brew install fonttools`)'

/** Instances a variable font to a static one via fontTools (the only
 * instancer that reliably flattens variable GPOS kerning — baking a variable
 * font directly drops its pairs). `axes` like `['wght=700']`. */
export function instanceFont(fontPath: string, axes: string[], outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'python3',
      ['-m', 'fontTools.varLib.instancer', fontPath, ...axes, '-o', outPath],
      (error, _stdout, stderr) => {
        if (!error) return resolve()
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return reject(new Error(`[lettra-bake] python3 not found; ${INSTALL_HINT}`))
        }
        if (/No module named/i.test(stderr)) {
          return reject(new Error(`[lettra-bake] fontTools not installed; ${INSTALL_HINT}`))
        }
        reject(new Error(`[lettra-bake] fontTools instancer failed: ${stderr.trim() || error.message}`))
      }
    )
  })
}
