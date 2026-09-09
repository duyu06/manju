import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { resolveModelSelectionOrSingle } from '@/lib/api-config'
import { generateImage, generateVideo } from '@/lib/generator-api'
import type { GenerateResult } from '@/lib/generators/base'

const OFFICIAL_ASYNC_PREFIXES = [
  'ARK:',
  'GEMINI:',
  'GOOGLE:',
  'MINIMAX:',
  'VIDU:',
  'BAILIAN:',
]

function encodePayload(kind: 'done' | 'external', value: string): string {
  return `${kind}.${Buffer.from(value, 'utf8').toString('base64url')}`
}

function taskResponseFromResult(result: GenerateResult) {
  if (!result.success) {
    return NextResponse.json(
      { error: result.error || 'Generation failed' },
      { status: 502 },
    )
  }

  const resultUrls = [
    ...(result.imageUrls || []),
    result.imageUrl,
    result.videoUrl,
    result.audioUrl,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)

  if (resultUrls.length > 0) {
    return NextResponse.json({
      taskId: encodePayload('done', JSON.stringify(resultUrls)),
      status: 'completed',
    })
  }

  const externalId = typeof result.externalId === 'string' ? result.externalId.trim() : ''
  if (result.async && externalId) {
    if (!OFFICIAL_ASYNC_PREFIXES.some((prefix) => externalId.startsWith(prefix))) {
      return NextResponse.json(
        { error: 'OFFICIAL_PROVIDER_REQUIRED', message: `Unsupported async provider task: ${externalId.split(':', 1)[0]}` },
        { status: 400 },
      )
    }
    return NextResponse.json({
      taskId: encodePayload('external', externalId),
      status: 'processing',
    })
  }

  return NextResponse.json(
    { error: 'GENERATION_RESULT_EMPTY', message: 'Official provider returned no result URL or supported async task id.' },
    { status: 502 },
  )
}

function readExplicitModelKey(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.includes('::') ? trimmed : undefined
}

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const userId = authResult.session.user.id

  const body = await request.json() as Record<string, unknown>
  const step = typeof body.step === 'string' ? body.step : ''

  if (step === 'music') {
    return NextResponse.json(
      {
        error: 'UNSUPPORTED_OFFICIAL_PROVIDER',
        message: 'Music generation is disabled until a first-party music provider is configured.',
      },
      { status: 501 },
    )
  }

  if (step === 'image') {
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (!prompt) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })

    const selection = await resolveModelSelectionOrSingle(
      userId,
      readExplicitModelKey(body.model),
      'image',
    )
    const result = await generateImage(userId, selection.modelKey, prompt, {
      aspectRatio: typeof body.size === 'string' ? body.size : undefined,
      resolution: typeof body.resolution === 'string' ? body.resolution : undefined,
      outputFormat: typeof body.outputFormat === 'string' ? body.outputFormat : undefined,
    })
    return taskResponseFromResult(result)
  }

  if (step === 'video') {
    const prompt = typeof body.prompt === 'string' ? body.prompt : ''
    const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl : ''
    if (!imageUrl) return NextResponse.json({ error: 'Missing imageUrl' }, { status: 400 })

    const selection = await resolveModelSelectionOrSingle(
      userId,
      readExplicitModelKey(body.model),
      'video',
    )
    const durationRaw = Number(body.duration)
    const duration = Number.isFinite(durationRaw) ? Math.max(1, Math.round(durationRaw)) : undefined
    const result = await generateVideo(userId, selection.modelKey, imageUrl, {
      prompt,
      duration,
      aspectRatio: typeof body.size === 'string' ? body.size : undefined,
      resolution: typeof body.resolution === 'string' ? body.resolution : undefined,
    })
    return taskResponseFromResult(result)
  }

  return NextResponse.json({ error: 'Invalid step' }, { status: 400 })
})
