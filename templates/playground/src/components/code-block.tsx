'use client'

import { useEffect, useState } from 'react'

/* Minimal client highlighter for the live snippet only: TypeScript grammar,
 * one theme, JS regex engine — no wasm, no grammar universe. Everything
 * static is highlighted server-side at build (see app/page.tsx). */
async function createCore() {
  const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
    import('shiki/core'),
    import('shiki/engine/javascript'),
  ])
  return createHighlighterCore({
    themes: [import('shiki/themes/min-light.mjs')],
    langs: [import('shiki/langs/typescript.mjs')],
    engine: createJavaScriptRegexEngine(),
  })
}

let corePromise: ReturnType<typeof createCore> | null = null
const core = () => (corePromise ??= createCore())

const FRAME_CLASS = 'overflow-auto text-[13px] leading-[1.85] **:[pre]:!bg-transparent **:[pre]:px-5 **:[pre]:py-7 **:[pre]:font-mono'

export function CodeBlock({ code, html }: { code: string; lang?: string; html?: string }) {
  // cache keyed to the code that produced it, so a stale highlight never
  // renders against newer code (plain <pre> shows the current code instead)
  const [highlighted, setHighlighted] = useState<{ code: string; html: string } | null>(null)

  useEffect(() => {
    if (html) return
    let alive = true
    core()
      .then((highlighter) => highlighter.codeToHtml(code, { lang: 'typescript', theme: 'min-light' }))
      .then((result) => {
        if (alive) setHighlighted({ code, html: result })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [code, html])

  const rendered = html ?? (highlighted?.code === code ? highlighted.html : null)
  if (!rendered) {
    return <pre className="overflow-auto px-5 py-7 font-mono text-[13px] leading-[1.85] text-ink">{code}</pre>
  }
  return <div className={FRAME_CLASS} dangerouslySetInnerHTML={{ __html: rendered }} />
}
