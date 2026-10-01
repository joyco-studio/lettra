'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnchorProvider, TOCItem } from 'fumadocs-core/toc'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export interface TocSection {
  id: string
  index: string
  label: string
}

/** Reading-line scroll-spy: the active section is the last one whose top has
 * passed 30% of the viewport, clamped to the final section at page bottom.
 * Rects are read fresh per (rAF-throttled) scroll event, so layout shifts
 * from late-loading figures can't go stale.
 *
 * fumadocs' own anchor observer still runs underneath (AnchorProvider +
 * TOCItem below), but its IntersectionObserver is hardcoded to
 * `threshold: 0.9` with no rootMargin — built for dense in-prose headings,
 * it cannot express "which viewport-tall section am I in" for this page's
 * seven sparse sections. We keep its rail mechanics and own the highlight. */
function useReadingLineActive(ids: string[]) {
  const [active, setActive] = useState(ids[0])

  useEffect(() => {
    let raf = 0
    const pick = () => {
      raf = 0
      const line = window.innerHeight * 0.3
      let current = ids[0]
      for (const id of ids) {
        const element = document.getElementById(id)
        if (element && element.getBoundingClientRect().top <= line) current = id
      }
      const bottomed = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
      setActive(bottomed ? ids[ids.length - 1] : current)
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(pick)
    }
    pick()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [ids])

  return active
}

/** Hub-style contents rail on fumadocs' TOC primitives. */
export function Toc({ sections }: { sections: TocSection[] }) {
  const toc = useMemo(
    () => sections.map((section) => ({ title: section.label, url: `#${section.id}`, depth: 2 })),
    [sections]
  )
  const ids = useMemo(() => sections.map((section) => section.id), [sections])
  const active = useReadingLineActive(ids)

  return (
    <AnchorProvider toc={toc} single>
      <nav aria-label="Contents" className="flex flex-col gap-5">
        <span className="font-serif text-[15px] font-medium tracking-[0.01em] text-ink-faint">Contents</span>
        <ol className="flex flex-col gap-[8px]">
          {sections.map((section) => (
            <li key={section.id}>
              <TOCItem href={`#${section.id}`} className="group flex items-center gap-3">
                <Badge
                  size="sm"
                  className={cn(
                    'w-7 justify-center border-transparent px-1.5 py-[2px] font-mono text-[10px] font-semibold tracking-[0.06em] tabular-nums transition-colors',
                    active === section.id ? 'bg-night text-paper' : 'bg-transparent text-ink-faint'
                  )}
                >
                  {section.index}
                </Badge>
                <span
                  className={cn(
                    'font-serif text-[16px] leading-none tracking-[0.01em] transition-colors',
                    active === section.id ? 'font-medium text-ink' : 'text-ink-faint group-hover:text-ink'
                  )}
                >
                  {section.label}
                </span>
              </TOCItem>
            </li>
          ))}
        </ol>
      </nav>
    </AnchorProvider>
  )
}
