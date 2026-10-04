import { describe, expect, it } from 'vitest'
import { appendVaryAccept, decide, documentPath, isAssetPath, parseAccept, prefersMarkdown } from '@/lib/accept'

describe('parseAccept', () => {
  it('defaults q to 1', () => {
    expect(parseAccept('text/markdown, text/html')).toEqual([
      { type: 'text/markdown', q: 1, specificity: 2 },
      { type: 'text/html', q: 1, specificity: 2 },
    ])
  })

  it('reads q params regardless of spacing and case', () => {
    const entries = parseAccept('text/html ;  Q=0.8 , text/markdown;q=0.9')
    expect(entries.map((entry) => entry.q)).toEqual([0.8, 0.9])
  })

  it('clamps q outside 0..1 and falls back to 1 when unparseable', () => {
    expect(parseAccept('a/b;q=5, c/d;q=-2, e/f;q=zzz').map((entry) => entry.q)).toEqual([1, 0, 1])
  })

  it('ranks wildcards as less specific', () => {
    expect(parseAccept('*/*, text/*, text/html').map((entry) => entry.specificity)).toEqual([0, 1, 2])
  })

  it('skips entries that are not media types', () => {
    expect(parseAccept('text/html, , garbage, text/markdown').map((entry) => entry.type)).toEqual([
      'text/html',
      'text/markdown',
    ])
  })

  it('ignores parameters other than q', () => {
    expect(parseAccept('text/markdown;variant=GFM;q=0.4')).toEqual([{ type: 'text/markdown', q: 0.4, specificity: 2 }])
  })
})

describe('prefersMarkdown', () => {
  it('defaults to HTML when nothing is stated', () => {
    expect(prefersMarkdown(null)).toBe(false)
    expect(prefersMarkdown('')).toBe(false)
    expect(prefersMarkdown('   ')).toBe(false)
  })

  it('serves Markdown for the bare agent header', () => {
    expect(prefersMarkdown('text/markdown')).toBe(true)
  })

  it('serves HTML for a browser header', () => {
    const browser = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
    expect(prefersMarkdown(browser)).toBe(false)
  })

  it('ranks by q', () => {
    expect(prefersMarkdown('text/html;q=0.5, text/markdown;q=0.9')).toBe(true)
    expect(prefersMarkdown('text/markdown;q=0.2, text/html;q=0.7')).toBe(false)
  })

  it('breaks ties toward HTML, the default representation', () => {
    expect(prefersMarkdown('text/markdown, text/html')).toBe(false)
    expect(prefersMarkdown('text/*')).toBe(false)
    expect(prefersMarkdown('*/*')).toBe(false)
  })

  it('scores each type by its most specific match', () => {
    // text/markdown;q=0.1 is the most specific match for Markdown, so Markdown
    // scores 0.1 while */*;q=1 lets HTML score 1
    expect(prefersMarkdown('*/*, text/markdown;q=0.1')).toBe(false)
    expect(prefersMarkdown('*/*;q=0.1, text/markdown')).toBe(true)
  })

  it('treats q=0 as a refusal of that type', () => {
    expect(prefersMarkdown('text/markdown, text/html;q=0')).toBe(true)
    expect(prefersMarkdown('text/markdown;q=0, text/html')).toBe(false)
  })

  it('falls back to HTML when the header names neither representation', () => {
    expect(prefersMarkdown('application/pdf')).toBe(false)
    expect(prefersMarkdown('image/png, application/json;q=0.5')).toBe(false)
  })
})

describe('appendVaryAccept', () => {
  it('sets Vary when absent', () => {
    const headers = new Headers()
    appendVaryAccept(headers)
    expect(headers.get('Vary')).toBe('Accept')
  })

  it('appends to the tokens Next already set', () => {
    const headers = new Headers({ Vary: 'rsc, next-router-state-tree' })
    appendVaryAccept(headers)
    expect(headers.get('Vary')).toBe('rsc, next-router-state-tree, Accept')
  })

  it('does not duplicate an existing Accept, whatever its case', () => {
    const headers = new Headers({ Vary: 'rsc, ACCEPT' })
    appendVaryAccept(headers)
    expect(headers.get('Vary')).toBe('rsc, ACCEPT')
  })

  it('leaves Vary: * alone', () => {
    const headers = new Headers({ Vary: '*' })
    appendVaryAccept(headers)
    expect(headers.get('Vary')).toBe('*')
  })
})

