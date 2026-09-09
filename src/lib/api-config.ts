/**
 * API configuration reader — direct-official mode.
 *
 * Outbound invariant:
 *   Browser/UI -> this application server -> model vendor official API
 *
 * User-controlled relay/proxy endpoints are intentionally unsupported.
 */

import { prisma } from './prisma'
import { decryptApiKey } from './crypto-utils'
import {
  composeModelKey,
  parseModelKeyStrict,
  type UnifiedModelType,
} from './model-config-contract'
import type {
  OpenAICompatMediaTemplate,
  OpenAICompatMediaTemplateSource,
} from './openai-compat-media-template'
import { validateOpenAICompatMediaTemplate } from './user-api/model-template/validator'

export interface CustomModel {
  modelId: string
  modelKey: string
  name: string
  type: UnifiedModelType
  provider: string
  llmProtocol?: 'responses' | 'chat-completions'
  llmProtocolCheckedAt?: string
  compatMediaTemplate?: OpenAICompatMediaTemplate
  compatMediaTemplateCheckedAt?: string
  compatMediaTemplateSource?: OpenAICompatMediaTemplateSource
  price: number
}

export type ModelMediaType = 'llm' | 'image' | 'video' | 'audio' | 'lipsync'

export interface ModelSelection {
  provider: string
  modelId: string
  modelKey: string
  mediaType: ModelMediaType
  llmProtocol?: 'responses' | 'chat-completions'
  compatMediaTemplate?: OpenAICompatMediaTemplate
}

type GatewayRouteType = 'official' | 'openai-compat'
type LlmProtocolType = 'responses' | 'chat-completions'

interface CustomProvider {
  id: string
  name: string
  baseUrl?: string
  apiKey?: string
  apiMode?: 'gemini-sdk' | 'openai-official'
  gatewayRoute: GatewayRouteType
}

/** Provider families implemented against first-party vendor APIs in this repository. */
const DIRECT_PROVIDER_KEYS = new Set([
  'openai',
  'google',
  'google-batch',
  'imagen',
  'ark',
  'bailian',
  'minimax',
  'vidu',
  // Some vendors expose their own OpenAI-compatible endpoint. The URL is
  // accepted only after it passes OFFICIAL_MODEL_API_HOSTS below.
  'openai-compatible',
])

/** Explicitly retired relay/aggregator provider families. */
const RETIRED_PROVIDER_KEYS = new Set([
  'evolink',
  'fal',
  'siliconflow',
  'openrouter',
  'litellm',
  'gemini-compatible',
])

/**
 * First-party API hosts allowed for configurable OpenAI-compatible vendors.
 * Built-in providers do not consume a user supplied base URL at all.
 */
