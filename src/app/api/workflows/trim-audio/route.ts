import { NextResponse } from 'next/server'

const RETIRED_MESSAGE =
  'Legacy relay-backed audio trimming/upload has been disabled. Store media through the application storage pipeline instead.'

export async function POST() {
  return NextResponse.json(
    {
      error: 'LEGACY_RELAY_DISABLED',
      message: RETIRED_MESSAGE,
    },
    { status: 410 },
  )
}
