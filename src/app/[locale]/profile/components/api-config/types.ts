/**
 * API 配置类型定义和预设常量（官方 API 模式）
 */
import {
    composeModelKey,
    parseModelKeyStrict,
    type ModelCapabilities,
    type UnifiedModelType,
} from '@/lib/model-config-contract'
import type {
    OpenAICompatMediaTemplate,
    OpenAICompatMediaTemplateSource,
} from '@/lib/openai-compat-media-template'

// 统一提供商接口。provider 只能来自第一方厂商预设。
export interface Provider {
    id: string
    name: string
    baseUrl?: string
    apiKey?: string
    hasApiKey?: boolean
    hidden?: boolean
    apiMode?: 'gemini-sdk' | 'openai-official'
    gatewayRoute?: 'official'
}

export interface LlmCustomPricing {
    inputPerMillion?: number
    outputPerMillion?: number
}

export interface MediaCustomPricing {
    basePrice?: number
    optionPrices?: Record<string, Record<string, number>>
}

export interface CustomModelPricing {
    llm?: LlmCustomPricing
    image?: MediaCustomPricing
    video?: MediaCustomPricing
}

export interface CustomModel {
    modelId: string
    modelKey: string
    name: string
    type: UnifiedModelType
    provider: string
    llmProtocol?: 'responses' | 'chat-completions'
    llmProtocolCheckedAt?: string
    // 仅用于安全读取历史配置；官方模式不会执行兼容模板。
    compatMediaTemplate?: OpenAICompatMediaTemplate
    compatMediaTemplateCheckedAt?: string
    compatMediaTemplateSource?: OpenAICompatMediaTemplateSource
    price: number
    priceMin?: number
    priceMax?: number
    priceLabel?: string
    priceInput?: number
    priceOutput?: number
    enabled: boolean
    capabilities?: ModelCapabilities
    customPricing?: CustomModelPricing
}

export interface PricingDisplayItem {
    min: number
    max: number
    label: string
    input?: number
    output?: number
}

export type PricingDisplayMap = Record<string, PricingDisplayItem>

export interface ApiConfig {
    models: CustomModel[]
    providers: Provider[]
    workflowConcurrency?: {
        analysis: number
        image: number
        video: number
    }
    pricingDisplay?: PricingDisplayMap
}

type PresetModel = Omit<CustomModel, 'enabled' | 'modelKey' | 'price'>

