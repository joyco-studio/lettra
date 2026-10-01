'use client'

import dynamic from 'next/dynamic'

/** The playground drives a WebGPU canvas and Metri's DOM tracking — strictly
 * a browser concern, so it must never run during prerender. */
const Playground = dynamic(() => import('./playground'), { ssr: false })

export function PlaygroundShell(props: { stageSource: string; specimenSource: string }) {
  return <Playground {...props} />
}
