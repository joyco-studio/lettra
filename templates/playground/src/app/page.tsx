import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { codeToHtml } from 'shiki'
import Playground from '@/components/playground'
import { bakeRecipe, liquidSnippet, scrambleSnippet, wipeSnippet } from '@/lib/snippets'

const highlight = (code: string, lang: 'typescript' | 'bash') =>
  codeToHtml(code, { lang, theme: 'min-light' })

/** Server component. The implementation tabs show the real source files,
 * read and highlighted at build time — the client only ships a minimal
 * highlighter for the one snippet that rewrites live. */
export default async function Page() {
  const glDir = join(process.cwd(), 'src/gl')
  const stageSource = readFileSync(join(glDir, 'stage.ts'), 'utf8')
  const specimenSource = readFileSync(join(glDir, 'views/specimen.ts'), 'utf8')

  const [stage, specimen, bake, wipe, scramble, liquid] = await Promise.all([
    highlight(stageSource, 'typescript'),
    highlight(specimenSource, 'typescript'),
    highlight(bakeRecipe, 'bash'),
    highlight(wipeSnippet, 'typescript'),
    highlight(scrambleSnippet, 'typescript'),
    highlight(liquidSnippet, 'typescript'),
  ])

  return (
    <Playground
      stageSource={stageSource}
      specimenSource={specimenSource}
      highlighted={{ stage, specimen, bake, wipe, scramble, liquid }}
    />
  )
}
