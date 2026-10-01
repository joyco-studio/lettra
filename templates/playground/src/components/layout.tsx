import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { CodeBlock } from '@/components/code-block'

/** Same sliced corners as the badge, scaled up for panels. */
export const PANEL_CLIP =
  '[clip-path:polygon(10px_0%,100%_0%,100%_calc(100%-10px),calc(100%-10px)_100%,0%_100%,0%_10px)]'

const SCRAMBLE_CHARS = '#?*+/<>=-'

/** Label that decodes to "done" on trigger, then back — the letterpress
 * scramble, miniaturized for button feedback. */
export function useScrambleLabel(idle: string) {
  const [label, setLabel] = useState(idle)
  const timer = useRef(0)

  const animate = (target: string, onEnd?: () => void) => {
    let frame = 0
    const total = 7
    clearInterval(timer.current)
    timer.current = window.setInterval(() => {
      frame++
      const reveal = Math.floor((frame / total) * target.length)
      setLabel(
        target
          .split('')
          .map((char, i) => (i < reveal ? char : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]))
          .join('')
      )
      if (frame >= total) {
        clearInterval(timer.current)
        setLabel(target)
        onEnd?.()
      }
    }, 40)
  }

  useEffect(() => () => clearInterval(timer.current), [])

  const trigger = () => animate('done', () => setTimeout(() => animate(idle), 1100))
  return { label, trigger }
}

/** Copy button with a subtle chip background; the label scrambles to "done". */
export function CopyAction({
  text,
  tone = 'dark',
  label: idleLabel = 'copy',
}: {
  text: string
  tone?: 'dark' | 'light'
  label?: string
}) {
  const { label, trigger } = useScrambleLabel(idleLabel)
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {})
        trigger()
      }}
      className={cn(
        'cursor-pointer px-2 py-[3px] font-mono text-[10px] font-semibold tracking-[0.08em] transition-colors',
        tone === 'dark'
          ? 'bg-paper/10 text-paper/70 hover:bg-paper/20 hover:text-paper'
          : 'bg-ink/8 text-ink-faint hover:bg-ink/15 hover:text-ink'
      )}
    >
      {label}
    </button>
  )
}

export function Caption({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('font-mono text-[13px] leading-[16px] font-semibold tracking-[0.06em] uppercase', className)}>
      {children}
    </span>
  )
}

export function MonoButton({
  active,
  onClick,
  className,
  children,
}: {
  active?: boolean
  onClick: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'cursor-pointer px-2.5 py-[5px] font-mono text-[11px] font-semibold tracking-[0.04em] transition-colors',
        active ? 'bg-night text-paper' : 'bg-ink/8 text-ink-faint hover:bg-ink/15 hover:text-ink',
        className
      )}
    >
      {children}
    </button>
  )
}

/** Lowercase mono label for control rows — quiet, never uppercase. */
export function ControlLabel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('font-mono text-[11px] font-medium tracking-[0.02em] text-ink-faint', className)}>
      {children}
    </span>
  )
}

export function Prose({ className, children }: { className?: string; children: React.ReactNode }) {
  return <p className={cn('font-serif text-[16px] leading-[1.3] tracking-[0.01em] text-ink', className)}>{children}</p>
}

/** One page row: the section content in the prose column and an optional
 * aside in the right rail. On large screens both land in the same grid row
 * (explicit column + auto row placement); below `lg` the aside flows inline
 * right after its section. */
export function Row({
  id,
  className,
  asideClassName,
  children,
  aside,
}: {
  id?: string
  className?: string
  asideClassName?: string
  children: React.ReactNode
  aside?: React.ReactNode
}) {
  return (
    <>
      <section id={id} className={cn('min-w-0 scroll-mt-16 lg:col-start-1', className)}>
        {children}
      </section>
      <div className={cn('relative min-w-0 lg:col-start-2', asideClassName)}>{aside}</div>
    </>
  )
}

/** A code slab with real chrome: dark sliced-corner header carrying the
 * title and explicit actions (copy, optional hide), recessed plate body. */
export function CodePanel({
  title,
  code,
  lang,
  leading,
  onClose,
  maxHeight = 'max-h-[70vh]',
  className,
}: {
  title: string
  code: string
  lang?: string
  /** Rendered flush-left before the name tab (e.g. the code toggle). */
  leading?: React.ReactNode
  onClose?: () => void
  maxHeight?: string
  className?: string
}) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-gap">
          {leading}
          {/* tab: name only, width hugs content, corner cut on the right */}
          <div className="flex h-9 w-fit min-w-0 items-center bg-night pr-5 pl-4 [clip-path:polygon(0%_0%,calc(100%-10px)_0%,100%_10px,100%_100%,0%_100%)]">
            <span className="block truncate font-mono text-[10px] font-semibold tracking-[0.08em] text-paper">
              {title}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <CopyAction text={code} tone="light" />
          {onClose && (
            <button
              onClick={onClose}
              className="cursor-pointer font-mono text-[10px] font-semibold tracking-[0.08em] text-ink-faint transition-colors hover:text-ink"
            >
              hide
            </button>
          )}
        </div>
      </div>
      <div
        className={cn(
          'overflow-auto bg-[#dcdcda] [clip-path:polygon(0%_0%,100%_0%,100%_calc(100%-10px),calc(100%-10px)_100%,0%_100%)]',
          maxHeight
        )}
      >
        <CodeBlock code={code} lang={lang} />
      </div>
    </div>
  )
}

/** One-liner command with its own copy action — terminal-bar style. */
export function CommandLine({ command }: { command: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 bg-night py-2.5 pr-3 pl-4',
        '[clip-path:polygon(8px_0%,100%_0%,100%_calc(100%-8px),calc(100%-8px)_100%,0%_100%,0%_8px)]'
      )}
    >
      <code className="font-mono text-[13px] text-paper">{command}</code>
      <span className="flex-1" />
      <CopyAction text={command} tone="dark" />
    </div>
  )
}

/** The floating square code toggle — sits at the top-left of where the
 * snippet pops. */
export function CodeToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={active ? 'hide code' : 'view code'}
      aria-pressed={active}
      className={cn(
        'flex size-9 shrink-0 cursor-pointer items-center justify-center font-mono text-[12px] font-semibold transition-colors',
        active ? 'bg-night text-paper' : 'bg-ink/8 text-ink-faint hover:bg-ink/15 hover:text-ink'
      )}
    >
      {'</>'}
    </button>
  )
}

/** A toggleable code snippet for the right rail — a floating square toggle
 * top-aligned with its figure, the panel popping open to its right. Sticks
 * beside the figure on large screens, flows under it on small ones. */
export function SnippetPanel({
  open,
  title,
  code,
  lang,
  onToggle,
}: {
  open: boolean
  title: string
  code: string
  lang?: string
  onToggle: () => void
}) {
  return (
    <div className="sticky top-10 mt-10 lg:mt-0">
      {open ? (
        <CodePanel
          title={title}
          code={code}
          lang={lang}
          maxHeight="max-h-[80vh]"
          leading={<CodeToggle active onClick={onToggle} />}
        />
      ) : (
        <CodeToggle active={false} onClick={onToggle} />
      )}
    </div>
  )
}
