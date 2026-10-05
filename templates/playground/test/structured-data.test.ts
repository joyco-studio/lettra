import { describe, expect, it } from 'vitest'
import { homeStructuredData, serializeStructuredData } from '@/lib/structured-data'

const graph = homeStructuredData()
/** The graph is a heterogeneous literal; read it the way a consumer would. */
const nodes = graph['@graph'] as Record<string, any>[]
const nodeOf = (type: string) => nodes.find((node) => node['@type'] === type)

describe('homeStructuredData', () => {
  it('is a schema.org graph', () => {
    expect(graph['@context']).toBe('https://schema.org')
    expect(Array.isArray(nodes)).toBe(true)
  })

  it('declares the identity types the site actually has', () => {
    expect(nodes.map((node) => node['@type'])).toEqual(['Organization', 'WebSite', 'SoftwareApplication'])
  })

  it('gives the application the fields an agent parses first', () => {
    const app = nodeOf('SoftwareApplication')
    expect(app).toMatchObject({
      name: 'Lettra',
      alternateName: 'lettra',
      applicationCategory: 'DeveloperApplication',
      isAccessibleForFree: true,
    })
    expect(app?.description).toMatch(/MSDF/)
    expect(app?.url).toMatch(/^https?:\/\//)
  })

  it('prices the free offer explicitly rather than implying it', () => {
    expect(nodeOf('SoftwareApplication')?.offers).toMatchObject({
      '@type': 'Offer',
      price: 0,
      priceCurrency: 'USD',
    })
  })

  it('links the repository and the npm package through sameAs', () => {
    const sameAs = nodeOf('SoftwareApplication')?.sameAs as string[]
    expect(sameAs).toContain('https://github.com/joyco-studio/lettra')
    expect(sameAs).toContain('https://www.npmjs.com/package/lettra')
  })

  it('resolves author, publisher, and maintainer to the one Organization node', () => {
    const app = nodeOf('SoftwareApplication')
    const organizationId = nodeOf('Organization')?.['@id']
    expect(organizationId).toBeTruthy()
    for (const key of ['author', 'publisher', 'maintainer', 'copyrightHolder'] as const) {
      expect(app?.[key]).toEqual({ '@id': organizationId })
    }
  })

  it('points the website node at the application it is about', () => {
    expect(nodeOf('WebSite')?.about).toEqual({ '@id': nodeOf('SoftwareApplication')?.['@id'] })
  })

  it('surfaces llms.txt as the agent-facing brief', () => {
    expect((nodeOf('SoftwareApplication')?.subjectOf as { url: string }).url).toMatch(/\/llms\.txt$/)
  })

  it('has no node without an @id, so every reference resolves', () => {
    for (const node of nodes) expect(node['@id']).toBeTruthy()
  })
})

describe('serializeStructuredData', () => {
  it('round-trips through JSON', () => {
    expect(JSON.parse(serializeStructuredData(graph))).toEqual(JSON.parse(JSON.stringify(graph)))
  })

  it('escapes < so the payload cannot close its own script element', () => {
    const serialized = serializeStructuredData({ evil: '</script><script>alert(1)</script>' })
    expect(serialized).not.toContain('</script>')
    expect(serialized).toContain('\\u003c')
    expect(JSON.parse(serialized)).toEqual({ evil: '</script><script>alert(1)</script>' })
  })
})
