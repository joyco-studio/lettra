import type { Metadata, Viewport } from 'next'
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

const lettra = localFont({
  src: [
    { path: '../fonts/PPLettraMono-Regular.woff2', weight: '100 350', style: 'normal' },
    { path: '../fonts/PPLettraMono-Medium.woff2', weight: '351 900', style: 'normal' },
  ],
  variable: '--font-lettra',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Letterpress — sharp MSDF text for Three.js WebGPU',
  description:
    'Runtime MSDF text for Three.js WebGPURenderer + TSL. Baked atlas in, kerned layout and a composable node material out — no wasm, no shaper, sharp at any scale.',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/favicon-32.png', sizes: '32x32' }],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'Letterpress',
    title: 'Letterpress — sharp MSDF text for Three.js WebGPU',
    description:
      'Runtime MSDF text for Three.js WebGPURenderer + TSL. Baked atlas in, kerned layout and a composable node material out.',
    images: [{ url: '/og.png', alt: 'Letterpress — get sharp, typed MSDF fonts in your scene' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Letterpress — sharp MSDF text for Three.js WebGPU',
    description: 'Runtime MSDF text for Three.js WebGPURenderer + TSL. No wasm, no shaper — sharp at any scale.',
    images: ['/og.png'],
  },
}

export const viewport: Viewport = {
  themeColor: '#e4e4e4',
  colorScheme: 'light',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sectra.variable} ${lettra.variable}`}>
      <body className="bg-paper text-ink antialiased">{children}</body>
    </html>
  )
}
