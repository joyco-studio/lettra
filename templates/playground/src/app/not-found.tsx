import type { Metadata } from 'next'
import { absolute, README_URL, SITE_NAME } from '@/lib/site'

export const metadata: Metadata = {
  title: `404 · ${SITE_NAME}`,
  description: 'That page does not exist on this host. The Lettra homepage, llms.txt, and README are linked here.',
}

const LINKS: [string, string, string][] = [
  ['/', 'homepage', 'the live WebGPU specimen'],
  ['/index.md', 'index.md', 'the same page as Markdown'],
  ['/llms.txt', 'llms.txt', 'when to reach for Lettra, and how'],
  [README_URL, 'readme', 'full API on GitHub'],
]

/** Branded 404. Agents asking for `text/markdown` never reach this: the proxy
 * sends them to the Markdown representation, which 404s in Markdown. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[640px] flex-col justify-center px-6 py-20">
      <img src="/brand/logo-mark.svg" alt="" className="h-5 w-5 opacity-30" aria-hidden />

      <div className="mt-8 flex items-start gap-1">
        <h1 className="font-serif text-[32px] leading-[1.05] font-bold tracking-[-0.02em] text-ink">Nothing here</h1>
        <span className="font-mono text-[13px] leading-[16px] font-semibold tracking-[0.06em] text-ink-faint uppercase">
          [404]
        </span>
      </div>

      <p className="mt-6 font-serif text-[16px] leading-[1.3] tracking-[0.01em] text-ink">
        This URL has no page behind it. Lettra&apos;s site is a single document, so the homepage is almost certainly
        what you wanted.
      </p>

      <table className="mt-10 w-full border-collapse">
        <tbody className="divide-y divide-ink-faint/30">
          {LINKS.map(([href, label, note]) => (
            <tr key={href}>
              <td className="w-[150px] py-[7px] align-top">
                <a
                  href={href}
                  className="font-mono text-[12px] font-semibold tracking-[0.04em] text-ink underline decoration-1 underline-offset-2"
                >
                  {label}
                </a>
              </td>
              <td className="py-[7px] font-serif text-[14px] text-[#6b6b6b]">{note}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-10 font-serif text-[14px] text-[#6b6b6b]">
        Fetching this with <span className="font-mono text-[12.5px]">Accept: text/markdown</span> returns a Markdown 404
        instead. Full index at <span className="font-mono text-[12.5px]">{absolute('/llms.txt')}</span>.
      </p>
    </main>
  )
}
