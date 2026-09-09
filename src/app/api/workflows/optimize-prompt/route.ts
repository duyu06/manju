import { NextResponse } from 'next/server'

const RETIRED_MESSAGE =
  'Legacy relay-based prompt optimization has been disabled. Use the application official-provider text generation pipeline instead.'

export async function POST() {
  return NextResponse.json(
    {
      error: 'LEGACY_RELAY_DISABLED',
      message: RETIRED_MESSAGE,
    },
    { status: 410 },
  )
}
