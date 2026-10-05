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

export interface TocGroup {
  /** Rail heading. Links to `id` when the group opens with a real section. */
  label: string
  id?: string
  sections: TocSection[]
}

/** Reading-line spy; the 28%/36% hysteresis band stops boundary flapping. */
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

/** Hub-style contents rail on fumadocs' TOC primitives, grouped: the core
 * sections, the effects, then everything after. */
export function Toc({ groups }: { groups: TocGroup[] }) {
  const toc = useMemo(
    () =>
      groups.flatMap((group) => [
        ...(group.id ? [{ title: group.label, url: `#${group.id}`, depth: 2 }] : []),
        ...group.sections.map((section) => ({ title: section.label, url: `#${section.id}`, depth: 3 })),
      ]),
    [groups]
  )
  // document order, group anchors included, so the spy highlights the lead-in
  const ids = useMemo(
    () => groups.flatMap((group) => [...(group.id ? [group.id] : []), ...group.sections.map((s) => s.id)]),
    [groups]
  )
  const active = useReadingLineActive(ids)

  return (
    <AnchorProvider toc={toc}>
      <nav aria-label="Contents" className="flex flex-col gap-7">
        {groups.map((group) => {
          const heading = (
            <span
              className={cn(
                'font-serif text-[15px] font-medium tracking-[0.01em] transition-colors',
                active === group.id ? 'text-ink' : 'text-ink-faint'
              )}
            >
              {group.label}
            </span>
          )
          return (
            <div key={group.label} className="flex flex-col gap-5">
              {group.id ? (
                <TOCItem href={`#${group.id}`} className="w-fit">
                  {heading}
                </TOCItem>
              ) : (
                heading
              )}
              <ol className="flex flex-col gap-[8px]">
                {group.sections.map((section) => (
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
            </div>
          )
        })}
      </nav>
    </AnchorProvider>
  )
}