// 只暴露具有厂商第一方调用实现的模型。
export const PRESET_MODELS: PresetModel[] = [
    // OpenAI 官方文本模型
    { modelId: 'gpt-5.4', name: 'GPT-5.4', type: 'llm', provider: 'openai' },

    // Google AI Studio 文本模型
    { modelId: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', type: 'llm', provider: 'google' },
    { modelId: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', type: 'llm', provider: 'google' },
    { modelId: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash-Lite', type: 'llm', provider: 'google' },

    // 火山引擎 Ark 文本模型
    { modelId: 'doubao-seed-1-8-251228', name: 'Doubao Seed 1.8', type: 'llm', provider: 'ark' },
    { modelId: 'doubao-seed-2-0-pro-260215', name: 'Doubao Seed 2.0 Pro', type: 'llm', provider: 'ark' },
    { modelId: 'doubao-seed-2-0-lite-260215', name: 'Doubao Seed 2.0 Lite', type: 'llm', provider: 'ark' },
    { modelId: 'doubao-seed-2-0-mini-260215', name: 'Doubao Seed 2.0 Mini', type: 'llm', provider: 'ark' },
    { modelId: 'doubao-seed-1-6-251015', name: 'Doubao Seed 1.6', type: 'llm', provider: 'ark' },
    { modelId: 'doubao-seed-1-6-lite-251015', name: 'Doubao Seed 1.6 Lite', type: 'llm', provider: 'ark' },

    // 阿里云百炼文本模型
    { modelId: 'qwen3.5-plus', name: 'Qwen 3.5 Plus', type: 'llm', provider: 'bailian' },
    { modelId: 'qwen3.5-flash', name: 'Qwen 3.5 Flash', type: 'llm', provider: 'bailian' },

    // 图像模型
    { modelId: 'doubao-seedream-4-5-251128', name: 'Seedream 4.5', type: 'image', provider: 'ark' },
    { modelId: 'doubao-seedream-4-0-250828', name: 'Seedream 4.0', type: 'image', provider: 'ark' },
    { modelId: 'doubao-seedream-5-0-260128', name: 'Seedream 5.0 Lite', type: 'image', provider: 'ark' },
    { modelId: 'gemini-3-pro-image-preview', name: 'Banana Pro', type: 'image', provider: 'google' },
    { modelId: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2', type: 'image', provider: 'google' },
    { modelId: 'gemini-3-pro-image-preview-batch', name: 'Banana Pro (Batch)', type: 'image', provider: 'google' },
    { modelId: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image', type: 'image', provider: 'google' },
    { modelId: 'imagen-4.0-generate-001', name: 'Imagen 4', type: 'image', provider: 'google' },
    { modelId: 'imagen-4.0-ultra-generate-001', name: 'Imagen 4 Ultra', type: 'image', provider: 'google' },
    { modelId: 'imagen-4.0-fast-generate-001', name: 'Imagen 4 Fast', type: 'image', provider: 'google' },

    // 视频模型
    { modelId: 'doubao-seedance-1-0-pro-fast-251015', name: 'Seedance 1.0 Pro Fast', type: 'video', provider: 'ark' },
    { modelId: 'doubao-seedance-1-0-lite-i2v-250428', name: 'Seedance 1.0 Lite', type: 'video', provider: 'ark' },
    { modelId: 'doubao-seedance-1-5-pro-251215', name: 'Seedance 1.5 Pro', type: 'video', provider: 'ark' },
    { modelId: 'doubao-seedance-2-0-260128', name: 'Seedance 2.0（待上线）', type: 'video', provider: 'ark' },
    { modelId: 'doubao-seedance-1-0-pro-250528', name: 'Seedance 1.0 Pro', type: 'video', provider: 'ark' },
    { modelId: 'veo-3.1-generate-preview', name: 'Veo 3.1', type: 'video', provider: 'google' },
    { modelId: 'veo-3.1-fast-generate-preview', name: 'Veo 3.1 Fast', type: 'video', provider: 'google' },
    { modelId: 'veo-3.0-generate-001', name: 'Veo 3.0', type: 'video', provider: 'google' },
    { modelId: 'veo-3.0-fast-generate-001', name: 'Veo 3.0 Fast', type: 'video', provider: 'google' },
    { modelId: 'veo-2.0-generate-001', name: 'Veo 2.0', type: 'video', provider: 'google' },
    { modelId: 'wan2.6-i2v-flash', name: 'Wan2.6 I2V Flash', type: 'video', provider: 'bailian' },
    { modelId: 'wan2.6-i2v', name: 'Wan2.6 I2V', type: 'video', provider: 'bailian' },
    { modelId: 'wan2.5-i2v-preview', name: 'Wan2.5 I2V Preview', type: 'video', provider: 'bailian' },
    { modelId: 'wan2.2-i2v-plus', name: 'Wan2.2 I2V Plus', type: 'video', provider: 'bailian' },
    { modelId: 'wan2.2-kf2v-flash', name: 'Wan2.2 KF2V Flash', type: 'video', provider: 'bailian' },
    { modelId: 'wanx2.1-kf2v-plus', name: 'WanX2.1 KF2V Plus', type: 'video', provider: 'bailian' },

    // 音频与口型同步
    { modelId: 'qwen3-tts-vd-2026-01-26', name: 'Qwen3 TTS', type: 'audio', provider: 'bailian' },
    { modelId: 'qwen-voice-design', name: 'Qwen Voice Design', type: 'audio', provider: 'bailian' },
    { modelId: 'vidu-lipsync', name: 'Vidu Lip Sync', type: 'lipsync', provider: 'vidu' },
    { modelId: 'videoretalk', name: 'VideoRetalk Lip Sync', type: 'lipsync', provider: 'bailian' },

    // MiniMax 官方视频模型
    { modelId: 'minimax-hailuo-2.3', name: 'Hailuo 2.3', type: 'video', provider: 'minimax' },
    { modelId: 'minimax-hailuo-2.3-fast', name: 'Hailuo 2.3 Fast', type: 'video', provider: 'minimax' },
    { modelId: 'minimax-hailuo-02', name: 'Hailuo 02', type: 'video', provider: 'minimax' },
    { modelId: 't2v-01', name: 'T2V-01', type: 'video', provider: 'minimax' },
    { modelId: 't2v-01-director', name: 'T2V-01 Director', type: 'video', provider: 'minimax' },

    // Vidu 官方视频模型
    { modelId: 'viduq3-pro', name: 'Vidu Q3 Pro', type: 'video', provider: 'vidu' },
    { modelId: 'viduq2-pro-fast', name: 'Vidu Q2 Pro Fast', type: 'video', provider: 'vidu' },
    { modelId: 'viduq2-pro', name: 'Vidu Q2 Pro', type: 'video', provider: 'vidu' },
    { modelId: 'viduq2-turbo', name: 'Vidu Q2 Turbo', type: 'video', provider: 'vidu' },
    { modelId: 'viduq1', name: 'Vidu Q1', type: 'video', provider: 'vidu' },
    { modelId: 'viduq1-classic', name: 'Vidu Q1 Classic', type: 'video', provider: 'vidu' },
    { modelId: 'vidu2.0', name: 'Vidu 2.0', type: 'video', provider: 'vidu' },
]

const PRESET_COMING_SOON_MODEL_KEYS = new Set<string>([
    encodeModelKey('ark', 'doubao-seedance-2-0-260128'),
])

export function isPresetComingSoonModel(provider: string, modelId: string): boolean {
    return PRESET_COMING_SOON_MODEL_KEYS.has(encodeModelKey(provider, modelId))
}

export function isPresetComingSoonModelKey(modelKey: string): boolean {
    return PRESET_COMING_SOON_MODEL_KEYS.has(modelKey)
}

// 只允许第一方模型厂商 provider。
export const PRESET_PROVIDERS: Omit<Provider, 'apiKey' | 'hasApiKey'>[] = [
    { id: 'openai', name: 'OpenAI' },
    { id: 'ark', name: 'Volcengine Ark' },
    { id: 'google', name: 'Google AI Studio' },
    { id: 'bailian', name: 'Alibaba Bailian' },
    { id: 'minimax', name: 'MiniMax Hailuo', baseUrl: 'https://api.minimaxi.com/v1' },
    { id: 'vidu', name: 'Vidu' },
]

const ZH_PROVIDER_NAME_MAP: Record<string, string> = {
    openai: 'OpenAI',
    google: 'Google AI Studio',
    ark: '火山引擎 Ark',
    minimax: '海螺 MiniMax',
    vidu: '生数科技 Vidu',
    bailian: '阿里云百炼',
}

function isZhLocale(locale?: string): boolean {
    return typeof locale === 'string' && locale.toLowerCase().startsWith('zh')
}

export function resolvePresetProviderName(providerId: string, fallbackName: string, locale?: string): string {
    if (!isZhLocale(locale)) return fallbackName
    return ZH_PROVIDER_NAME_MAP[providerId] ?? fallbackName
}

/** 提取 provider 主键（用于官方 provider 的内部实例 ID）。 */
export function getProviderKey(providerId?: string): string {
    if (!providerId) return ''
    const colonIndex = providerId.indexOf(':')
    return colonIndex === -1 ? providerId : providerId.slice(0, colonIndex)
}

export function getProviderDisplayName(providerId?: string, locale?: string): string {
    if (!providerId) return ''
    const providerKey = getProviderKey(providerId)
    const provider = PRESET_PROVIDERS.find(p => p.id === providerKey)
    if (!provider) return providerId
    return resolvePresetProviderName(provider.id, provider.name, locale)
}

export function encodeModelKey(provider: string, modelId: string): string {
    return composeModelKey(provider, modelId)
}

export function parseModelKey(key: string | undefined | null): { provider: string, modelId: string } | null {
    const parsed = parseModelKeyStrict(key)
    if (!parsed) return null
    return {
        provider: parsed.provider,
        modelId: parsed.modelId,
    }
}

export function matchesModelKey(key: string | undefined | null, provider: string, modelId: string): boolean {
    const parsed = parseModelKeyStrict(key)
    if (!parsed) return false
    return parsed.provider === provider && parsed.modelId === modelId
}

export interface TutorialStep {
    text: string
    url?: string
}

export interface ProviderTutorial {
    providerId: string
    steps: TutorialStep[]
}

// 只保留厂商官方控制台/API Key 获取入口。
export const PROVIDER_TUTORIALS: ProviderTutorial[] = [
    {
        providerId: 'ark',
        steps: [
            {
                text: 'ark_step1',
                url: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D'
            },
            {
                text: 'ark_step2',
                url: 'https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&advancedActiveKey=model'
            }
        ]
    },
    {
        providerId: 'google',
        steps: [
            {
                text: 'google_step1',
                url: 'https://aistudio.google.com/api-keys'
            }
        ]
    },
    {
        providerId: 'minimax',
        steps: [
            {
                text: 'minimax_step1',
                url: 'https://platform.minimaxi.com/user-center/basic-information/interface-key'
            }
        ]
    },
    {
        providerId: 'vidu',
        steps: [
            {
                text: 'vidu_step1',
                url: 'https://platform.vidu.cn/api-keys'
            }
        ]
    },
    {
        providerId: 'bailian',
        steps: [
            {
                text: 'bailian_step1',
                url: 'https://bailian.console.aliyun.com/cn-beijing/?tab=model#/api-key'
            }
        ]
    },
]

export function getProviderTutorial(providerId: string): ProviderTutorial | undefined {
    const providerKey = getProviderKey(providerId)
    return PROVIDER_TUTORIALS.find(t => t.providerId === providerKey)
}
