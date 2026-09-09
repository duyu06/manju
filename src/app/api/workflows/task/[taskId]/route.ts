import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { pollAsyncTask } from '@/lib/async-poll'

const OFFICIAL_ASYNC_PREFIXES = [
  'ARK:',
  'GEMINI:',
  'GOOGLE:',
  'MINIMAX:',
  'VIDU:',
  'BAILIAN:',
]

function decodePayload(taskId: string): { kind: 'done' | 'external'; value: string } {
  const separator = taskId.indexOf('.')
  if (separator <= 0) throw new Error('WORKFLOW_TASK_ID_INVALID')
  const kind = taskId.slice(0, separator)
  if (kind !== 'done' && kind !== 'external') throw new Error('WORKFLOW_TASK_ID_INVALID')

  const encoded = taskId.slice(separator + 1)
  if (!encoded) throw new Error('WORKFLOW_TASK_ID_INVALID')
  return {
    kind,
    value: Buffer.from(encoded, 'base64url').toString('utf8'),
  }
}

export const GET = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ taskId: string }> },
) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const userId = authResult.session.user.id

  const { taskId } = await context.params
  let payload: ReturnType<typeof decodePayload>
  try {
    payload = decodePayload(taskId)
  } catch {
    return NextResponse.json({ error: 'WORKFLOW_TASK_ID_INVALID' }, { status: 400 })
  }

  if (payload.kind === 'done') {
    try {
      const parsed = JSON.parse(payload.value)
      const resultUrls = Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string')
        : []
      return NextResponse.json({
        status: 'completed',
        progress: 100,
        resultUrls,
        error: null,
      })
    } catch {
      return NextResponse.json({ error: 'WORKFLOW_TASK_RESULT_INVALID' }, { status: 400 })
    }
  }

  const externalId = payload.value.trim()
  if (!OFFICIAL_ASYNC_PREFIXES.some((prefix) => externalId.startsWith(prefix))) {
    return NextResponse.json(
      { error: 'OFFICIAL_PROVIDER_REQUIRED', message: 'Relay/compatibility workflow task ids are rejected.' },
      { status: 400 },
    )
  }

  const result = await pollAsyncTask(externalId, userId)
  const resultUrls = [result.resultUrl, result.imageUrl, result.videoUrl]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)

  return NextResponse.json({
    status: result.status,
    progress: result.status === 'completed' ? 100 : 50,
    resultUrls,
    error: result.error || null,
  })
})
