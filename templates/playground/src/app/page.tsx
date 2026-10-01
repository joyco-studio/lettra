import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PlaygroundShell } from '@/components/playground-shell'

/** Server component: the implementation tabs show the real source files,
 * read at render time — no bundler ?raw imports to keep in sync. */
export default function Page() {
  const glDir = join(process.cwd(), 'src/gl')
  const stageSource = readFileSync(join(glDir, 'stage.ts'), 'utf8')
  const specimenSource = readFileSync(join(glDir, 'views/specimen.ts'), 'utf8')
  return <PlaygroundShell stageSource={stageSource} specimenSource={specimenSource} />
}
