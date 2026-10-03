import { absolute, README_URL } from '@/lib/site'

/** Keeps a requested path quotable inside Markdown: no backticks to escape the
 * code span, no newlines, bounded length. */
export function sanitizePath(pathname: string, maxLength = 120): string {
  const flattened = pathname.replace(/[\r\n\t]/g, ' ').replace(/`/g, '')
  const trimmed = flattened.length > maxLength ? `${flattened.slice(0, maxLength)}…` : flattened
  return trimmed || '/'
}

/** Markdown body for a 404, served when an agent asks for `text/markdown` at a
 * path that does not exist. Explains the error and points at every
 * machine-readable entry point the site has. */
export const notFoundMarkdown = (pathname: string) => `# 404 Not Found

No document exists at \`${sanitizePath(pathname)}\` on this host. The path is
wrong or the page was never published; nothing here moved.

Lettra's site is a single document, so the only page to read is the homepage.
Start from one of these instead:

- [Homepage as Markdown](${absolute('/index.md')}): the whole page, figures and API included
- [Homepage as HTML](${absolute('/')}): the live WebGPU specimen
- [llms.txt](${absolute('/llms.txt')}): when to reach for Lettra and how to call it
- [sitemap.xml](${absolute('/sitemap.xml')}): every URL on this host
- [README](${README_URL}): full API reference on GitHub

Any URL on this host answers to \`Accept: text/markdown\`.
`

/** 406 body. Plain text on purpose: the client just told us it accepts neither
 * representation, so the reply should not pretend otherwise. */
export const notAcceptableText = `406 Not Acceptable

This URL is available as text/html or text/markdown.
Retry with one of those in your Accept header.

Machine-readable index: ${absolute('/llms.txt')}
`