describe('isAssetPath', () => {
  it('treats extensioned files as single-representation', () => {
    expect(isAssetPath('/robots.txt')).toBe(true)
    expect(isAssetPath('/sitemap.xml')).toBe(true)
    expect(isAssetPath('/llms.txt')).toBe(true)
    expect(isAssetPath('/favicon.svg')).toBe(true)
    expect(isAssetPath('/fonts/roboto.json')).toBe(true)
    expect(isAssetPath('/opengraph-image.png')).toBe(true)
  })

  it('leaves document routes and .md URLs negotiable', () => {
    expect(isAssetPath('/')).toBe(false)
    expect(isAssetPath('/docs/intro')).toBe(false)
    expect(isAssetPath('/index.md')).toBe(false)
    expect(isAssetPath('/INDEX.MD')).toBe(false)
  })

  it('ignores dots that are not an extension of the last segment', () => {
    expect(isAssetPath('/v1.2/guide')).toBe(false)
    expect(isAssetPath('/.well-known/foo')).toBe(false)
  })
})

describe('documentPath', () => {
  it('maps the Markdown URLs back onto their document route', () => {
    expect(documentPath('/index.md')).toBe('/')
    expect(documentPath('/')).toBe('/')
    expect(documentPath('/docs/intro.md')).toBe('/docs/intro')
    expect(documentPath('/docs/intro')).toBe('/docs/intro')
  })

  it('drops a trailing slash without treating it as a Markdown request', () => {
    expect(documentPath('/docs/')).toBe('/docs')
  })
})

describe('decide', () => {
  it('rewrites the homepage to Markdown for an agent', () => {
    expect(decide({ pathname: '/', accept: 'text/markdown' })).toEqual({ kind: 'markdown', document: '/' })
  })

  it('keeps serving HTML to browsers', () => {
    const browser = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    expect(decide({ pathname: '/', accept: browser })).toEqual({ kind: 'html' })
  })

  it('keeps serving HTML when no Accept is sent', () => {
    expect(decide({ pathname: '/', accept: null })).toEqual({ kind: 'html' })
  })

  it('serves HTML rather than 406 when the client names neither representation', () => {
    expect(decide({ pathname: '/', accept: 'application/pdf' })).toEqual({ kind: 'html' })
  })

  it('routes unknown paths to Markdown too, so the 404 can be Markdown', () => {
    expect(decide({ pathname: '/__ora-404-probe', accept: 'text/markdown' })).toEqual({
      kind: 'markdown',
      document: '/__ora-404-probe',
    })
  })

  it('honors a .md URL whatever the Accept header says', () => {
    expect(decide({ pathname: '/index.md', accept: 'text/html' })).toEqual({ kind: 'markdown', document: '/' })
  })

  it('leaves machine-readable files and assets untouched', () => {
    expect(decide({ pathname: '/llms.txt', accept: 'text/markdown' })).toEqual({ kind: 'bypass' })
    expect(decide({ pathname: '/robots.txt', accept: 'text/markdown' })).toEqual({ kind: 'bypass' })
    expect(decide({ pathname: '/sitemap.xml', accept: 'text/markdown' })).toEqual({ kind: 'bypass' })
    expect(decide({ pathname: '/fonts/lettra.png', accept: '*/*' })).toEqual({ kind: 'bypass' })
  })

  it('leaves RSC payload fetches to Next', () => {
    expect(decide({ pathname: '/', accept: 'text/markdown', isFlightRequest: true })).toEqual({ kind: 'bypass' })
  })

  it('only negotiates safe methods', () => {
    expect(decide({ pathname: '/', accept: 'text/markdown', method: 'POST' })).toEqual({ kind: 'bypass' })
    expect(decide({ pathname: '/', accept: 'text/markdown', method: 'HEAD' })).toEqual({
      kind: 'markdown',
      document: '/',
    })
  })
})
