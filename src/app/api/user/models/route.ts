
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import {
  composeModelKey,
  parseModelKeyStrict,
  type CapabilityValue,
  type ModelCapabilities,
  type UnifiedModelType,
} from '@/lib/model-config-contract'
import { findBuiltinCapabilities } from '@/lib/model-capabilities/catalog'
import { findBuiltinPricingCatalogEntry } from '@/lib/model-pricing/catalog'
import type { VideoPricingTier } from '@/lib/model-pricing/video-tier'

type StoredModelType = UnifiedModelType | string

interface StoredModel {
  modelId?: string
  modelKey?: string
  name?: string
  type?: StoredModelType
  provider?: string
}

interface StoredProvider {
  id?: string
  name?: string
  apiKey?: string
}

interface UserModelOption {
  value: string
  label: string
  provider?: string
  providerName?: string
  capabilities?: ModelCapabilities
  videoPricingTiers?: VideoPricingTier[]
}

interface UserModelsPayload {
  llm: UserModelOption[]
  image: UserModelOption[]
  video: UserModelOption[]
  audio: UserModelOption[]
  lipsync: UserModelOption[]
}

const OFFICIAL_PROVIDER_KEYS = new Set([
  'openai',
  'google',
  'ark',
  'bailian',
  'minimax',
  'vidu',
  'imagen',
])

const AUDIO_MODEL_EXCLUDED_IDS = new Set(['qwen-voice-design'])

function isUnifiedModelType(type: unknown): type is UnifiedModelType {
  return type === 'llm' || type === 'image' || type === 'video' || type === 'audio' || type === 'lipsync'
}

function providerKey(providerId: string): string {
  const index = providerId.indexOf(':')
  return (index === -1 ? providerId : providerId.slice(0, index)).toLowerCase()
}

function isOfficialProvider(providerId: string): boolean {
  return OFFICIAL_PROVIDER_KEYS.has(providerKey(providerId))
}

function toModelKey(model: StoredModel): string {
  const provider = typeof model.provider === 'string' ? model.provider.trim() : ''
  const modelId = typeof model.modelId === 'string' ? model.modelId.trim() : ''
  if (provider && modelId) return composeModelKey(provider, modelId)
  const parsed = parseModelKeyStrict(typeof model.modelKey === 'string' ? model.modelKey : '')
  return parsed?.modelKey || ''
}

function toProvider(model: StoredModel): string | undefined {
  if (typeof model.provider === 'string' && model.provider.trim()) return model.provider.trim()
  return parseModelKeyStrict(typeof model.modelKey === 'string' ? model.modelKey : '')?.provider
}

function toModelId(model: StoredModel): string {
  if (typeof model.modelId === 'string' && model.modelId.trim()) return model.modelId.trim()
  return parseModelKeyStrict(typeof model.modelKey === 'string' ? model.modelKey : '')?.modelId || ''
}

function parseArray<T>(raw: string | null | undefined, code: string, field: string): T[] {
  if (!raw) return []
  let value: unknown
  try { value = JSON.parse(raw) } catch {
    throw new ApiError('INVALID_PARAMS', { code, field })
  }
  if (!Array.isArray(value)) throw new ApiError('INVALID_PARAMS', { code, field })
  return value as T[]
}

function cloneVideoPricingTiers(raw: Array<{ when: Record<string, CapabilityValue> }>): VideoPricingTier[] {
  return raw.map((tier) => ({ when: { ...tier.when } }))
}

function dedupe(items: UserModelOption[]): UserModelOption[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.value)) return false
    seen.add(item.value)
    return true
  })
}

export const GET = apiHandler(async () => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const userId = authResult.session.user.id

  const pref = await prisma.userPreference.findUnique({
    where: { userId },
    select: { customModels: true, customProviders: true },
  })

  const models = parseArray<StoredModel>(pref?.customModels, 'MODEL_PAYLOAD_INVALID', 'customModels')
  const providers = parseArray<StoredProvider>(pref?.customProviders, 'PROVIDER_PAYLOAD_INVALID', 'customProviders')

  const providerNames = new Map<string, string>()
  const configuredProviders = new Set<string>()
  for (const provider of providers) {
    const id = typeof provider.id === 'string' ? provider.id.trim() : ''
    if (!id || !isOfficialProvider(id)) continue
    if (typeof provider.name === 'string' && provider.name.trim()) providerNames.set(id, provider.name.trim())
    if (typeof provider.apiKey === 'string' && provider.apiKey.trim()) configuredProviders.add(id)
  }

  const grouped: UserModelsPayload = { llm: [], image: [], video: [], audio: [], lipsync: [] }
  for (const model of models) {
    if (!isUnifiedModelType(model.type)) continue
    const provider = toProvider(model)
    if (!provider || !isOfficialProvider(provider) || !configuredProviders.has(provider)) continue
    const modelId = toModelId(model)
    if (!modelId) continue
    if (model.type === 'audio' && AUDIO_MODEL_EXCLUDED_IDS.has(modelId)) continue
    const modelKey = toModelKey(model)
    if (!modelKey) continue

    const option: UserModelOption = {
      value: modelKey,
      label: typeof model.name === 'string' && model.name.trim() ? model.name.trim() : modelId,
      provider,
      providerName: providerNames.get(provider),
    }
    const capabilities = findBuiltinCapabilities(model.type, provider, modelId)
    if (capabilities) option.capabilities = capabilities
    if (model.type === 'video') {
      const pricingEntry = findBuiltinPricingCatalogEntry('video', provider, modelId)
      if (pricingEntry?.pricing.mode === 'capability' && Array.isArray(pricingEntry.pricing.tiers)) {
        option.videoPricingTiers = cloneVideoPricingTiers(pricingEntry.pricing.tiers)
      }
    }
    grouped[model.type].push(option)
  }

  return NextResponse.json({
    llm: dedupe(grouped.llm),
    image: dedupe(grouped.image),
    video: dedupe(grouped.video),
    audio: dedupe(grouped.audio),
    lipsync: dedupe(grouped.lipsync),
  } satisfies UserModelsPayload)
})
