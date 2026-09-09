import { NextResponse } from 'next/server'

/** Legacy EvoLink file-upload relay removed. */
export async function POST() {
  return NextResponse.json(
    {
      error: 'LEGACY_RELAY_REMOVED',
      message: 'Audio processing must store output through the application storage layer (MinIO/S3/local), not a third-party relay.',
    },
    { status: 410 },
  )
}
