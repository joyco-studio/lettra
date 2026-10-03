import { describe, expect, it } from 'vitest'
import { AGENT_PROMPT } from '@/content/agent-prompt'
import { notAcceptableText, notFoundMarkdown, sanitizePath } from '@/content/errors'
import { homeMarkdown } from '@/content/home'
import { llmsTxt } from '@/content/llms'

/** Links the audit asks a 404 body to offer: docs, sitemap, or llms.txt. */
const linkTargets = (markdown: string) => [...markdown.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1])

describe('homeMarkdown', () => {
  it('opens with a single H1 naming the product', () => {
    const lines = homeMarkdown.split('\n')
    expect(lines[0]).toMatch(/^# Lettra/)
    expect(lines.filter((line) => line.startsWith('# '))).toHaveLength(1)
  })

  it('covers the sections the HTML page covers', () => {
    for (const heading of ['## Getting started', '## How it works', '## Effects', '## Layout', '## Non-goals']) {
      expect(homeMarkdown).toContain(heading)
    }
  })

  it('carries the install command and the first-mesh call', () => {
    expect(homeMarkdown).toContain('pnpm add lettra three')
    expect(homeMarkdown).toContain('createText({')
    expect(homeMarkdown).toContain('text.warmup(renderer, camera, scene)')
  })

  it('embeds the same agent prompt the page button copies', () => {
    expect(homeMarkdown).toContain(AGENT_PROMPT)
  })

  it('points at the other machine-readable entry points', () => {
    const targets = linkTargets(homeMarkdown).join(' ')
    expect(targets).toContain('/llms.txt')
    expect(targets).toContain('/index.md')
    expect(targets).toContain('/sitemap.xml')
  })

  it('leaves no unresolved template placeholder', () => {
    expect(homeMarkdown).not.toMatch(/\$\{|undefined/)
  })
})

describe('llmsTxt', () => {
  it('follows the llmstxt.org shape: H1, then a blockquote summary', () => {
    const lines = llmsTxt.split('\n')
    expect(lines[0]).toBe('# Lettra')
    expect(lines[1]).toBe('')
    expect(lines[2].startsWith('> ')).toBe(true)
    expect(lines[2].length).toBeGreaterThan(40)
  })

  it('has exactly one H1 and uses H2 for every section', () => {
    const headings = llmsTxt.split('\n').filter((line) => /^#{1,6} /.test(line))
    expect(headings.filter((heading) => heading.startsWith('# '))).toHaveLength(1)
    expect(headings.filter((heading) => heading.startsWith('## ')).length).toBeGreaterThanOrEqual(3)
    expect(headings.every((heading) => /^(# |## )/.test(heading))).toBe(true)
  })

  it('carries the when-to-use guidance an agent needs to self-select', () => {
    expect(llmsTxt).toContain('## When to use this')
    const section = llmsTxt.slice(llmsTxt.indexOf('## When to use this'), llmsTxt.indexOf('## Docs'))
    expect(section).toContain('Reach for Lettra when')
    expect(section).toContain('Do not reach for Lettra when')
    // the jobs it is right for, named concretely
    expect(section).toMatch(/WebGPURenderer/)
    expect(section).toMatch(/Latin/)
    expect(section).toMatch(/@pmndrs\/glyph/)
  })

  it('tells an agent how to call it, not just what it is', () => {
    const section = llmsTxt.slice(llmsTxt.indexOf('## When to use this'), llmsTxt.indexOf('## Docs'))
    expect(section).toContain('pnpm add lettra three')
    expect(section).toContain("from 'lettra/three'")
    expect(section).toContain('createText({')
  })

  it('warns about the two traps that bite first-time integrations', () => {
    expect(llmsTxt).toContain('baked ahead of time')
    expect(llmsTxt).toContain('fontTools.varLib.instancer')
  })

  it('ends its link sections with reachable absolute URLs', () => {
    const targets = linkTargets(llmsTxt)
    expect(targets.length).toBeGreaterThan(8)
    for (const target of targets) expect(target).toMatch(/^https?:\/\//)
  })

  it('leaves no unresolved template placeholder', () => {
    expect(llmsTxt).not.toMatch(/\$\{|undefined/)
  })
})

describe('notFoundMarkdown', () => {
  const body = notFoundMarkdown('/__ora-404-probe-0nyb29v2')

  it('explains the error in well over the 20 characters agents are told to expect', () => {
    expect(body).toContain('# 404 Not Found')
    const prose = body.slice(body.indexOf('\n')).replace(/[-*#`\s]/g, '')
    expect(prose.length).toBeGreaterThan(20)
    expect(body).toContain('No document exists at')
  })

  it('quotes the path that was asked for', () => {
    expect(body).toContain('`/__ora-404-probe-0nyb29v2`')
  })

  it('links the docs, the sitemap, and llms.txt', () => {
    const targets = linkTargets(body).join(' ')
    expect(targets).toContain('/llms.txt')
    expect(targets).toContain('/sitemap.xml')
    expect(targets).toContain('/index.md')
    expect(targets).toContain('github.com/joyco-studio/lettra')
  })

  it('leaves no unresolved template placeholder', () => {
    expect(body).not.toMatch(/\$\{|undefined/)
  })
})

describe('sanitizePath', () => {
  it('passes ordinary paths through', () => {
    expect(sanitizePath('/docs/intro')).toBe('/docs/intro')
  })

  it('strips backticks so the path cannot break out of its code span', () => {
    expect(sanitizePath('/a`b`c')).toBe('/abc')
  })

  it('flattens newlines and tabs that would break the list that follows', () => {
    expect(sanitizePath('/a\nb\r\tc')).toBe('/a b  c')
  })

  it('truncates absurdly long paths', () => {
    const result = sanitizePath(`/${'x'.repeat(500)}`, 40)
    expect(result).toHaveLength(41)
    expect(result.endsWith('…')).toBe(true)
  })

  it('never returns an empty label', () => {
    expect(sanitizePath('')).toBe('/')
  })
})

describe('notAcceptableText', () => {
  it('names both representations so the client can retry', () => {
    expect(notAcceptableText).toContain('text/html')
    expect(notAcceptableText).toContain('text/markdown')
    expect(notAcceptableText).toContain('406')
  })
})
