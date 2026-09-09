import { NextResponse } from 'next/server'

/**
 * Legacy workflow endpoint removed.
 *
 * The previous implementation proxied image/video/music generation through
 * EvoLink. Production generation must go through the normal task/worker
 * pipeline, whose provider factory only permits first-party vendor APIs.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'LEGACY_RELAY_REMOVED',
      message: 'This relay-backed workflow endpoint has been removed. Use the project generation pipeline with an official provider.',
    },
    { status: 410 },
  )
}
