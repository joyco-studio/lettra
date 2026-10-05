/** HTTP content negotiation for `Accept`, per the acceptmarkdown.com
 * conventions. Pure and side-effect free so the proxy stays a thin adapter
 * over it. Only two representations exist and HTML is the default: Markdown
 * is served when the client ranks it strictly above HTML, everything else
 * (including headers that name neither) gets HTML, as RFC 9110 permits. */

export interface AcceptEntry {
  type: string
  q: number
  /** `*\/*` = 0, `type/*` = 1, `type/subtype` = 2. */
  specificity: number
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

    entries.push({ type, q, specificity: specificityOf(type) })
  }

  return entries
}

const matches = (entry: AcceptEntry, candidate: string) => {
  if (entry.type === '*/*') return true
  if (entry.type.endsWith('/*')) return candidate.startsWith(entry.type.slice(0, -1))
  return entry.type === candidate
}

/** q of the most specific entry covering `candidate`, 0 when none does. */
const qFor = (entries: AcceptEntry[], candidate: string) => {
  let q = 0
  let specificity = -1
  for (const entry of entries) {
    if (!matches(entry, candidate)) continue
    if (entry.specificity > specificity) {
      specificity = entry.specificity
      q = entry.q
    }
  }
  return q
}

/** True when the header ranks text/markdown strictly above text/html. */
export function prefersMarkdown(header: string | null | undefined): boolean {
  if (!header?.trim()) return false
  const entries = parseAccept(header)
  return qFor(entries, 'text/markdown') > qFor(entries, 'text/html')
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

  if (prefersMarkdown(accept)) return { kind: 'markdown', document: documentPath(pathname) }
  return { kind: 'html' }
}
