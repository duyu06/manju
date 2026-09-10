/**
 * API 配置读取器（官方 API 严格模式）
 *
 * 规则：
 * 1) 模型唯一键必须是 provider::modelId
 * 2) 禁止 provider 猜测、静态降级和中转/聚合 provider
 * 3) 运行时只允许模型厂商第一方官方 API
 * 4) 模型 API 地址不属于用户配置；历史 baseUrl 字段不会进入运行时
 */

import { prisma } from './prisma'
import { decryptApiKey } from './crypto-utils'
import {
  composeModelKey,
  parseModelKeyStrict,
  type UnifiedModelType,
} from './model-config-contract'

export interface CustomModel {
  modelId: string
  modelKey: string
  name: string
  type: UnifiedModelType
  provider: string
  llmProtocol?: 'responses' | 'chat-completions'
  llmProtocolCheckedAt?: string
  price: number
}

export type ModelMediaType = 'llm' | 'image' | 'video' | 'audio' | 'lipsync'

export interface ModelSelection {
  provider: string
  modelId: string
  modelKey: string
  mediaType: ModelMediaType
  llmProtocol?: 'responses' | 'chat-completions'
}

interface CustomProvider {
  id: string
  name: string
  apiKey?: string
  apiMode?: 'gemini-sdk' | 'openai-official'
  gatewayRoute?: 'official'
}

type LlmProtocolType = 'responses' | 'chat-completions'

/**
 * Stored provider IDs must identify a model vendor, never a protocol proxy.
 * Internal generator aliases such as "imagen" are not user provider IDs.
 */
const OFFICIAL_PROVIDER_KEYS = new Set([
  'openai',
  'google',
  'bailian',
  'ark',
  'minimax',
  'vidu',
])

