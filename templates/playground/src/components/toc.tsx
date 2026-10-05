'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

/** Fraction of the viewport where a section becomes "the one you're reading".
 * Anchors carry the matching scroll-margin (see `Row` in layout.tsx), so a
 * click lands exactly on this line and the spy agrees with it by construction. */
export const READING_LINE = 0.28
/** Backward hysteresis band; wider than READING_LINE so boundaries don't flap. */
const RETREAT_LINE = 0.36
/** An anchor jump lands exactly on the line, so sub-pixel rounding decides a
 * strict comparison. Tolerate a hair past it. */
const LINE_EPSILON = 2

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

/** Two mutually exclusive modes, not one field with two writers: while seeking,
 * the spy keeps measuring but the click owns the highlight. */
type Spy = { phase: 'spying' } | { phase: 'seeking'; target: string }

/** The spy must commit before paint or a deep link shows section 01 for a
 * frame; layout effects don't run on the server, so fall back there. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** Reading-line spy. Returns the section under the line; `seeking` suspends the
 * bottom-of-page clamp so a pinned click can't be outranked by it. */
function useReadingLineActive(ids: string[], spy: Spy) {
  const [observed, setObserved] = useState(ids[0])
  const seeking = spy.phase === 'seeking'
  const seekingRef = useRef(seeking)
  seekingRef.current = seeking

  useIsomorphicLayoutEffect(() => {
    let raf = 0
    // empty, so the first measurement always commits — the SSR'd ids[0] is a
    // guess and a hash deep link lands somewhere else entirely
    let current = ''

    const top = (id: string) => document.getElementById(id)?.getBoundingClientRect().top
    const pick = () => {
      raf = 0
      const advance = window.innerHeight * READING_LINE + LINE_EPSILON
      const retreat = window.innerHeight * RETREAT_LINE
      let candidate = ids[0]
      for (const id of ids) {
        const t = top(id)
        if (t !== undefined && t <= advance) candidate = id
      }
      if (ids.indexOf(candidate) < ids.indexOf(current)) {
        const t = top(current)
        if (t !== undefined && t <= retreat) candidate = current
      }
      if (!seekingRef.current) {
        const bottom = window.innerHeight + window.scrollY
        const max = document.documentElement.scrollHeight
        const last = ids[ids.length - 1]
        if (bottom >= max - 2) candidate = last
        else if (current === last && bottom >= max - 80) candidate = last
      }
      if (candidate !== current) {
        current = candidate
        setObserved(candidate)
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

  return observed
}

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

/** Pins the highlight to a clicked target and releases it on real user scroll
 * intent — not on scrollend, which would hand control back while late layout
 * shifts (font swap, figure sizing) are still moving the anchors. */
function useSeek() {
  const [spy, setSpy] = useState<Spy>({ phase: 'spying' })
  const seeking = spy.phase === 'seeking'

  useEffect(() => {
    if (!seeking) return
    const release = () => setSpy({ phase: 'spying' })
    const onKey = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key)) release()
    }
    window.addEventListener('wheel', release, { passive: true })
    window.addEventListener('touchstart', release, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('wheel', release)
      window.removeEventListener('touchstart', release)
      window.removeEventListener('keydown', onKey)
    }
  }, [seeking])

  const seek = useCallback((target: string) => setSpy({ phase: 'seeking', target }), [])
  return { spy, seek }
}

/** Hub-style contents rail, grouped: the core sections, the effects, the
 * composition seam, then everything after. */
export function Toc({ groups }: { groups: TocGroup[] }) {
  // sections only: a group's lead-in is the top of that group, not a place of
  // its own, so the spy never parks on a 200px sliver between two sections
  const ids = useMemo(() => groups.flatMap((group) => group.sections.map((s) => s.id)), [groups])
  // id -> where it sits in the rail, so one measured position lights both the
  // section and the group containing it instead of them fighting over one slot
  const place = useMemo(() => {
    const map = new Map<string, { group: string; section?: string }>()
    for (const group of groups) {
      if (group.id) map.set(group.id, { group: group.label })
      for (const section of group.sections) map.set(section.id, { group: group.label, section: section.id })
    }
    return map
  }, [groups])

  const { spy, seek } = useSeek()
  const observed = useReadingLineActive(ids, spy)
  const active = spy.phase === 'seeking' ? spy.target : observed
  const at = place.get(active)

  return (
    <nav aria-label="Contents" className="flex flex-col gap-7">
      {groups.map((group) => {
        const heading = (
          <span
            className={cn(
              'font-serif text-[15px] font-medium tracking-[0.01em]',
              group.id && at?.group === group.label ? 'text-ink' : 'text-ink-faint'
            )}
          >
            {group.label}
          </span>
        )
        return (
          <div key={group.label} className="flex flex-col gap-5">
            {group.id ? (
              <a href={`#${group.id}`} className="w-fit" onClick={() => seek(group.id!)}>
                {heading}
              </a>
            ) : (
              heading
            )}
            <ol className="flex flex-col gap-[8px]">
              {group.sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="group flex items-center gap-3"
                    aria-current={at?.section === section.id ? 'location' : undefined}
                    onClick={() => seek(section.id)}
                  >
                    <Badge
                      size="sm"
                      className={cn(
                        'w-7 justify-center border-transparent px-1.5 py-[2px] font-mono text-[10px] font-semibold tracking-[0.06em] tabular-nums',
                        at?.section === section.id ? 'bg-night text-paper' : 'bg-transparent text-ink-faint'
                      )}
                    >
                      {section.index}
                    </Badge>
                    <span
                      className={cn(
                        'font-serif text-[16px] leading-none tracking-[0.01em]',
                        at?.section === section.id ? 'text-ink' : 'text-ink-faint group-hover:text-ink'
                      )}
                    >
                      {section.label}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        )
      })}
    </nav>
  )
}
