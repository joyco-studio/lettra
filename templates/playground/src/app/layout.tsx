import type { Metadata, Viewport } from 'next'
import { Roboto_Mono } from 'next/font/google'
import localFont from 'next/font/local'
import './globals.css'

const sectra = localFont({
  src: [
    { path: '../fonts/GT-Sectra-Fine-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/GT-Sectra-Fine-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/GT-Sectra-Fine-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-sectra',
  display: 'swap',
})

const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  variable: '--font-roboto-mono',
  display: 'swap',
})

/** Public origin for absolute metadata URLs: explicit env first, then the
 * Vercel production domain, localhost only for local dev. */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000')

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Letterpress · sharp MSDF text for Three.js WebGPU',
  description:
    'Runtime MSDF text for Three.js WebGPURenderer + TSL. Baked atlas in, kerned layout and a composable node material out. No wasm, no shaper, sharp at any scale.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32' },
    ],
    apple: '/apple-touch-icon.png',
  },
  // og:image / twitter:image come from the app/opengraph-image.png and
  // app/twitter-image.png file conventions (plus their .alt.txt files)
  openGraph: {
    type: 'website',
    siteName: 'Letterpress',
    title: 'Letterpress · sharp MSDF text for Three.js WebGPU',
    description:
      'Runtime MSDF text for Three.js WebGPURenderer + TSL. Baked atlas in, kerned layout and a composable node material out.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Letterpress · sharp MSDF text for Three.js WebGPU',
    description: 'Runtime MSDF text for Three.js WebGPURenderer + TSL. No wasm, no shaper, sharp at any scale.',
  },
}

export const viewport: Viewport = {
  themeColor: '#e4e4e4',
  colorScheme: 'light',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sectra.variable} ${robotoMono.variable}`}>
      <body className="bg-paper text-ink antialiased">{children}</body>
    </html>
  )
}
