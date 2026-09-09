import { NextResponse } from 'next/server'

/** Legacy EvoLink prompt-optimization relay removed. */
export async function POST() {
  return NextResponse.json(
    {
      error: 'LEGACY_RELAY_REMOVED',
      message: 'Prompt optimization must use the authenticated project LLM pipeline with an official provider.',
    },
    { status: 410 },
  )
}
