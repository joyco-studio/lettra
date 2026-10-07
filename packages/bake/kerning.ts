/* opentype.js (inside msdf-bmfont-xml) misses class-based PairPos, the format
 * most modern fonts use, so bakes come out with 0 pairs even from a correctly
 * instanced static font. fontTools recovers them. */

import { execFile } from 'node:child_process'

/** Embedded so the published CLI is self-contained. */
const EXTRACT_SCRIPT = `
import json, sys
from fontTools.ttLib import TTFont

font_path, size, charset = sys.argv[1], float(sys.argv[2]), sys.argv[3]
font = TTFont(font_path)
upem = font["head"].unitsPerEm
scale = size / upem
cmap = font.getBestCmap()
by_glyph = {}
for code, name in cmap.items():
    ch = chr(code)
    if ch in charset:
        by_glyph.setdefault(name, ch)

pairs = {}

def add(left, right, value):
    if value == 0:
        return
    lc, rc = by_glyph.get(left), by_glyph.get(right)
    if lc is None or rc is None:
        return
    pairs.setdefault(lc + rc, value * scale)

def walk_pairpos(st):
    if st.Format == 1:
        for first, pair_set in zip(st.Coverage.glyphs, st.PairSet):
            for record in pair_set.PairValueRecord:
                v = record.Value1.XAdvance if record.Value1 and hasattr(record.Value1, "XAdvance") else 0
                add(first, record.SecondGlyph, v)
    elif st.Format == 2:
        class1 = st.ClassDef1.classDefs if st.ClassDef1 else {}
        class2 = st.ClassDef2.classDefs if st.ClassDef2 else {}
        coverage = set(st.Coverage.glyphs)
        firsts = {}
        for g in coverage:
            firsts.setdefault(class1.get(g, 0), []).append(g)
        seconds = {}
        for g, c in class2.items():
            seconds.setdefault(c, []).append(g)
        seconds.setdefault(0, [g for g in by_glyph if g not in class2])
        for c1, record1 in enumerate(st.Class1Record):
            lefts = firsts.get(c1)
            if not lefts:
                continue
            for c2, record2 in enumerate(record1.Class2Record):
                v1 = record2.Value1
                v = v1.XAdvance if v1 and hasattr(v1, "XAdvance") else 0
                if v == 0:
                    continue
                for left in lefts:
                    for right in seconds.get(c2, []):
                        add(left, right, v)

if "GPOS" in font:
    gpos = font["GPOS"].table
    kern_lookups = set()
    if gpos.FeatureList:
        for record in gpos.FeatureList.FeatureRecord:
            if record.FeatureTag == "kern":
                kern_lookups.update(record.Feature.LookupListIndex)
    for index in sorted(kern_lookups):
        lookup = gpos.LookupList.Lookup[index]
        for st in lookup.SubTable:
            if lookup.LookupType == 9:
                st = st.ExtSubTable
            if getattr(st, "Format", None) in (1, 2) and hasattr(st, "Coverage") and hasattr(st, "ValueFormat1"):
                walk_pairpos(st)

print(json.dumps(pairs))
`

/** Flattened GPOS pairs scaled to the baked size; {} when only contextual. */
export function extractKerning(fontPath: string, size: number, charset: string): Promise<Record<string, number>> {
  return new Promise((resolve, reject) => {
    execFile(
      'python3',
      ['-c', EXTRACT_SCRIPT, fontPath, String(size), charset],
      { maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`[lettra] kerning extraction failed: ${stderr.trim() || error.message}`))
          return
        }
        // this callback runs long after the executor returned, so a throw here
        // would be an uncaught exception rather than a rejection — and any
        // stdout noise from the user's python3 (a pyenv shim notice, a conda
        // banner) is enough to cause one
        try {
          resolve(JSON.parse(stdout) as Record<string, number>)
        } catch {
          reject(
            new Error(
              `[lettra] kerning extraction returned unparseable output; something on your python3 stdout is not JSON: ${stdout.trim().slice(0, 200)}`
            )
          )
        }
      }
    )
  })
}
