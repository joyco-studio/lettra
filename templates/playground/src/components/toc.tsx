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

/** Reading-line scroll-spy with a hysteresis band, the missing piece in
 * every previous version (including pure fumadocs: with sparse sections its
 * closest-top fallback flaps N<->N+1 whenever an anchor hovers at a viewport
 * edge under trackpad jitter; dense-heading docs never engage that path).
 *
 * A section becomes active when its anchor crosses 28% of the viewport and
 * stays active until it falls back below 36%: an ~8vh dead band that scroll
 * jitter cannot cross. Anchor jumps are instant (no scroll-behavior:
 * smooth), so clicks land directly on the target with no lock needed. */
function useReadingLineActive(ids: string[]) {
  const [active, setActive] = useState(ids[0])

  useEffect(() => {
    let raf = 0
    let current = ids[0]

    const top = (id: string) => document.getElementById(id)?.getBoundingClientRect().top
    const pick = () => {
      raf = 0
      const advance = window.innerHeight * 0.28
      const retreat = window.innerHeight * 0.36
      let candidate = ids[0]
      for (const id of ids) {
        const t = top(id)
        if (t !== undefined && t <= advance) candidate = id
      }
      if (ids.indexOf(candidate) < ids.indexOf(current)) {
        // retreating: hold the current section inside the dead band
        const t = top(current)
        if (t !== undefined && t <= retreat) candidate = current
      }
      const bottom = window.innerHeight + window.scrollY
      const max = document.documentElement.scrollHeight
      const last = ids[ids.length - 1]
      if (bottom >= max - 2) candidate = last
      else if (current === last && bottom >= max - 80) candidate = last
      if (candidate !== current) {
        current = candidate
        setActive(candidate)
      }
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(pick)
    }

    pick()
    // layout can shift without scroll or resize (panels, collapsibles)
    const resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(document.body)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [ids])

  return active
}

/** Hub-style contents rail on fumadocs' TOC primitives; the highlight comes
 * from the banded reading-line spy above. */
export function Toc({ sections }: { sections: TocSection[] }) {
  const toc = useMemo(
    () => sections.map((section) => ({ title: section.label, url: `#${section.id}`, depth: 2 })),
    [sections]
  )
  const ids = useMemo(() => sections.map((section) => section.id), [sections])
  const active = useReadingLineActive(ids)

  return (
    <AnchorProvider toc={toc}>
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
