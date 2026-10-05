import { notFoundMarkdown } from '@/content/errors'
import { homeMarkdown } from '@/content/home'
import { absolute } from '@/lib/site'

/** The Markdown representation of every document route, and the response that
 * carries it. Built in the proxy rather than a route handler on purpose: Next
 * appends its own `Vary` field line to anything the app renders, and a single
 * merged `Vary: Accept` is what acceptmarkdown.com asks for. */

/** Exactly one document route today. Add entries as pages land. */
const DOCUMENTS: Record<string, string> = {
  '/': homeMarkdown,
}

/** Same policy as the HTML page: revalidate every time. Keeps HTML and
 * Markdown from ever sharing a cached entry on a shared cache that mishandles
 * `Vary`, at no real cost for a body held in memory. */
const CACHE_CONTROL = 'public, max-age=0, must-revalidate'

export function markdownResponse(document: string, method = 'GET'): Response {
  const body = DOCUMENTS[document]
  const found = body !== undefined

  const headers = new Headers({
    'Content-Type': 'text/markdown; charset=utf-8',
    Vary: 'Accept',
    'Cache-Control': CACHE_CONTROL,
  })
  // the HTML at the same path is the canonical representation
  if (found) headers.set('Link', `<${absolute(document)}>; rel="canonical"`)

  return new Response(method === 'HEAD' ? null : (body ?? notFoundMarkdown(document)), {
    status: found ? 200 : 404,
    headers,
  })
}