const BLOCKED_PROVIDER_KEYS = new Set([
  'evolink',
  'fal',
  'siliconflow',
  'openrouter',
  'litellm',
  'oneapi',
  'newapi',
  'openai-compatible',
  'gemini-compatible',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isUnifiedModelType(value: unknown): value is UnifiedModelType {
  return (
    value === 'llm'
    || value === 'image'
    || value === 'video'
    || value === 'audio'
    || value === 'lipsync'
  )
}

function isLlmProtocol(value: unknown): value is LlmProtocolType {
  return value === 'responses' || value === 'chat-completions'
}

function assertModelKey(value: string, field: string): { provider: string; modelId: string; modelKey: string } {
  const parsed = parseModelKeyStrict(value)
  if (!parsed) {
    throw new Error(`MODEL_KEY_INVALID: ${field} must be provider::modelId`)
  }
  return parsed
}

/** 提取提供商主键（支持官方 provider 的多实例 ID，如 google:uuid）。 */
export function getProviderKey(providerId?: string): string {
  if (!providerId) return ''
  const colonIndex = providerId.indexOf(':')
  return colonIndex === -1 ? providerId : providerId.slice(0, colonIndex)
}

function assertOfficialProvider(providerId: string): string {
  const providerKey = getProviderKey(providerId).toLowerCase()
  if (BLOCKED_PROVIDER_KEYS.has(providerKey)) {
    throw new Error(`OFFICIAL_PROVIDER_REQUIRED: ${providerId} is a relay/compatibility provider and is disabled`)
  }
  if (!OFFICIAL_PROVIDER_KEYS.has(providerKey)) {
    throw new Error(`OFFICIAL_PROVIDER_REQUIRED: ${providerId} is not in the first-party provider allowlist`)
  }
  return providerKey
}

function parseCustomProviders(rawProviders: string | null | undefined): CustomProvider[] {
  if (!rawProviders) return []

  let parsedUnknown: unknown
  try {
    parsedUnknown = JSON.parse(rawProviders)
  } catch {
    throw new Error('PROVIDER_PAYLOAD_INVALID: customProviders is not valid JSON')
  }

  if (!Array.isArray(parsedUnknown)) {
    throw new Error('PROVIDER_PAYLOAD_INVALID: customProviders must be an array')
  }

  const providers: CustomProvider[] = []
  for (let index = 0; index < parsedUnknown.length; index += 1) {
    const raw = parsedUnknown[index]
    if (!isRecord(raw)) {
      throw new Error(`PROVIDER_PAYLOAD_INVALID: providers[${index}] must be an object`)
    }

    const id = readTrimmedString(raw.id)
    const name = readTrimmedString(raw.name)
    if (!id || !name) {
      throw new Error(`PROVIDER_PAYLOAD_INVALID: providers[${index}] missing id or name`)
    }

    const normalizedId = id.toLowerCase()
    if (providers.some((provider) => provider.id.toLowerCase() === normalizedId)) {
      throw new Error(`PROVIDER_DUPLICATE: providers[${index}].id duplicates id ${id}`)
    }

    const providerKey = assertOfficialProvider(id)
    const apiModeRaw = raw.apiMode
    let apiMode: 'gemini-sdk' | 'openai-official' | undefined
    if (apiModeRaw === undefined || apiModeRaw === null || apiModeRaw === '') {
      apiMode = undefined
    } else if (apiModeRaw === 'gemini-sdk' && providerKey === 'google') {
      apiMode = apiModeRaw
    } else if (apiModeRaw === 'openai-official' && providerKey === 'openai') {
      apiMode = apiModeRaw
    } else {
      throw new Error(`PROVIDER_API_MODE_INVALID: providers[${index}].apiMode is not valid for ${providerKey}`)
    }

    const gatewayRouteRaw = readTrimmedString(raw.gatewayRoute)
    if (gatewayRouteRaw && gatewayRouteRaw !== 'official') {
      throw new Error(`OFFICIAL_PROVIDER_REQUIRED: providers[${index}].gatewayRoute must be official`)
    }

    // Deliberately ignore historical raw.baseUrl. Vendor endpoints are constants
    // inside first-party provider implementations and cannot be selected from DB.
    providers.push({
      id,
      name,
      apiKey: readTrimmedString(raw.apiKey) || undefined,
      apiMode,
      gatewayRoute: 'official',
    })
  }

  return providers
}

function normalizeStoredModel(raw: unknown, index: number): CustomModel {
  if (!isRecord(raw)) {
    throw new Error(`MODEL_PAYLOAD_INVALID: models[${index}] must be an object`)
  }
  if (!isUnifiedModelType(raw.type)) {
    throw new Error(`MODEL_TYPE_INVALID: models[${index}].type is invalid`)
  }

  const providerFromField = readTrimmedString(raw.provider)
  const modelIdFromField = readTrimmedString(raw.modelId)
  const modelKeyFromField = readTrimmedString(raw.modelKey)
  const parsedFromKey = modelKeyFromField ? parseModelKeyStrict(modelKeyFromField) : null
  const provider = providerFromField || parsedFromKey?.provider || ''
  const modelId = modelIdFromField || parsedFromKey?.modelId || ''
  const modelKey = composeModelKey(provider, modelId)

  if (!modelKey) {
    throw new Error(`MODEL_KEY_INVALID: models[${index}] must include provider and modelId`)
  }
  if (parsedFromKey && parsedFromKey.modelKey !== modelKey) {
    throw new Error(`MODEL_KEY_MISMATCH: models[${index}].modelKey conflicts with provider/modelId`)
  }

  assertOfficialProvider(provider)

  const llmProtocolRaw = raw.llmProtocol
  let llmProtocol: LlmProtocolType | undefined
  if (llmProtocolRaw !== undefined && llmProtocolRaw !== null) {
    if (!isLlmProtocol(llmProtocolRaw)) {
      throw new Error(`MODEL_LLM_PROTOCOL_INVALID: models[${index}].llmProtocol`)
    }
    llmProtocol = llmProtocolRaw
  }

  return {
    modelId,
    modelKey,
    provider,
    type: raw.type,
    name: readTrimmedString(raw.name) || modelId,
    ...(llmProtocol ? { llmProtocol } : {}),
    ...(readTrimmedString(raw.llmProtocolCheckedAt)
      ? { llmProtocolCheckedAt: readTrimmedString(raw.llmProtocolCheckedAt) }
      : {}),
    price: 0,
  }
}

function parseCustomModels(rawModels: string | null | undefined): CustomModel[] {
  if (!rawModels) return []

  let parsedUnknown: unknown
  try {
    parsedUnknown = JSON.parse(rawModels)
  } catch {
    throw new Error('MODEL_PAYLOAD_INVALID: customModels is not valid JSON')
  }
  if (!Array.isArray(parsedUnknown)) {
    throw new Error('MODEL_PAYLOAD_INVALID: customModels must be an array')
  }
  return parsedUnknown.map((raw, index) => normalizeStoredModel(raw, index))
}

function pickProviderStrict(providers: CustomProvider[], providerId: string): CustomProvider {
  assertOfficialProvider(providerId)
  const matched = providers.find((provider) => provider.id === providerId)
  if (matched) return matched
  throw new Error(`PROVIDER_NOT_FOUND: ${providerId} is not configured`)
}

async function readUserConfig(userId: string): Promise<{ models: CustomModel[]; providers: CustomProvider[] }> {
  const pref = await prisma.userPreference.findUnique({
    where: { userId },
    select: { customModels: true, customProviders: true },
  })
  return {
    models: parseCustomModels(pref?.customModels),
    providers: parseCustomProviders(pref?.customProviders),
  }
}

function findModelByKey(models: CustomModel[], modelKey: string): CustomModel | null {
  const parsed = assertModelKey(modelKey, 'model')
  return models.find((model) => model.modelId === parsed.modelId && model.provider === parsed.provider) || null
}

export async function resolveModelSelection(
  userId: string,
  model: string,
  mediaType: ModelMediaType,
): Promise<ModelSelection> {
  const parsed = assertModelKey(model, `${mediaType} model`)
  assertOfficialProvider(parsed.provider)
  const models = await getModelsByType(userId, mediaType)
  const exact = findModelByKey(models, parsed.modelKey)
  if (!exact) {
    throw new Error(`MODEL_NOT_FOUND: ${parsed.modelKey} is not enabled for ${mediaType}`)
  }

  return {
    provider: exact.provider,
    modelId: exact.modelId,
    modelKey: composeModelKey(exact.provider, exact.modelId),
    mediaType,
    ...(mediaType === 'llm' && exact.llmProtocol ? { llmProtocol: exact.llmProtocol } : {}),
  }
}

async function resolveSingleModelSelection(
  userId: string,
  mediaType: ModelMediaType,
): Promise<ModelSelection> {
  const models = await getModelsByType(userId, mediaType)
  if (models.length === 0) {
    throw new Error(`MODEL_NOT_CONFIGURED: no ${mediaType} model is enabled`)
  }
  if (models.length > 1) {
    throw new Error(`MODEL_SELECTION_REQUIRED: multiple ${mediaType} models are enabled, provide model_key explicitly`)
  }
  const model = models[0]
  assertOfficialProvider(model.provider)
  return {
    provider: model.provider,
    modelId: model.modelId,
    modelKey: composeModelKey(model.provider, model.modelId),
    mediaType,
    ...(mediaType === 'llm' && model.llmProtocol ? { llmProtocol: model.llmProtocol } : {}),
  }
}

export async function resolveModelSelectionOrSingle(
  userId: string,
  model: string | null | undefined,
  mediaType: ModelMediaType,
): Promise<ModelSelection> {
  const modelKey = readTrimmedString(model)
  return modelKey
    ? await resolveModelSelection(userId, modelKey, mediaType)
    : await resolveSingleModelSelection(userId, mediaType)
}

export interface ProviderConfig {
  id: string
  name: string
  apiKey: string
  apiMode?: 'gemini-sdk' | 'openai-official'
  gatewayRoute?: 'official'
}

export async function getProviderConfig(userId: string, providerId: string): Promise<ProviderConfig> {
  assertOfficialProvider(providerId)
  const { providers } = await readUserConfig(userId)
  const provider = pickProviderStrict(providers, providerId)
  if (!provider.apiKey) {
    throw new Error(`PROVIDER_API_KEY_MISSING: ${provider.id}`)
  }

  return {
    id: provider.id,
    name: provider.name,
    apiKey: decryptApiKey(provider.apiKey),
    apiMode: provider.apiMode,
    gatewayRoute: 'official',
  }
}

/** 获取用户启用的官方模型列表。 */
export async function getUserModels(userId: string): Promise<CustomModel[]> {
  const { models } = await readUserConfig(userId)
  return models
}

export async function getModelProvider(userId: string, model: string): Promise<string | null> {
  const { models } = await readUserConfig(userId)
  const matched = findModelByKey(models, model)
  return matched?.provider || null
}

export async function getModelsByType(userId: string, type: ModelMediaType): Promise<CustomModel[]> {
  const models = await getUserModels(userId)
  return models.filter((model) => model.type === type)
}

export async function resolveModelId(userId: string, model: string): Promise<string> {
  const selection = await resolveModelSelection(userId, model, 'llm')
  return selection.modelId
}

export async function getModelPrice(userId: string, model: string): Promise<number> {
  const { models } = await readUserConfig(userId)
  const matched = findModelByKey(models, model)
  if (!matched) throw new Error(`MODEL_NOT_FOUND: ${model}`)
  return matched.price
}

export async function getAudioApiKey(userId: string, model?: string | null): Promise<string> {
  const selection = await resolveModelSelectionOrSingle(userId, model, 'audio')
  return (await getProviderConfig(userId, selection.provider)).apiKey
}

export async function getLipSyncApiKey(userId: string, model?: string | null): Promise<string> {
  const selection = await resolveModelSelectionOrSingle(userId, model, 'lipsync')
  return (await getProviderConfig(userId, selection.provider)).apiKey
}

export async function hasApiConfig(userId: string): Promise<boolean> {
  const pref = await prisma.userPreference.findUnique({
    where: { userId },
    select: { customProviders: true },
  })
  try {
    const providers = parseCustomProviders(pref?.customProviders)
    return providers.some((provider) => !!provider.apiKey)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('OFFICIAL_PROVIDER_REQUIRED:')) {
      return false
    }
    throw error
  }
}
