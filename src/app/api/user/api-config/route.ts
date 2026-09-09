/**
 * 用户模型 API 配置（官方厂商直连模式）
 *
 * 约束：
 * - 只保存模型厂商第一方 provider。
 * - 不接受 Base URL、compat gateway、relay provider 或第三方聚合平台。
 * - 历史配置中的中转 provider/model 在读取时会被过滤，避免旧数据阻断迁移。
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encryptApiKey, decryptApiKey } from '@/lib/crypto-utils'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import {
  composeModelKey,
  parseModelKeyStrict,
  type CapabilitySelections,
  type ModelCapabilities,
  type UnifiedModelType,
} from '@/lib/model-config-contract'
import { findBuiltinCapabilities } from '@/lib/model-capabilities/catalog'
import { listBuiltinPricingCatalog, type PricingApiType } from '@/lib/model-pricing/catalog'
import {
  DEFAULT_ANALYSIS_WORKFLOW_CONCURRENCY,
  DEFAULT_IMAGE_WORKFLOW_CONCURRENCY,
  DEFAULT_VIDEO_WORKFLOW_CONCURRENCY,
  normalizeWorkflowConcurrencyConfig,
  normalizeWorkflowConcurrencyValue,
} from '@/lib/workflow-concurrency'

type ApiModeType = 'gemini-sdk' | 'openai-official'
type DefaultModelField =
  | 'analysisModel'
  | 'characterModel'
  | 'locationModel'
  | 'storyboardModel'
  | 'editModel'
  | 'videoModel'
  | 'audioModel'
  | 'lipSyncModel'
  | 'voiceDesignModel'

interface StoredProvider {
  id: string
  name: string
  apiKey?: string
  hidden?: boolean
  apiMode?: ApiModeType
  gatewayRoute: 'official'
}

interface StoredModel {
  modelId: string
  modelKey: string
  name: string
  type: UnifiedModelType
  provider: string
  llmProtocol?: 'responses' | 'chat-completions'
  llmProtocolCheckedAt?: string
  price: number
  capabilities?: ModelCapabilities
  customPricing?: unknown
}

interface DefaultModelsPayload {
  analysisModel?: string
  characterModel?: string
  locationModel?: string
  storyboardModel?: string
  editModel?: string
  videoModel?: string
  audioModel?: string
  lipSyncModel?: string
  voiceDesignModel?: string
}

interface WorkflowConcurrencyPayload {
  analysis?: number
  image?: number
  video?: number
}

interface ApiConfigPutBody {
  models?: unknown
  providers?: unknown
  defaultModels?: unknown
  capabilityDefaults?: unknown
  workflowConcurrency?: unknown
}

interface PricingDisplayItem {
  min: number
  max: number
  label: string
  input?: number
  output?: number
}

type PricingDisplayMap = Record<string, PricingDisplayItem>

const OFFICIAL_PROVIDER_KEYS = new Set([
  'openai',
  'google',
  'ark',
  'bailian',
  'minimax',
  'vidu',
])

const DEFAULT_MODEL_FIELDS: DefaultModelField[] = [
  'analysisModel',
  'characterModel',
  'locationModel',
  'storyboardModel',
  'editModel',
  'videoModel',
  'audioModel',
  'lipSyncModel',
  'voiceDesignModel',
]

const OFFICIAL_DEFAULTS: Required<DefaultModelsPayload> = {
  analysisModel: composeModelKey('google', 'gemini-3.1-pro-preview'),
  characterModel: composeModelKey('google', 'gemini-3-pro-image-preview'),
  locationModel: composeModelKey('google', 'gemini-3-pro-image-preview'),
  storyboardModel: composeModelKey('google', 'gemini-3-pro-image-preview'),
  editModel: composeModelKey('google', 'gemini-3-pro-image-preview'),
  videoModel: composeModelKey('ark', 'doubao-seedance-1-5-pro-251215'),
  audioModel: composeModelKey('bailian', 'qwen3-tts-vd-2026-01-26'),
  lipSyncModel: composeModelKey('vidu', 'vidu-lipsync'),
  voiceDesignModel: composeModelKey('bailian', 'qwen-voice-design'),
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getProviderKey(providerId: string): string {
  const index = providerId.indexOf(':')
  return (index === -1 ? providerId : providerId.slice(0, index)).toLowerCase()
}

function isOfficialProvider(providerId: string): boolean {
  return OFFICIAL_PROVIDER_KEYS.has(getProviderKey(providerId))
}

function assertOfficialProvider(providerId: string, field: string): void {
  if (isOfficialProvider(providerId)) return
  throw new ApiError('INVALID_PARAMS', {
    code: 'OFFICIAL_PROVIDER_REQUIRED',
    field,
  })
}

function isUnifiedModelType(value: unknown): value is UnifiedModelType {
  return value === 'llm'
    || value === 'image'
    || value === 'video'
    || value === 'audio'
    || value === 'lipsync'
}

function isApiMode(value: unknown): value is ApiModeType {
  return value === 'gemini-sdk' || value === 'openai-official'
}

function normalizeProvider(raw: unknown, index: number, strict: boolean): StoredProvider | null {
  if (!isRecord(raw)) {
    if (!strict) return null
    throw new ApiError('INVALID_PARAMS', {
      code: 'PROVIDER_PAYLOAD_INVALID',
      field: `providers[${index}]`,
    })
  }

  const id = readTrimmedString(raw.id)
  const name = readTrimmedString(raw.name)
  if (!id || !name) {
    if (!strict) return null
    throw new ApiError('INVALID_PARAMS', {
      code: 'PROVIDER_PAYLOAD_INVALID',
      field: `providers[${index}]`,
    })
  }

  if (!isOfficialProvider(id)) {
    if (!strict) return null
    assertOfficialProvider(id, `providers[${index}].id`)
  }

  // Base URL is deliberately not persisted. Vendor endpoints are pinned server-side.
  if (strict && readTrimmedString(raw.baseUrl)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'PROVIDER_BASEURL_NOT_ALLOWED',
      field: `providers[${index}].baseUrl`,
    })
  }

  const rawGatewayRoute = readTrimmedString(raw.gatewayRoute)
  if (strict && rawGatewayRoute && rawGatewayRoute !== 'official') {
    throw new ApiError('INVALID_PARAMS', {
      code: 'OFFICIAL_PROVIDER_REQUIRED',
      field: `providers[${index}].gatewayRoute`,
    })
  }

  const providerKey = getProviderKey(id)
  const apiModeRaw = raw.apiMode
  let apiMode: ApiModeType | undefined
  if (apiModeRaw !== undefined && apiModeRaw !== null && apiModeRaw !== '') {
    if (!isApiMode(apiModeRaw)) {
      if (!strict) return null
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_APIMODE_INVALID',
        field: `providers[${index}].apiMode`,
      })
    }
    if (apiModeRaw === 'gemini-sdk' && providerKey !== 'google') {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_APIMODE_INVALID',
        field: `providers[${index}].apiMode`,
      })
    }
    if (apiModeRaw === 'openai-official' && providerKey !== 'openai') {
      throw new ApiError('INVALID_PARAMS', {
        code: 'PROVIDER_APIMODE_INVALID',
        field: `providers[${index}].apiMode`,
      })
    }
    apiMode = apiModeRaw
  }

  const hiddenRaw = raw.hidden
  if (strict && hiddenRaw !== undefined && typeof hiddenRaw !== 'boolean') {
    throw new ApiError('INVALID_PARAMS', {
      code: 'PROVIDER_HIDDEN_INVALID',
      field: `providers[${index}].hidden`,
    })
  }

  return {
    id,
    name,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey.trim() : undefined,
    hidden: hiddenRaw === true,
    apiMode,
    gatewayRoute: 'official',
  }
}

function normalizeProviders(raw: unknown, strict: boolean): StoredProvider[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) {
    if (!strict) return []
    throw new ApiError('INVALID_PARAMS', {
      code: 'PROVIDER_PAYLOAD_INVALID',
      field: 'providers',
    })
  }

  const providers: StoredProvider[] = []
  const seen = new Set<string>()
  raw.forEach((item, index) => {
    const provider = normalizeProvider(item, index, strict)
    if (!provider) return
    const idKey = provider.id.toLowerCase()
    if (seen.has(idKey)) {
      if (strict) {
        throw new ApiError('INVALID_PARAMS', {
          code: 'PROVIDER_DUPLICATE',
          field: `providers[${index}].id`,
        })
      }
      return
    }
    seen.add(idKey)
    providers.push(provider)
  })
  return providers
}

function normalizeModel(raw: unknown, index: number, strict: boolean): StoredModel | null {
  if (!isRecord(raw) || !isUnifiedModelType(raw.type)) {
    if (!strict) return null
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_PAYLOAD_INVALID',
      field: `models[${index}]`,
    })
  }

  const providerFromField = readTrimmedString(raw.provider)
  const modelIdFromField = readTrimmedString(raw.modelId)
  const modelKeyFromField = readTrimmedString(raw.modelKey)
  const parsed = modelKeyFromField ? parseModelKeyStrict(modelKeyFromField) : null
  const provider = providerFromField || parsed?.provider || ''
  const modelId = modelIdFromField || parsed?.modelId || ''
  const modelKey = composeModelKey(provider, modelId)

  if (!provider || !modelId || !modelKey) {
    if (!strict) return null
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_KEY_INVALID',
      field: `models[${index}].modelKey`,
    })
  }
  if (!isOfficialProvider(provider)) {
    if (!strict) return null
    assertOfficialProvider(provider, `models[${index}].provider`)
  }
  if (parsed && parsed.modelKey !== modelKey) {
    if (!strict) return null
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_KEY_MISMATCH',
      field: `models[${index}].modelKey`,
    })
  }

  const llmProtocolRaw = raw.llmProtocol
  const llmProtocol = llmProtocolRaw === 'responses' || llmProtocolRaw === 'chat-completions'
    ? llmProtocolRaw
    : undefined

  const model: StoredModel = {
    modelId,
    modelKey,
    name: readTrimmedString(raw.name) || modelId,
    type: raw.type,
    provider,
    ...(llmProtocol ? { llmProtocol } : {}),
    ...(readTrimmedString(raw.llmProtocolCheckedAt)
      ? { llmProtocolCheckedAt: readTrimmedString(raw.llmProtocolCheckedAt) }
      : {}),
    price: 0,
    capabilities: findBuiltinCapabilities(raw.type, provider, modelId),
  }

  if (raw.customPricing !== undefined) {
    model.customPricing = raw.customPricing
  }
  return model
}

function normalizeModels(raw: unknown, strict: boolean): StoredModel[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) {
    if (!strict) return []
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_PAYLOAD_INVALID',
      field: 'models',
    })
  }
  return raw
    .map((item, index) => normalizeModel(item, index, strict))
    .filter((model): model is StoredModel => model !== null)
}

function validateModelProviders(models: StoredModel[], providers: StoredProvider[]): void {
  const providerIds = new Set(providers.map((provider) => provider.id))
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index]
    if (providerIds.has(model.provider)) continue
    const key = getProviderKey(model.provider)
    const matches = providers.filter((provider) => getProviderKey(provider.id) === key)
    if (matches.length === 1) continue
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_PROVIDER_NOT_FOUND',
      field: `models[${index}].provider`,
    })
  }
}

function parseJsonArray(raw: string | null | undefined): unknown[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseStoredProviders(raw: string | null | undefined): StoredProvider[] {
  return normalizeProviders(parseJsonArray(raw), false)
}

function parseStoredModels(raw: string | null | undefined): StoredModel[] {
  return normalizeModels(parseJsonArray(raw), false)
}

function normalizeDefaultModels(raw: unknown, strict: boolean): DefaultModelsPayload {
  if (raw === undefined || raw === null) return {}
  if (!isRecord(raw)) {
    if (!strict) return {}
    throw new ApiError('INVALID_PARAMS', {
      code: 'DEFAULT_MODELS_INVALID',
      field: 'defaultModels',
    })
  }

  const result: DefaultModelsPayload = {}
  for (const field of DEFAULT_MODEL_FIELDS) {
    if (raw[field] === undefined) continue
    const value = readTrimmedString(raw[field])
    if (!value) {
      result[field] = ''
      continue
    }
    const parsed = parseModelKeyStrict(value)
    if (!parsed || !isOfficialProvider(parsed.provider)) {
      if (!strict) continue
      throw new ApiError('INVALID_PARAMS', {
        code: 'OFFICIAL_MODEL_REQUIRED',
        field: `defaultModels.${field}`,
      })
    }
    result[field] = parsed.modelKey
  }
  return result
}

function resolveStoredDefault(raw: string | null | undefined, fallback: string): string {
  const parsed = parseModelKeyStrict(raw)
  if (!parsed || !isOfficialProvider(parsed.provider)) return fallback
  return parsed.modelKey
}

function normalizeCapabilitySelections(raw: unknown, strict: boolean): CapabilitySelections {
  if (raw === undefined || raw === null) return {}
  if (!isRecord(raw)) {
    if (!strict) return {}
    throw new ApiError('INVALID_PARAMS', {
      code: 'CAPABILITY_SELECTION_INVALID',
      field: 'capabilityDefaults',
    })
  }

  const result: CapabilitySelections = {}
  for (const [modelKey, rawSelection] of Object.entries(raw)) {
    const parsed = parseModelKeyStrict(modelKey)
    if (!parsed || !isOfficialProvider(parsed.provider) || !isRecord(rawSelection)) {
      if (strict) {
        throw new ApiError('INVALID_PARAMS', {
          code: 'CAPABILITY_SELECTION_INVALID',
          field: `capabilityDefaults.${modelKey}`,
        })
      }
      continue
    }
    const selection: Record<string, string | number | boolean> = {}
    for (const [field, value] of Object.entries(rawSelection)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        selection[field] = value
      } else if (strict) {
        throw new ApiError('INVALID_PARAMS', {
          code: 'CAPABILITY_SELECTION_INVALID',
          field: `capabilityDefaults.${modelKey}.${field}`,
        })
      }
    }
    if (Object.keys(selection).length > 0) result[parsed.modelKey] = selection
  }
  return result
}

function parseStoredCapabilitySelections(raw: string | null | undefined): CapabilitySelections {
  if (!raw) return {}
  try {
    return normalizeCapabilitySelections(JSON.parse(raw) as unknown, false)
  } catch {
    return {}
  }
}

function serializeCapabilitySelections(value: CapabilitySelections): string | null {
  return Object.keys(value).length > 0 ? JSON.stringify(value) : null
}

function normalizeWorkflowConcurrencyInput(raw: unknown): WorkflowConcurrencyPayload {
  if (raw === undefined || raw === null) return {}
  if (!isRecord(raw)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'WORKFLOW_CONCURRENCY_INVALID',
      field: 'workflowConcurrency',
    })
  }

  const result: WorkflowConcurrencyPayload = {}
  const fields: Array<keyof WorkflowConcurrencyPayload> = ['analysis', 'image', 'video']
  const fallbacks: Record<keyof WorkflowConcurrencyPayload, number> = {
    analysis: DEFAULT_ANALYSIS_WORKFLOW_CONCURRENCY,
    image: DEFAULT_IMAGE_WORKFLOW_CONCURRENCY,
    video: DEFAULT_VIDEO_WORKFLOW_CONCURRENCY,
  }
  for (const field of fields) {
    if (raw[field] === undefined) continue
    const normalized = normalizeWorkflowConcurrencyValue(raw[field], fallbacks[field])
    if (normalized !== raw[field]) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'WORKFLOW_CONCURRENCY_INVALID',
        field: `workflowConcurrency.${field}`,
      })
    }
    result[field] = normalized
  }
  return result
}

function formatPriceAmount(amount: number): string {
  const fixed = amount.toFixed(4)
  return fixed.replace(/\.?0+$/, '') || '0'
}

function pricingApiTypeToModelType(apiType: PricingApiType): UnifiedModelType | null {
  if (apiType === 'text') return 'llm'
  if (apiType === 'image') return 'image'
  if (apiType === 'video') return 'video'
  if (apiType === 'voice') return 'audio'
  if (apiType === 'lip-sync') return 'lipsync'
  return null
}

function buildPricingDisplayMap(): PricingDisplayMap {
  const map: PricingDisplayMap = {}
  for (const entry of listBuiltinPricingCatalog()) {
    if (!isOfficialProvider(entry.provider)) continue
    const modelType = pricingApiTypeToModelType(entry.apiType)
    if (!modelType) continue

    let min = 0
    let max = 0
    let input: number | undefined
    let output: number | undefined
    if (entry.pricing.mode === 'flat') {
      min = entry.pricing.flatAmount ?? 0
      max = min
    } else {
      const tiers = entry.pricing.tiers || []
      const amounts = tiers.map((tier) => tier.amount)
      if (amounts.length === 0) continue
      min = Math.min(...amounts)
      max = Math.max(...amounts)
      if (entry.apiType === 'text') {
        for (const tier of tiers) {
          if (tier.when.tokenType === 'input') input = tier.amount
          if (tier.when.tokenType === 'output') output = tier.amount
        }
      }
    }

    map[`${modelType}::${entry.provider}::${entry.modelId}`] = {
      min,
      max,
      label: min === max ? formatPriceAmount(min) : `${formatPriceAmount(min)}~${formatPriceAmount(max)}`,
      ...(typeof input === 'number' ? { input } : {}),
      ...(typeof output === 'number' ? { output } : {}),
    }
  }
  return map
}

export const GET = apiHandler(async () => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const userId = authResult.session.user.id

  const pref = await prisma.userPreference.findUnique({
    where: { userId },
    select: {
      customModels: true,
      customProviders: true,
      analysisModel: true,
      characterModel: true,
      locationModel: true,
      storyboardModel: true,
      editModel: true,
      videoModel: true,
      audioModel: true,
      lipSyncModel: true,
      voiceDesignModel: true,
      capabilityDefaults: true,
      analysisConcurrency: true,
      imageConcurrency: true,
      videoConcurrency: true,
    },
  })

  const providers = parseStoredProviders(pref?.customProviders).map((provider) => ({
    ...provider,
    apiKey: provider.apiKey ? decryptApiKey(provider.apiKey) : '',
  }))
  const models = parseStoredModels(pref?.customModels)
  const defaultModels: DefaultModelsPayload = {
    analysisModel: resolveStoredDefault(pref?.analysisModel, OFFICIAL_DEFAULTS.analysisModel),
    characterModel: resolveStoredDefault(pref?.characterModel, OFFICIAL_DEFAULTS.characterModel),
    locationModel: resolveStoredDefault(pref?.locationModel, OFFICIAL_DEFAULTS.locationModel),
    storyboardModel: resolveStoredDefault(pref?.storyboardModel, OFFICIAL_DEFAULTS.storyboardModel),
    editModel: resolveStoredDefault(pref?.editModel, OFFICIAL_DEFAULTS.editModel),
    videoModel: resolveStoredDefault(pref?.videoModel, OFFICIAL_DEFAULTS.videoModel),
    audioModel: resolveStoredDefault(pref?.audioModel, OFFICIAL_DEFAULTS.audioModel),
    lipSyncModel: resolveStoredDefault(pref?.lipSyncModel, OFFICIAL_DEFAULTS.lipSyncModel),
    voiceDesignModel: resolveStoredDefault(pref?.voiceDesignModel, OFFICIAL_DEFAULTS.voiceDesignModel),
  }

  return NextResponse.json({
    models,
    providers,
    defaultModels,
    capabilityDefaults: parseStoredCapabilitySelections(pref?.capabilityDefaults),
    workflowConcurrency: normalizeWorkflowConcurrencyConfig({
      analysis: pref?.analysisConcurrency,
      image: pref?.imageConcurrency,
      video: pref?.videoConcurrency,
    }),
    pricingDisplay: buildPricingDisplayMap(),
  })
})

export const PUT = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const userId = authResult.session.user.id

  let body: ApiConfigPutBody
  try {
    body = (await request.json()) as ApiConfigPutBody
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      code: 'BODY_PARSE_FAILED',
      field: 'body',
    })
  }

  const existing = await prisma.userPreference.findUnique({
    where: { userId },
    select: { customProviders: true },
  })
  const existingProviders = parseStoredProviders(existing?.customProviders)

  const providers = body.providers === undefined
    ? existingProviders
    : normalizeProviders(body.providers, true)
  const models = body.models === undefined
    ? undefined
    : normalizeModels(body.models, true)
  const defaultModels = body.defaultModels === undefined
    ? undefined
    : normalizeDefaultModels(body.defaultModels, true)
  const capabilityDefaults = body.capabilityDefaults === undefined
    ? undefined
    : normalizeCapabilitySelections(body.capabilityDefaults, true)
  const workflowConcurrency = body.workflowConcurrency === undefined
    ? undefined
    : normalizeWorkflowConcurrencyInput(body.workflowConcurrency)

  if (models) validateModelProviders(models, providers)

  const updateData: Record<string, unknown> = {}
  if (models) updateData.customModels = JSON.stringify(models)

  if (body.providers !== undefined) {
    const toSave = providers.map((provider) => {
      const previous = existingProviders.find((candidate) => candidate.id === provider.id)
      let encryptedKey = previous?.apiKey
      if (provider.apiKey === '') encryptedKey = undefined
      else if (provider.apiKey) encryptedKey = encryptApiKey(provider.apiKey)
      return {
        id: provider.id,
        name: provider.name,
        hidden: provider.hidden === true,
        apiMode: provider.apiMode,
        gatewayRoute: 'official' as const,
        apiKey: encryptedKey,
      }
    })
    updateData.customProviders = JSON.stringify(toSave)
  }

  if (defaultModels) {
    for (const field of DEFAULT_MODEL_FIELDS) {
      if (defaultModels[field] !== undefined) {
        updateData[field] = defaultModels[field] || null
      }
    }
  }

  if (capabilityDefaults !== undefined) {
    updateData.capabilityDefaults = serializeCapabilitySelections(capabilityDefaults)
  }

  if (workflowConcurrency) {
    if (workflowConcurrency.analysis !== undefined) updateData.analysisConcurrency = workflowConcurrency.analysis
    if (workflowConcurrency.image !== undefined) updateData.imageConcurrency = workflowConcurrency.image
    if (workflowConcurrency.video !== undefined) updateData.videoConcurrency = workflowConcurrency.video
  }

  await prisma.userPreference.upsert({
    where: { userId },
    update: updateData,
    create: { userId, ...updateData },
  })

  return NextResponse.json({ success: true })
})
