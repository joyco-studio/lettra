import {
  absolute,
  LICENSE,
  LICENSE_URL,
  NPM_URL,
  ORG_NAME,
  ORG_URL,
  PACKAGE_NAME,
  README_URL,
  REPO_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  siteUrl,
} from '@/lib/site'

/** schema.org graph for the homepage. SoftwareApplication is the identity that
 * matches what this site is (a free developer library), with the publishing
 * studio and the site itself attached so an agent can resolve all three from
 * one payload. */
export function homeStructuredData() {
  const organizationId = `${ORG_URL}#organization`
  const applicationId = absolute('/#software')

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: ORG_NAME,
        url: ORG_URL,
        description: 'Design and engineering studio. Builds interactive web products and open-source tooling.',
        sameAs: ['https://github.com/joyco-studio', 'https://www.npmjs.com/org/joycostudio'],
      },
      {
        '@type': 'WebSite',
        '@id': absolute('/#website'),
        name: SITE_NAME,
        alternateName: PACKAGE_NAME,
        url: siteUrl,
        description: SITE_DESCRIPTION,
        inLanguage: 'en',
        publisher: { '@id': organizationId },
        about: { '@id': applicationId },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': applicationId,
        name: SITE_NAME,
        alternateName: PACKAGE_NAME,
        url: siteUrl,
        description: SITE_DESCRIPTION,
        applicationCategory: 'DeveloperApplication',
        applicationSubCategory: 'JavaScript library',
        operatingSystem: 'Web browser with WebGPU or WebGL2',
        programmingLanguage: 'TypeScript',
        license: LICENSE_URL,
        isAccessibleForFree: true,
        installUrl: NPM_URL,
        softwareHelp: { '@type': 'CreativeWork', url: README_URL },
        keywords: ['three.js', 'webgpu', 'tsl', 'msdf', 'sdf text', 'typography', 'bmfont', 'font atlas'],
        author: { '@id': organizationId },
        publisher: { '@id': organizationId },
        maintainer: { '@id': organizationId },
        sameAs: [REPO_URL, NPM_URL],
        offers: {
          '@type': 'Offer',
          price: 0,
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          url: NPM_URL,
        },
        // the package's own machine-readable brief for agents
        subjectOf: { '@type': 'CreativeWork', name: 'llms.txt', url: absolute('/llms.txt') },
        copyrightHolder: { '@id': organizationId },
        copyrightNotice: `${LICENSE} © ${ORG_NAME}`,
      },
    ],
  }
}

/** JSON.stringify with `<` escaped, so the payload can never close the script
 * element it is embedded in. */
export const serializeStructuredData = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c')
