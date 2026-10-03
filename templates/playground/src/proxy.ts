import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { markdownResponse } from '@/content/documents'
import { notAcceptableText } from '@/content/errors'
import { appendVaryAccept, decide } from '@/lib/accept'

/** Markdown content negotiation per acceptmarkdown.com: the same URL answers
 * with HTML for browsers and Markdown for agents, and says so with
 * `Vary: Accept`. All the ranking logic lives in `@/lib/accept`; this file only
 * turns a decision into a response. */
export function proxy(request: NextRequest) {
  const decision = decide({
    pathname: request.nextUrl.pathname,
    accept: request.headers.get('accept'),
    // RSC payload fetches carry `_rsc`; Next has to answer those itself
    isFlightRequest: request.nextUrl.searchParams.has('_rsc'),
    method: request.method,
  })

  switch (decision.kind) {
    case 'markdown':
      return markdownResponse(decision.document, request.method)

    case 'not-acceptable':
      return new NextResponse(notAcceptableText, {
        status: 406,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', Vary: 'Accept' },
      })

    case 'html': {
      // Next recomputes `Vary` for anything it renders, so this only lands on
      // responses it leaves alone; the Markdown branch above is where the
      // header matters and it owns its response outright.
      const response = NextResponse.next()
      appendVaryAccept(response.headers)
      return response
    }

    default:
      return NextResponse.next()
  }
}

export const config = {
  matcher: ['/((?!api/|_next/|_vercel/).*)'],
}
