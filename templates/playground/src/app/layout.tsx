import type { Metadata, Viewport } from 'next'
import { Roboto_Mono } from 'next/font/google'
import localFont from 'next/font/local'
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, siteUrl } from '@/lib/site'
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

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32' },
    ],
    apple: '/apple-touch-icon.png',
  },
  // og:image / twitter:image come from the app/opengraph-image.png and
  // app/twitter-image.png file conventions (plus their .alt.txt files)
  // title and description fall through from the fields above
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    url: siteUrl,
  },
  twitter: {
    card: 'summary_large_image',
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
