/** Identity of the published site, shared by metadata, structured data, and
 * the machine-readable representations (Markdown, llms.txt, robots, sitemap). */

/** Public origin for absolute URLs: explicit env first, then the Vercel
 * production domain, localhost only for local dev. Only the NEXT_PUBLIC_ branch
 * survives into a client bundle, so set it if a client component ever needs an
 * absolute URL. */
export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000')

export const absolute = (path: string) => new URL(path, siteUrl).toString()

export const SITE_NAME = 'Lettra'
export const PACKAGE_NAME = 'lettra'
export const SITE_TITLE = 'Lettra · sharp MSDF text for Three.js WebGPU'

export const SITE_DESCRIPTION =
  'Runtime MSDF text for Three.js WebGPURenderer + TSL. Baked atlas in, kerned layout and a composable node material out. No wasm, no shaper, sharp at any scale.'

export const SITE_SUMMARY =
  'Runtime MSDF text for Three.js WebGPURenderer + TSL. Bake a font atlas once, then render sharp, kerned, animatable Latin text with no runtime shaper and no wasm, in about 5 KB gzipped.'

export const REPO_URL = 'https://github.com/joyco-studio/lettra'
export const README_URL = `${REPO_URL}#readme`
export const ISSUES_URL = `${REPO_URL}/issues`
export const NPM_URL = 'https://www.npmjs.com/package/lettra'
export const ORG_NAME = 'JOYCO'
export const ORG_URL = 'https://joyco.studio'
export const LICENSE = 'MIT'
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`
