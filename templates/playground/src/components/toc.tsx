import { useMemo } from 'react'
import { AnchorProvider, TOCItem, useActiveAnchors } from 'fumadocs-core/toc'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export interface TocSection {
  id: string
  index: string
  label: string
}

/** Hub-style contents rail. Scroll-spy comes from fumadocs-core's
 * AnchorProvider — the same primitives hub.joyco.studio uses — rather than a
 * hand-rolled observer, so it survives layout shifts, late-loading figures,
 * and the scrolled-to-bottom edge case. */
export function Toc({ sections }: { sections: TocSection[] }) {
  const toc = useMemo(
    () => sections.map((section) => ({ title: section.label, url: `#${section.id}`, depth: 2 })),
    [sections]
  )
  return (
    <AnchorProvider toc={toc} single>
      <nav aria-label="Contents" className="flex flex-col gap-5">
        <span className="font-mono text-[11px] leading-[16px] font-semibold tracking-[0.06em] text-ink-faint uppercase">
          contents
        </span>
        <TocItems sections={sections} />
      </nav>
    </AnchorProvider>
  )
}

function TocItems({ sections }: { sections: TocSection[] }) {
  const anchors = useActiveAnchors()
  const active = anchors[anchors.length - 1] ?? sections[0]?.id

  return (
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
  )
}
