import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { prisma } from '@/lib/prisma'
import { getProviderConfig, getProviderKey, resolveModelSelectionOrSingle } from '@/lib/api-config'
import { getSignedUrl, uploadObject } from '@/lib/storage'
import { synthesizeWithBailianTTS } from '@/lib/providers/bailian'
import { getWavDurationFromBuffer } from '@/lib/audio'
import {
  parseSpeakerVoiceMap,
  resolveVoiceBindingForProvider,
  type CharacterVoiceFields,
  type SpeakerVoiceMap,
} from '@/lib/voice/provider-voice-binding'

type CheckCancelled = () => Promise<void>
type CharacterVoiceProfile = CharacterVoiceFields & { name: string }

function normalizeBailianVoiceGenerationError(errorMessage: string | null | undefined) {
  const message = typeof errorMessage === 'string' ? errorMessage.trim() : ''
  if (!message) return 'BAILIAN_AUDIO_GENERATION_FAILED'

  const normalized = message.toLowerCase()
  if (
    normalized.includes('bailian_tts_failed(400): invalidparameter') ||
    normalized.includes('invalidparameter')
  ) {
    return '无效音色ID，QwenTTS 必须使用 AI 设计音色'
  }

  return message
}


function matchCharacterBySpeaker(
  speaker: string,
  characters: CharacterVoiceProfile[],
) {
  const exactMatch = characters.find((character) => character.name === speaker)
  if (exactMatch) return exactMatch
  return characters.find((character) => character.name.includes(speaker) || speaker.includes(character.name))
}

export async function generateVoiceLine(params: {
  projectId: string
  episodeId?: string | null
  lineId: string
  userId: string
  audioModel?: string
  checkCancelled?: CheckCancelled
}) {
  const checkCancelled = params.checkCancelled

  const line = await prisma.studioVoiceLine.findUnique({
    where: { id: params.lineId },
    select: {
      id: true,
      episodeId: true,
      speaker: true,
      content: true,
      emotionPrompt: true,
      emotionStrength: true,
    },
  })
  if (!line) {
    throw new Error('Voice line not found')
  }

  const episodeId = params.episodeId || line.episodeId
  if (!episodeId) {
    throw new Error('episodeId is required')
  }

  const [projectData, episode] = await Promise.all([
    prisma.studioProject.findUnique({
      where: { projectId: params.projectId },
      include: { characters: true },
    }),
    prisma.studioEpisode.findUnique({
      where: { id: episodeId },
      select: { speakerVoices: true },
    }),
  ])

  if (!projectData) {
    throw new Error('Studio project not found')
  }

  const speakerVoices: SpeakerVoiceMap = parseSpeakerVoiceMap(episode?.speakerVoices)

  const character = matchCharacterBySpeaker(line.speaker, projectData.characters || [])
  const speakerVoice = speakerVoices[line.speaker]

  const text = (line.content || '').trim()
  if (!text) {
    throw new Error('Voice line text is empty')
  }

  const audioSelection = await resolveModelSelectionOrSingle(params.userId, params.audioModel, 'audio')
  const providerKey = getProviderKey(audioSelection.provider).toLowerCase()
  const voiceBinding = resolveVoiceBindingForProvider({
    providerKey,
    character,
    speakerVoice,
  })
  let generated: { audioData: Buffer; audioDuration: number }
if (providerKey !== 'bailian') {
  throw new Error(`UNSUPPORTED_OFFICIAL_PROVIDER: audio provider ${audioSelection.provider}`)
}
if (!voiceBinding || voiceBinding.provider !== 'bailian') {
  throw new Error('Please bind a Bailian voice to this speaker first.')
}
const { apiKey } = await getProviderConfig(params.userId, audioSelection.provider)
const result = await synthesizeWithBailianTTS({
  text,
  voiceId: voiceBinding.voiceId,
  modelId: audioSelection.modelId,
  languageType: 'Chinese',
}, apiKey)
if (!result.success || !result.audioData) {
  throw new Error(normalizeBailianVoiceGenerationError(result.error))
}
generated = {
  audioData: result.audioData,
  audioDuration: result.audioDuration ?? getWavDurationFromBuffer(result.audioData),
}

  const audioKey = `voice/${params.projectId}/${episodeId}/${line.id}.wav`
  const cosKey = await uploadObject(generated.audioData, audioKey)

  await checkCancelled?.()

  await prisma.studioVoiceLine.update({
    where: { id: line.id },
    data: {
      audioUrl: cosKey,
      audioDuration: generated.audioDuration || null,
    },
  })

  const signedUrl = getSignedUrl(cosKey, 7200)
  return {
    lineId: line.id,
    audioUrl: signedUrl,
    storageKey: cosKey,
    audioDuration: generated.audioDuration || null,
  }
}

export function estimateVoiceLineMaxSeconds(content: string | null | undefined) {
  const chars = typeof content === 'string' ? content.length : 0
  return Math.max(5, Math.ceil(chars / 2))
}
