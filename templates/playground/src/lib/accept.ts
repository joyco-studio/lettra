/** HTTP content negotiation for `Accept`, per RFC 9110 §12.5.1 and the
 * acceptmarkdown.com conventions. Pure and side-effect free so the proxy stays
 * a thin adapter over it. */

/** Media types a document route can be represented as, most preferred first.
 * Ties in the client's `Accept` resolve toward the head of this list. */
export const REPRESENTATIONS = ['text/html', 'text/markdown'] as const

export type Representation = (typeof REPRESENTATIONS)[number]

export interface AcceptEntry {
  type: string
  q: number
  /** `*\/*` = 0, `type/*` = 1, `type/subtype` = 2. */
  specificity: number
  /** Position in the header, used to break specificity ties. */
  order: number
}

const clampQ = (value: string | undefined) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(0, Math.min(1, parsed))
}

const specificityOf = (type: string) => (type === '*/*' ? 0 : type.endsWith('/*') ? 1 : 2)

export function parseAccept(header: string): AcceptEntry[] {
  const entries: AcceptEntry[] = []

  for (const raw of header.split(',')) {
    const [rawType, ...params] = raw.split(';').map((part) => part.trim())
    const type = rawType.toLowerCase()
    if (!type || !type.includes('/')) continue

    let q = 1
    for (const param of params) {
      const separator = param.indexOf('=')
      if (separator === -1) continue
      if (param.slice(0, separator).trim().toLowerCase() !== 'q') continue
      q = clampQ(param.slice(separator + 1).trim())
    }

    entries.push({ type, q, specificity: specificityOf(type), order: entries.length })
  }

  return entries
}

const matches = (entry: AcceptEntry, candidate: string) => {
  if (entry.type === '*/*') return true
  if (entry.type.endsWith('/*')) return candidate.startsWith(entry.type.slice(0, -1))
  return entry.type === candidate
}

/** The most specific entry that covers `candidate`, or null when none does. */
const bestEntryFor = (entries: AcceptEntry[], candidate: string) => {
  let best: AcceptEntry | null = null
  for (const entry of entries) {
    if (!matches(entry, candidate)) continue
    if (best === null || entry.specificity > best.specificity) best = entry
  }
  return best
}

/** Which representation to serve, or null when the client accepts none of them
 * (the caller's cue to answer 406). A missing or empty header means the client
 * has no preference, so the default representation wins. */
export function preferredType(
  header: string | null | undefined,
  produces: readonly Representation[] = REPRESENTATIONS
): Representation | null {
  if (!header?.trim()) return produces[0] ?? null

  const entries = parseAccept(header)
  if (entries.length === 0) return produces[0] ?? null

  let chosen: Representation | null = null
  let chosenQ = 0
  let chosenOrder = Infinity

  for (const candidate of produces) {
    const entry = bestEntryFor(entries, candidate)
    // q=0 is an explicit refusal, not a weak preference
    if (!entry || entry.q === 0) continue
    if (entry.q > chosenQ || (entry.q === chosenQ && entry.order < chosenOrder)) {
      chosen = candidate
      chosenQ = entry.q
      chosenOrder = entry.order
    }
  }

  return chosen
}

/** Adds `Accept` to an existing `Vary` without clobbering what is already
 * listed (Next sets its own router tokens there). */
export function appendVaryAccept(headers: Headers): void {
  const existing = headers.get('Vary')
  if (!existing) {
    headers.set('Vary', 'Accept')
    return
  }
  const tokens = existing.split(',').map((token) => token.trim().toLowerCase())
  if (tokens.includes('accept') || tokens.includes('*')) return
  headers.set('Vary', `${existing}, Accept`)
}

export type Decision =
  /** Not a document route (static asset, flight request): leave it untouched. */
  | { kind: 'bypass' }
  /** Serve the usual HTML, with `Vary: Accept` added. */
  | { kind: 'html' }
  /** Serve the Markdown representation of the document route `document`. */
  | { kind: 'markdown'; document: string }
  /** Nothing we produce is acceptable to the client. */
  | { kind: 'not-acceptable' }

/** True when the URL asks for the Markdown representation by name. */
export const isMarkdownUrl = (pathname: string) => pathname.toLowerCase().endsWith('.md')

/** True for paths whose last segment carries an extension other than `.md`.
 * Those are files (atlases, icons, llms.txt, sitemap.xml) with exactly one
 * representation, so negotiating them would only break them. */
export function isAssetPath(pathname: string): boolean {
  const segment = pathname.slice(pathname.lastIndexOf('/') + 1)
  const dot = segment.lastIndexOf('.')
  if (dot <= 0) return false
  return segment.slice(dot + 1).toLowerCase() !== 'md'
}

/** Collapses an incoming path to the document route it addresses: `.md` is an
 * explicit request for the Markdown representation, and `/index` is the root. */
export function documentPath(pathname: string): string {
  let path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  if (path.toLowerCase().endsWith('.md')) path = path.slice(0, -3)
  if (path === '' || path === '/index') return '/'
  return path || '/'
}

export interface NegotiationRequest {
  pathname: string
  accept: string | null | undefined
  /** RSC payload fetch. Next must answer those itself, whatever the Accept. */
  isFlightRequest?: boolean
  method?: string
}

export function decide({ pathname, accept, isFlightRequest, method = 'GET' }: NegotiationRequest): Decision {
  if (method !== 'GET' && method !== 'HEAD') return { kind: 'bypass' }
  if (isFlightRequest) return { kind: 'bypass' }

  // a `.md` URL names the representation outright, no negotiation needed
  if (isMarkdownUrl(pathname)) return { kind: 'markdown', document: documentPath(pathname) }
  if (isAssetPath(pathname)) return { kind: 'bypass' }

  const chosen = preferredType(accept)
  if (chosen === 'text/markdown') return { kind: 'markdown', document: documentPath(pathname) }
  if (chosen === null) return { kind: 'not-acceptable' }
  return { kind: 'html' }
}
