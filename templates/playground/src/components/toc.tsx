'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
  const api = useRef({ lockTo: (_id: string) => {} })

  useEffect(() => {
    let raf = 0
    // While a TOC click smooth-scrolls, the spy is locked to the target —
    // otherwise the highlight machine-guns through every section the
    // animation passes. The lock clears when scrolling idles, or instantly
    // on any manual input (which also cancels the browser's smooth scroll).
    let lock: string | null = null
    let idleTimer = 0
    // hysteresis state: a switch needs two consecutive frames agreeing, and
    // the bottom clamp releases only 80px above the point it engaged
    // (trackpad rubber-banding oscillates scrollY around the maximum)
    let committed: string | null = null
    let candidate: string | null = null
    let clamped = false

    const pick = () => {
      raf = 0
      if (lock) return
      const line = window.innerHeight * 0.3
      let current = ids[0]
      for (const id of ids) {
        const element = document.getElementById(id)
        if (element && element.getBoundingClientRect().top <= line) current = id
      }
      const bottom = window.innerHeight + window.scrollY
      const max = document.documentElement.scrollHeight
      if (clamped) {
        if (bottom < max - 80) clamped = false
      } else if (bottom >= max - 2) {
        clamped = true
      }
      const next = clamped ? ids[ids.length - 1] : current
      if (next === committed) {
        candidate = null
        return
      }
      if (next === candidate) {
        committed = next
        candidate = null
        setActive(next)
      } else {
        candidate = next
        if (!raf) raf = requestAnimationFrame(pick)
      }
    }
    const armIdle = (ms: number) => {
      clearTimeout(idleTimer)
      idleTimer = window.setTimeout(() => {
        lock = null
        candidate = null
        if (!raf) raf = requestAnimationFrame(pick)
      }, ms)
    }
    const schedule = () => {
      if (lock) {
        armIdle(160)
        return
      }
      if (!raf) raf = requestAnimationFrame(pick)
    }
    api.current.lockTo = (id) => {
      lock = id
      committed = id
      candidate = null
      setActive(id)
      armIdle(900) // settles even if the click causes no scroll at all
    }

    pick()
    // layout can shift without a scroll or resize (code panels and
    // collapsibles opening); watch document size too
    const resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(document.body)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(idleTimer)
      resizeObserver.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [ids])

  return { active, lockTo: (id: string) => api.current.lockTo(id) }
}

/** Hub-style contents rail on fumadocs' TOC primitives. */
export function Toc({ sections }: { sections: TocSection[] }) {
  const toc = useMemo(
    () => sections.map((section) => ({ title: section.label, url: `#${section.id}`, depth: 2 })),
    [sections]
  )
  const ids = useMemo(() => sections.map((section) => section.id), [sections])
  const { active, lockTo } = useReadingLineActive(ids)

  return (
    <AnchorProvider toc={toc} single>
      <nav aria-label="Contents" className="flex flex-col gap-5">
        <span className="font-serif text-[15px] font-medium tracking-[0.01em] text-ink-faint">Contents</span>
        <ol className="flex flex-col gap-[8px]">
          {sections.map((section) => (
            <li key={section.id}>
              <TOCItem
                href={`#${section.id}`}
                onClick={() => lockTo(section.id)}
                className="group flex items-center gap-3"
              >
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
