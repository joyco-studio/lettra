import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('')

/** Curly quotes, dashes and the ellipsis: cheap to bake, and their absence is
 * the usual reason text looks wrong after a bake. */
const TYPOGRAPHIC = '‘’“”–—…'

function fail(message: string): never {
  throw new Error(`[lettra] ${message}`)
}

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

/** Looks like someone meant a preset: lowercase words joined by dashes. A bare
 * word is left alone — `xyz` is a perfectly good three-glyph literal — but a
 * dashed one is the shape every preset name has and no literal plausibly does. */
const PRESET_SHAPED = /^[a-z0-9]+(-[a-z0-9]+)+$/
/** Unambiguously meant as a file: a text-file extension, or an explicit
 * relative/absolute/home prefix. A bare separator is not enough — `AC/DC` is a
 * legitimate five-glyph literal for a logotype. */
const PATH_SHAPED = /\.(txt|json|charset)$/i
const PATH_PREFIXED = /^(\.\.?[/\\]|[/\\]|~[/\\])/

/** Resolves `--charset`: a preset name, a file path, or a literal string.
 * Duplicates and newlines are stripped either way.
 *
 * Precedence, so the ambiguous cases are a choice and not an accident:
 * preset name, then an existing file, then a name that can only be a path
 * (rejected as missing), then a name that can only be a preset (rejected as
 * unknown), then the literal characters. A typo'd preset or a wrong path is
 * rejected rather than quietly baked — `latin-ext2` would otherwise bake an
 * 8-glyph atlas of `latinex2` and report it as a success — while a literal
 * holding a separator (`AC/DC`, for a logotype) still bakes as itself unless
 * a file of that exact name happens to exist. */
export function resolveCharset(input: string): string {
  const preset = CHARSET_PRESETS[input]
  const read = (path: string) => {
    try {
      return readFileSync(path, 'utf8')
    } catch (error) {
      fail(`cannot read charset file ${path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  let raw: string
  if (preset !== undefined) {
    raw = preset
  } else if (existsSync(resolve(input))) {
    // a real file wins outright, whatever its name looks like
    raw = read(resolve(input))
  } else if (PATH_SHAPED.test(input) || PATH_PREFIXED.test(input)) {
    // only a name that can't be anything else gets reported as a missing file
    fail(`charset file not found: ${resolve(input)}`)
  } else if (PRESET_SHAPED.test(input)) {
    fail(
      `unknown charset preset ${JSON.stringify(input)} — presets are: ${Object.keys(CHARSET_PRESETS).join(', ')}. Ranges are not expanded; pass a file path or the literal characters instead.`
    )
  } else {
    raw = input
  }
  const charset = [...new Set(Array.from(raw.replace(/[\n\r]/g, '')))].join('')
  if (charset.length === 0) fail(`charset ${JSON.stringify(input)} resolved to no characters`)
  return charset
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
