import { NextResponse } from 'next/server'

const RETIRED_MESSAGE =
  'Legacy relay task polling has been disabled. Official-provider tasks are tracked by the application task/worker pipeline.'

export async function GET() {
  return NextResponse.json(
    {
      error: 'LEGACY_RELAY_DISABLED',
      message: RETIRED_MESSAGE,
    },
    { status: 410 },
  )
}
