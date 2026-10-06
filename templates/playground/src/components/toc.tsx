'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

/** Fraction of the viewport where a section becomes "the one you're reading".
 * Anchors carry the matching scroll-margin (see `Row` in layout.tsx), so a
 * click lands exactly on this line and the spy agrees with it by construction.
 * That coupling is hand-held: Tailwind can't read this constant, so `Row`
 * repeats it as `scroll-mt-[28vh]` — and in `vh`, the large viewport, while
 * this measures `window.innerHeight`, the current one. They agree on desktop;
 * give the rail a mobile drawer and a visible toolbar will split them. */
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
/** How long scrolling must stay quiet before the pin lets go. Long enough to
 * outlast a font swap or a figure settling, short enough to feel immediate. */
const SETTLE_MS = 700

/** Pins the highlight to a clicked target and releases it on real user scroll
 * intent — not on scrollend, which would hand control back while late layout
 * shifts (font swap, figure sizing) are still moving the anchors. */
function useSeek() {
  const [spy, setSpy] = useState<Spy>({ phase: 'spying' })
  const seeking = spy.phase === 'seeking'

  useEffect(() => {
    if (!seeking) return
    let idle = 0
    const release = () => {
      window.clearTimeout(idle)
      setSpy({ phase: 'spying' })
    }
    const onKey = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key)) release()
    }
    // wheel, touch and keys are the fast paths, but a scrollbar drag,
    // middle-click autoscroll or find-in-page fires none of them and would
    // leave the pin stuck for good. So also let go once scrolling goes quiet —
    // the grace period is what separates this from bare scrollend, since a
    // late layout shift still fires scroll and defers it.
    // Not hashchange: the click's own jump to #id fires it, which would
    // release the pin the click just set. popstate covers Back/Forward, and
    // only fires on history traversal, never on our own navigation.
    const onScroll = () => {
      window.clearTimeout(idle)
      idle = window.setTimeout(release, SETTLE_MS)
    }
    // arm it now: clicking a link to a section already on screen scrolls
    // nowhere, so there may never be a scroll event to start the clock
    onScroll()
    window.addEventListener('wheel', release, { passive: true })
    window.addEventListener('touchstart', release, { passive: true })
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('popstate', release)
    return () => {
      window.clearTimeout(idle)
      window.removeEventListener('wheel', release)
      window.removeEventListener('touchstart', release)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('popstate', release)
    }
    // keyed on the whole state, so clicking a second link restarts the clock
  }, [spy, seeking])

  const seek = useCallback((target: string) => setSpy({ phase: 'seeking', target }), [])
  return { spy, seek }
}

/** Hub-style contents rail, grouped: the core sections, the effects, the
 * composition seam, then everything after. */
export function Toc({ groups }: { groups: TocGroup[] }) {
  // group lead-ins are measured alongside sections, in document order, but
  // `place` maps them onto the group rather than a row of their own — so
  // reading the Effects intro lights "Effects", instead of leaving the
  // highlight on the last section of the group above it
  const ids = useMemo(
    () => groups.flatMap((group) => [...(group.id ? [group.id] : []), ...group.sections.map((s) => s.id)]),
    [groups]
  )
  // id -> where it sits in the rail, so one measured position lights both the
  // section and the group containing it instead of them fighting over one slot.
  // Keyed by group index: labels are display text, not identity.
  const place = useMemo(() => {
    const map = new Map<string, { group: number; section?: string }>()
    groups.forEach((group, index) => {
      if (group.id) map.set(group.id, { group: index })
      for (const section of group.sections) map.set(section.id, { group: index, section: section.id })
    })
    return map
  }, [groups])

  const { spy, seek } = useSeek()
  const observed = useReadingLineActive(ids, spy)
  const active = spy.phase === 'seeking' ? spy.target : observed
  const at = place.get(active)

  return (
    <nav aria-label="Contents" className="flex flex-col gap-7">
      {groups.map((group, groupIndex) => {
        // one rule for the whole rail: a navigable item shows whether it is
        // current; a plain label never does
        const groupCurrent = group.id !== undefined && at?.group === groupIndex
        const heading = (
          <span
            className={cn(
              'font-serif text-[15px] font-medium tracking-[0.01em]',
              groupCurrent ? 'text-ink' : 'text-ink-faint',
              group.id ? 'group-hover/head:text-ink' : ''
            )}
          >
            {group.label}
          </span>
        )
        return (
          <div key={group.id ?? group.label} className="flex flex-col gap-5">
            {group.id ? (
              <a
                href={`#${group.id}`}
                className="group/head w-fit"
                aria-current={groupCurrent ? 'location' : undefined}
                onClick={() => seek(group.id!)}
              >
                {heading}
              </a>
            ) : (
              heading
            )}
            <ol className="flex flex-col gap-[8px]">
              {group.sections.map((section) => {
                const current = at?.section === section.id
                return (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="group flex items-center gap-3"
                      aria-current={current ? 'location' : undefined}
                      onClick={() => seek(section.id)}
                    >
                      <Badge
                        size="sm"
                        className={cn(
                          'w-7 justify-center border-transparent px-1.5 py-[2px] font-mono text-[10px] font-semibold tracking-[0.06em] tabular-nums',
                          current ? 'bg-night text-paper' : 'bg-transparent text-ink-faint group-hover:text-ink'
                        )}
                      >
                        {section.index}
                      </Badge>
                      <span
                        className={cn(
                          'font-serif text-[16px] leading-none tracking-[0.01em]',
                          current ? 'text-ink' : 'text-ink-faint group-hover:text-ink'
                        )}
                      >
                        {section.label}
                      </span>
                    </a>
                  </li>
                )
              })}
            </ol>
          </div>
        )
      })}
    </nav>
  )
}
