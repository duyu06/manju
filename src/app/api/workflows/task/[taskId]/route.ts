import { NextResponse } from 'next/server'

/** Legacy EvoLink task-polling relay removed. */
export async function GET() {
  return NextResponse.json(
    {
      error: 'LEGACY_RELAY_REMOVED',
      message: 'Use the internal task lifecycle endpoints backed by the application worker queues.',
    },
    { status: 410 },
  )
}
