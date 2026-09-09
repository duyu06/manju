import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { resolveModelSelectionOrSingle } from '@/lib/api-config'
import { chatCompletionWithVision, getCompletionContent } from '@/lib/llm-client'

function buildDirectorPrompt(
  imagePrompt: string,
  videoPromptTemplate: string,
  duration: number,
): string {
  const cutCount = duration <= 6 ? '2-3' : duration <= 10 ? '3-4' : '4-5'
  return `You are a cinematic AI short-drama director. Analyze the storyboard image and rewrite the video prompt for a ${duration}-second clip.

Rules:
- Output ONLY the optimized prompt; no explanations or metadata.
- Use ${cutCount} coherent camera beats.
- Include concrete camera movement, framing, physical action, facial micro-expression and lighting.
- Include [Sound: ...] only for diegetic sound effects; no BGM.
- No subtitles or on-screen text.
- Preserve continuity with the storyboard image.
- Keep the final prompt concise and under 400 characters when possible.

Original image prompt:
${imagePrompt}

Video prompt template:
${videoPromptTemplate || 'cinematic, 24fps'}`
}

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const userId = authResult.session.user.id

  const body = await request.json() as Record<string, unknown>
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : ''
  const imagePrompt = typeof body.imagePrompt === 'string' ? body.imagePrompt.trim() : ''
  const videoPromptTemplate = typeof body.videoPromptTemplate === 'string'
    ? body.videoPromptTemplate.trim()
    : ''
  const durationRaw = Number(body.duration)
  const duration = Number.isFinite(durationRaw)
    ? Math.max(4, Math.min(15, Math.round(durationRaw)))
    : 10

  if (!imageUrl || !imagePrompt) {
    return NextResponse.json({ error: 'Missing imageUrl or imagePrompt' }, { status: 400 })
  }

  const explicitModel = typeof body.model === 'string' && body.model.includes('::')
    ? body.model
    : undefined
  const selection = await resolveModelSelectionOrSingle(userId, explicitModel, 'llm')
  const completion = await chatCompletionWithVision(
    userId,
    selection.modelKey,
    buildDirectorPrompt(imagePrompt, videoPromptTemplate, duration),
    [imageUrl],
    {
      temperature: 0.7,
      reasoning: false,
      action: 'workflow.optimize_prompt',
    },
  )

  const optimizedPrompt = getCompletionContent(completion)?.trim() || ''
  if (!optimizedPrompt) {
    return NextResponse.json({ error: 'Empty response from official LLM provider' }, { status: 502 })
  }

  return NextResponse.json({ optimizedPrompt })
})
