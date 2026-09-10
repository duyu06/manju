
type VoiceSource = 'character' | 'speaker'
export type SupportedAudioProviderKey = 'bailian'

export interface CharacterVoiceFields {
  customVoiceUrl?: string | null
  voiceId?: string | null
}

export type BailianSpeakerVoiceEntry = {
  provider: 'bailian'
  voiceType: string
  voiceId: string
  previewAudioUrl?: string
}

export type SpeakerVoiceEntry = BailianSpeakerVoiceEntry
export type SpeakerVoiceMap = Record<string, SpeakerVoiceEntry>
export type VoiceGenerationBinding = {
  provider: 'bailian'
  source: VoiceSource
  voiceId: string
}
export type SpeakerVoicePatch = {
  provider: 'bailian'
  voiceType?: string
  voiceId: string
  previewAudioUrl?: string
}

function readTrimmedString(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const value = input.trim()
  return value ? value : null
}

export function parseSpeakerVoiceMap(raw: string | null | undefined): SpeakerVoiceMap {
  if (!raw) return {}
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new Error('SPEAKER_VOICES_INVALID_JSON') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('SPEAKER_VOICES_INVALID_SHAPE')
  const result: SpeakerVoiceMap = {}
  for (const [speaker, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!speaker.trim() || !value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`SPEAKER_VOICE_ENTRY_INVALID: ${speaker}`)
    }
    const entry = value as Record<string, unknown>
    const provider = readTrimmedString(entry.provider)?.toLowerCase()
    if (provider && provider !== 'bailian') throw new Error(`SPEAKER_VOICE_ENTRY_INVALID_PROVIDER: ${speaker}`)
    const voiceId = readTrimmedString(entry.voiceId)
    if (!voiceId) throw new Error(`SPEAKER_VOICE_ENTRY_INVALID_BAILIAN_VOICE_ID: ${speaker}`)
    const preview = readTrimmedString(entry.previewAudioUrl) || readTrimmedString(entry.audioUrl)
    result[speaker] = {
      provider: 'bailian',
      voiceType: readTrimmedString(entry.voiceType) || 'designed',
      voiceId,
      ...(preview ? { previewAudioUrl: preview } : {}),
    }
  }
  return result
}

export function resolveVoiceBindingForProvider(params: {
  providerKey: string
  character?: CharacterVoiceFields | null
  speakerVoice?: SpeakerVoiceEntry | null
}): VoiceGenerationBinding | null {
  if (params.providerKey.toLowerCase() !== 'bailian') return null
  const characterVoiceId = readTrimmedString(params.character?.voiceId)
  if (characterVoiceId) return { provider: 'bailian', source: 'character', voiceId: characterVoiceId }
  const speakerVoiceId = readTrimmedString(params.speakerVoice?.voiceId)
  return speakerVoiceId ? { provider: 'bailian', source: 'speaker', voiceId: speakerVoiceId } : null
}

export function hasVoiceBindingForProvider(params: {
  providerKey: string
  character?: CharacterVoiceFields | null
  speakerVoice?: SpeakerVoiceEntry | null
}): boolean {
  return !!resolveVoiceBindingForProvider(params)
}

export function hasAnyVoiceBinding(params: {
  character?: CharacterVoiceFields | null
  speakerVoice?: SpeakerVoiceEntry | null
}): boolean {
  return !!readTrimmedString(params.character?.voiceId) || !!readTrimmedString(params.speakerVoice?.voiceId)
}

export function getSpeakerVoicePreviewUrl(speakerVoice?: SpeakerVoiceEntry | null): string | null {
  return readTrimmedString(speakerVoice?.previewAudioUrl)
}
