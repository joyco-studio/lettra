import { useEffect, useState } from 'react'

let highlighter: Promise<typeof import('shiki')> | null = null
const shiki = () => (highlighter ??= import('shiki'))

export function CodeBlock({ code, lang = 'typescript' }: { code: string; lang?: string }) {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    shiki()
      .then(({ codeToHtml }) =>
        codeToHtml(code, {
          lang,
          theme: 'min-light',
          // min-light's comments are near-invisible on the paper plate
          colorReplacements: { '#c2c3c5': '#8f8f8a' },
        })
      )
      .then((result) => {
        if (alive) setHtml(result)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [code, lang])

  if (!html) {
    return <pre className="overflow-auto px-5 py-7 font-mono text-[13px] leading-[1.85] text-ink">{code}</pre>
  }
  return (
    <div
      className="overflow-auto text-[13px] leading-[1.85] **:[pre]:!bg-transparent **:[pre]:px-5 **:[pre]:py-7 **:[pre]:font-mono"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