const OFFICIAL_MODEL_API_HOSTS = new Set([
  'api.openai.com',
  'open.bigmodel.cn',
  'api.z.ai',
  'dashscope.aliyuncs.com',
  'ark.cn-beijing.volces.com',
  'api.minimaxi.com',
  'api.vidu.com',
  'api.klingai.com',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isUnifiedModelType(value: unknown): value is UnifiedModelType {
  return value === 'llm' || value === 'image' || value === 'video' || value === 'audio' || value === 'lipsync'
}

function isLlmProtocol(value: unknown): value is LlmProtocolType {
  return value === 'responses' || value === 'chat-completions'
}

/** Extract provider family from an instance id such as openai-compatible:uuid. */
export function getProviderKey(providerId?: string): string {
  if (!providerId) return ''
  const colonIndex = providerId.indexOf(':')
  return colonIndex === -1 ? providerId : providerId.slice(0, colonIndex)
}

function isRetiredProvider(providerId: string): boolean {
  return RETIRED_PROVIDER_KEYS.has(getProviderKey(providerId).toLowerCase())
}

function assertDirectProvider(providerId: string): string {
  const key = getProviderKey(providerId).toLowerCase()
  if (RETIRED_PROVIDER_KEYS.has(key)) {
    throw new Error(`MODEL_RELAY_PROVIDER_REMOVED: ${providerId}`)
  }
  if (!DIRECT_PROVIDER_KEYS.has(key)) {
    throw new Error(`DIRECT_OFFICIAL_PROVIDER_REQUIRED: ${providerId}`)
  }
  return key
}

/**
 * Validate a configurable endpoint before it can ever become an outbound target.
 * This deliberately rejects HTTP, localhost/IPs, userinfo, custom ports and
 * non-vendor domains, so a LiteLLM/proxy URL cannot be smuggled into the config.
 */
export function assertOfficialModelApiBaseUrl(rawBaseUrl: string): string {
  let parsed: URL
  try {
    parsed = new URL(rawBaseUrl)
  } catch {
    throw new Error('OFFICIAL_PROVIDER_URL_INVALID: invalid URL')
  }

  const hostname = parsed.hostname.toLowerCase()
  if (parsed.protocol !== 'https:') {
    throw new Error('OFFICIAL_PROVIDER_URL_INVALID: HTTPS is required')
  }
  if (parsed.username || parsed.password) {
    throw new Error('OFFICIAL_PROVIDER_URL_INVALID: URL credentials are forbidden')
  }
  if (parsed.port && parsed.port !== '443') {
    throw new Error('OFFICIAL_PROVIDER_URL_INVALID: custom ports are forbidden')
  }
  if (!OFFICIAL_MODEL_API_HOSTS.has(hostname)) {
    throw new Error(`OFFICIAL_PROVIDER_URL_REQUIRED: ${hostname}`)
  }

  parsed.hash = ''
  parsed.search = ''
  return parsed.toString().replace(/\/$/, '')
}

function fixedOfficialBaseUrl(providerKey: string): string | undefined {
  switch (providerKey) {
    case 'openai':
      return 'https://api.openai.com/v1'
    case 'minimax':
      return 'https://api.minimaxi.com/v1'
    default:
      return undefined
  }
}

function assertModelKey(value: string, field: string): { provider: string; modelId: string; modelKey: string } {
  const parsed = parseModelKeyStrict(value)
  if (!parsed) throw new Error(`MODEL_KEY_INVALID: ${field} must be provider::modelId`)
  return parsed
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
    if (!isRecord(raw)) throw new Error(`PROVIDER_PAYLOAD_INVALID: providers[${index}] must be an object`)

    const id = readTrimmedString(raw.id)
    const name = readTrimmedString(raw.name)
    if (!id || !name) throw new Error(`PROVIDER_PAYLOAD_INVALID: providers[${index}] missing id or name`)

    // Ignore legacy relay records so existing databases can boot, but never make
    // those records available to model selection or outbound code.
    if (isRetiredProvider(id)) continue

    const providerKey = assertDirectProvider(id)
    if (providers.some((provider) => provider.id.toLowerCase() === id.toLowerCase())) {
      throw new Error(`PROVIDER_DUPLICATE: providers[${index}].id duplicates id ${id}`)
    }

    const rawBaseUrl = readTrimmedString(raw.baseUrl)
    let baseUrl = fixedOfficialBaseUrl(providerKey)
    if (providerKey === 'openai-compatible') {
      if (!rawBaseUrl) {
        throw new Error(`OFFICIAL_PROVIDER_URL_REQUIRED: providers[${index}].baseUrl`)
      }
      baseUrl = assertOfficialModelApiBaseUrl(rawBaseUrl)
    }
    // User supplied base URLs for built-in providers are deliberately ignored.

    const apiModeRaw = raw.apiMode
    let apiMode: 'gemini-sdk' | 'openai-official' | undefined
    if (apiModeRaw === 'gemini-sdk' || apiModeRaw === 'openai-official') apiMode = apiModeRaw

    providers.push({
      id,
      name,
      baseUrl,
      apiKey: readTrimmedString(raw.apiKey) || undefined,
      apiMode,
      gatewayRoute: providerKey === 'openai-compatible' ? 'openai-compat' : 'official',
    })
  }
  return providers
}

function normalizeStoredModel(raw: unknown, index: number): CustomModel {
  if (!isRecord(raw)) throw new Error(`MODEL_PAYLOAD_INVALID: models[${index}] must be an object`)
  if (!isUnifiedModelType(raw.type)) throw new Error(`MODEL_TYPE_INVALID: models[${index}].type is invalid`)

  const providerFromField = readTrimmedString(raw.provider)
  const modelIdFromField = readTrimmedString(raw.modelId)
  const modelKeyFromField = readTrimmedString(raw.modelKey)
  const parsedFromKey = modelKeyFromField ? parseModelKeyStrict(modelKeyFromField) : null
  const provider = providerFromField || parsedFromKey?.provider || ''
  const modelId = modelIdFromField || parsedFromKey?.modelId || ''
  const modelKey = composeModelKey(provider, modelId)

  if (!modelKey) throw new Error(`MODEL_KEY_INVALID: models[${index}] must include provider and modelId`)
  if (parsedFromKey && parsedFromKey.modelKey !== modelKey) {
    throw new Error(`MODEL_KEY_MISMATCH: models[${index}].modelKey conflicts with provider/modelId`)
  }

  const llmProtocolRaw = raw.llmProtocol
  let llmProtocol: LlmProtocolType | undefined
  if (llmProtocolRaw !== undefined && llmProtocolRaw !== null) {
    if (!isLlmProtocol(llmProtocolRaw)) throw new Error(`MODEL_LLM_PROTOCOL_INVALID: models[${index}].llmProtocol`)
    llmProtocol = llmProtocolRaw
  }
  const llmProtocolCheckedAt = readTrimmedString(raw.llmProtocolCheckedAt) || undefined

  let compatMediaTemplate: OpenAICompatMediaTemplate | undefined
  if (raw.compatMediaTemplate !== undefined && raw.compatMediaTemplate !== null) {
    const validated = validateOpenAICompatMediaTemplate(raw.compatMediaTemplate)
    if (!validated.ok || !validated.template) {
      throw new Error(`MODEL_COMPAT_MEDIA_TEMPLATE_INVALID: models[${index}].compatMediaTemplate`)
    }
    compatMediaTemplate = validated.template
  }
  const compatMediaTemplateCheckedAt = readTrimmedString(raw.compatMediaTemplateCheckedAt) || undefined
  const source = readTrimmedString(raw.compatMediaTemplateSource)
  const compatMediaTemplateSource: OpenAICompatMediaTemplateSource | undefined = source === 'ai' || source === 'manual'
    ? source
    : undefined

  return {
    modelId,
    modelKey,
    provider,
    type: raw.type,
    name: readTrimmedString(raw.name) || modelId,
    ...(llmProtocol ? { llmProtocol } : {}),
    ...(llmProtocolCheckedAt ? { llmProtocolCheckedAt } : {}),
    ...(compatMediaTemplate ? { compatMediaTemplate } : {}),
    ...(compatMediaTemplateCheckedAt ? { compatMediaTemplateCheckedAt } : {}),
    ...(compatMediaTemplateSource ? { compatMediaTemplateSource } : {}),
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
  if (!Array.isArray(parsedUnknown)) throw new Error('MODEL_PAYLOAD_INVALID: customModels must be an array')
  return parsedUnknown.map((model, index) => normalizeStoredModel(model, index))
}

async function readUserConfig(userId: string): Promise<{ models: CustomModel[]; providers: CustomProvider[] }> {
  const pref = await prisma.userPreference.findUnique({
    where: { userId },
    select: { customModels: true, customProviders: true },
  })
  const providers = parseCustomProviders(pref?.customProviders)
  const providerIds = new Set(providers.map((provider) => provider.id))
  const models = parseCustomModels(pref?.customModels).filter((model) => providerIds.has(model.provider))
  return { models, providers }
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
  const models = await getModelsByType(userId, mediaType)
  const exact = findModelByKey(models, parsed.modelKey)
  if (!exact) throw new Error(`MODEL_NOT_FOUND: ${parsed.modelKey} is not enabled for ${mediaType}`)

  const providerKey = assertDirectProvider(exact.provider)
  const llmProtocol = mediaType === 'llm' && providerKey === 'openai-compatible'
    ? (exact.llmProtocol || 'chat-completions')
    : undefined
  const compatMediaTemplate = (mediaType === 'image' || mediaType === 'video') && providerKey === 'openai-compatible'
    ? exact.compatMediaTemplate
    : undefined

  return {
    provider: exact.provider,
    modelId: exact.modelId,
    modelKey: composeModelKey(exact.provider, exact.modelId),
    mediaType,
    ...(llmProtocol ? { llmProtocol } : {}),
    ...(compatMediaTemplate ? { compatMediaTemplate } : {}),
  }
}

async function resolveSingleModelSelection(userId: string, mediaType: ModelMediaType): Promise<ModelSelection> {
  const models = await getModelsByType(userId, mediaType)
  if (models.length === 0) throw new Error(`MODEL_NOT_CONFIGURED: no ${mediaType} model is enabled`)
  if (models.length > 1) {
    throw new Error(`MODEL_SELECTION_REQUIRED: multiple ${mediaType} models are enabled, provide model_key explicitly`)
  }
  return await resolveModelSelection(userId, models[0].modelKey, mediaType)
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
  baseUrl?: string
  apiMode?: 'gemini-sdk' | 'openai-official'
  gatewayRoute?: GatewayRouteType
}

export async function getProviderConfig(userId: string, providerId: string): Promise<ProviderConfig> {
  assertDirectProvider(providerId)
  const { providers } = await readUserConfig(userId)
  const provider = providers.find((candidate) => candidate.id === providerId)
  if (!provider) throw new Error(`PROVIDER_NOT_FOUND: ${providerId} is not configured`)
  if (!provider.apiKey) throw new Error(`PROVIDER_API_KEY_MISSING: ${provider.id}`)

  return {
    id: provider.id,
    name: provider.name,
    apiKey: decryptApiKey(provider.apiKey),
    baseUrl: provider.baseUrl,
    apiMode: provider.apiMode,
    gatewayRoute: provider.gatewayRoute,
  }
}

export async function getUserModels(userId: string): Promise<CustomModel[]> {
  return (await readUserConfig(userId)).models
}

export async function getModelProvider(userId: string, model: string): Promise<string | null> {
  const { models } = await readUserConfig(userId)
  return findModelByKey(models, model)?.provider || null
}

export async function getModelsByType(userId: string, type: ModelMediaType): Promise<CustomModel[]> {
  const models = await getUserModels(userId)
  return models.filter((model) => model.type === type)
}

export async function resolveModelId(userId: string, model: string): Promise<string> {
  return (await resolveModelSelection(userId, model, 'llm')).modelId
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
  const { providers } = await readUserConfig(userId)
  return providers.some((provider) => !!provider.apiKey)
}
