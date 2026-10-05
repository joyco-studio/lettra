import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('')

/** Curly quotes, dashes and the ellipsis: cheap to bake, and their absence is
 * the usual reason text looks wrong after a bake. */
const TYPOGRAPHIC = '‘’“”–—…'

export const CHARSET_PRESETS: Record<string, string> = {
  ascii: ASCII,
  latin: ASCII + TYPOGRAPHIC,
  'latin-es': ASCII + TYPOGRAPHIC + 'áéíóúüñÁÉÍÓÚÜÑ¿¡',
  'latin-pt': ASCII + TYPOGRAPHIC + 'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ',
  'latin-fr': ASCII + TYPOGRAPHIC + 'àâäéèêëîïôöùûüÿçœæÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇŒÆ«»',
  'latin-de': ASCII + TYPOGRAPHIC + 'äöüßÄÖÜ„“',
  /** Covers the presets above in one bake. */
  'latin-ext':
    ASCII +
    TYPOGRAPHIC +
    'áàâãäåéèêëíìîïóòôõöúùûüýÿñçšžœæðþ'.split('').join('') +
    'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÝŸÑÇŠŽŒÆÐÞ¿¡«»ß',
}

/** Resolves `--charset`: a preset name, a file path, or a literal string.
 * Duplicates and newlines are stripped either way. */
export function resolveCharset(input: string): string {
  const preset = CHARSET_PRESETS[input]
  const raw = preset ?? (existsSync(resolve(input)) ? readFileSync(resolve(input), 'utf8') : input)
  return [...new Set(Array.from(raw.replace(/[\n\r]/g, '')))].join('')
}

/** Splits a charset into what the font can map and what it cannot; the latter
 * would otherwise bake as .notdef tofu. */
export function partitionByCoverage(charset: string, covered: Set<number>): { usable: string; missing: string[] } {
  const usable: string[] = []
  const missing: string[] = []
  for (const char of Array.from(charset)) {
    const code = char.codePointAt(0)!
    // control chars never bake; the baker drops them itself
    if (code < 32) continue
    ;(covered.has(code) ? usable : missing).push(char)
  }
  return { usable: usable.join(''), missing }
}
