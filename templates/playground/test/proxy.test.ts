import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { markdownResponse } from '@/content/documents'
import { proxy } from '@/proxy'

const request = (path: string, accept?: string, method = 'GET') =>
  new NextRequest(new URL(path, 'https://lettra.joyco.studio'), {
    method,
    headers: accept ? { accept } : undefined,
  })

/** Set when the proxy handed the request back to Next instead of answering. */
const passedThrough = (response: Response) => response.headers.has('x-middleware-next')

describe('proxy', () => {
  it('answers an Accept: text/markdown homepage request with Markdown', async () => {
    const response = proxy(request('/', 'text/markdown'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8')
    expect(await response.text()).toContain('# Lettra')
  })

  it('sets exactly one Vary header, so no client has to merge field lines', () => {
    const response = proxy(request('/', 'text/markdown'))
    expect(response.headers.get('Vary')).toBe('Accept')
  })

  it('404s in Markdown at a path that does not exist', async () => {
    const response = proxy(request('/__ora-404-probe-0nyb29v2', 'text/markdown'))
    expect(response.status).toBe(404)
    expect(response.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8')
    expect(response.headers.get('Vary')).toBe('Accept')
    const body = await response.text()
    expect(body).toContain('# 404 Not Found')
    expect(body).toContain('/__ora-404-probe-0nyb29v2')
    expect(body).toContain('/llms.txt')
  })

  it('serves .md URLs whatever the Accept header says', async () => {
    const response = proxy(request('/index.md', 'text/html'))
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('# Lettra')
  })

  it('hands HTML requests back to Next, adding Vary', () => {
    const response = proxy(request('/', 'text/html,application/xhtml+xml,*/*;q=0.8'))
    expect(passedThrough(response)).toBe(true)
    expect(response.headers.get('Vary')).toBe('Accept')
  })

  it('serves HTML rather than 406 when the client names neither representation', () => {
    const response = proxy(request('/', 'application/pdf'))
    expect(passedThrough(response)).toBe(true)
    expect(response.headers.get('Vary')).toBe('Accept')
  })

  it('does not negotiate llms.txt, robots.txt, the sitemap, or the atlases', () => {
    for (const path of ['/llms.txt', '/robots.txt', '/sitemap.xml', '/fonts/lettra.png']) {
      const response = proxy(request(path, 'text/markdown'))
      expect(passedThrough(response)).toBe(true)
      expect(response.headers.get('Vary')).toBeNull()
    }
  })

  it('leaves RSC payload fetches to Next', () => {
    const response = proxy(request('/?_rsc=abc12', 'text/markdown'))
    expect(passedThrough(response)).toBe(true)
    expect(response.headers.get('Vary')).toBeNull()
  })

  it('answers HEAD with the headers but no body', async () => {
    const response = proxy(request('/', 'text/markdown', 'HEAD'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8')
    expect(await response.text()).toBe('')
  })
})

describe('markdownResponse', () => {
  it('declares the HTML page as the canonical representation', () => {
    expect(markdownResponse('/').headers.get('Link')).toMatch(/^<https?:\/\/.+>; rel="canonical"$/)
  })

  it('claims no canonical for a page that does not exist', () => {
    expect(markdownResponse('/nope').headers.get('Link')).toBeNull()
  })

  it('tells shared caches to revalidate rather than reuse a representation', () => {
    expect(markdownResponse('/').headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate')
  })
})
