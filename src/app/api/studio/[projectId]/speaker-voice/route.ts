
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSignedUrl } from '@/lib/storage'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { parseSpeakerVoiceMap, type SpeakerVoiceEntry, type SpeakerVoiceMap } from '@/lib/voice/provider-voice-binding'

function readTrimmedString(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const value = input.trim()
  return value ? value : null
}

function signUrlIfNeeded(url: string): string {
  return url.startsWith('http') ? url : getSignedUrl(url, 7200)
}

export const GET = apiHandler(async (request: NextRequest, context: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await context.params
  const episodeId = new URL(request.url).searchParams.get('episodeId')
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  if (!episodeId) throw new ApiError('INVALID_PARAMS')

  const episode = await prisma.studioEpisode.findUnique({ where: { id: episodeId } })
  if (!episode) throw new ApiError('NOT_FOUND')
  const stored = parseSpeakerVoiceMap(episode.speakerVoices)
  const speakerVoices: SpeakerVoiceMap = {}
  for (const [speaker, voice] of Object.entries(stored)) {
    const previewAudioUrl = voice.previewAudioUrl ? signUrlIfNeeded(voice.previewAudioUrl) : undefined
    speakerVoices[speaker] = {
      provider: 'bailian',
      voiceType: voice.voiceType,
      voiceId: voice.voiceId,
      ...(previewAudioUrl ? { previewAudioUrl } : {}),
    }
  }
  return NextResponse.json({ speakerVoices })
})

export const PATCH = apiHandler(async (request: NextRequest, context: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => null)
  const episodeId = readTrimmedString(body?.episodeId) ?? ''
  const speaker = readTrimmedString(body?.speaker) ?? ''
  const voiceType = readTrimmedString(body?.voiceType) ?? 'designed'
  const provider = readTrimmedString(body?.provider)?.toLowerCase() ?? ''
  const voiceId = readTrimmedString(body?.voiceId)
  const previewAudioUrl = readTrimmedString(body?.previewAudioUrl)
  if (!episodeId || !speaker || provider !== 'bailian' || !voiceId) throw new ApiError('INVALID_PARAMS')

  const project = await prisma.studioProject.findUnique({ where: { projectId }, select: { id: true } })
  if (!project) throw new ApiError('NOT_FOUND')
  const episode = await prisma.studioEpisode.findFirst({ where: { id: episodeId, studioProjectId: project.id }, select: { id: true, speakerVoices: true } })
  if (!episode) throw new ApiError('NOT_FOUND')

  const speakerVoices = parseSpeakerVoiceMap(episode.speakerVoices)
  const resolvedPreviewKey = previewAudioUrl ? await resolveStorageKeyFromMediaValue(previewAudioUrl) : null
  const nextVoiceEntry: SpeakerVoiceEntry = {
    provider: 'bailian',
    voiceType,
    voiceId,
    ...(previewAudioUrl ? { previewAudioUrl: resolvedPreviewKey || previewAudioUrl } : {}),
  }
  speakerVoices[speaker] = nextVoiceEntry
  await prisma.studioEpisode.update({ where: { id: episodeId }, data: { speakerVoices: JSON.stringify(speakerVoices) } })
  return NextResponse.json({ success: true })
})
