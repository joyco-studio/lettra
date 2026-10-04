import { llmsTxt } from '@/content/llms'

/** /llms.txt, the llmstxt.org entry point. Plain text so a browser shows it
 * inline, which is also how llmstxt.org serves its own. */
export async function GET() {
  return new Response(llmsTxt, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}
