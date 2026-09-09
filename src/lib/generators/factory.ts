/**
 * 生成器工厂（官方 API 严格模式）
 *
 * 这里只允许能够明确证明为模型厂商第一方 API 的实现。
 * 协议兼容层、聚合平台和第三方托管平台不得在这里注册。
 */

import { ImageGenerator, VideoGenerator, AudioGenerator } from './base'
import { ArkSeedreamGenerator, ArkSeedanceVideoGenerator } from './ark'
import {
    GoogleGeminiImageGenerator,
    GoogleImagenGenerator,
    GoogleGeminiBatchImageGenerator,
} from './image'
import { GoogleVeoVideoGenerator } from './video/google'
import { MinimaxVideoGenerator } from './minimax'
import { ViduVideoGenerator } from './vidu'
import { getProviderKey } from '@/lib/api-config'
import {
    BailianAudioGenerator,
    BailianImageGenerator,
    BailianVideoGenerator,
} from './official'

const BLOCKED_PROVIDER_KEYS = new Set([
    'evolink',
    'fal',
    'siliconflow',
    'openrouter',
    'openai-compatible',
    'gemini-compatible',
])

function assertNotRelayProvider(provider: string): string {
    const providerKey = getProviderKey(provider).toLowerCase()
    if (BLOCKED_PROVIDER_KEYS.has(providerKey)) {
        throw new Error(`OFFICIAL_PROVIDER_REQUIRED: ${provider} is disabled in official-only mode`)
    }
    return providerKey
}

/** 根据 provider 创建图片生成器。 */
export function createImageGenerator(provider: string, modelId?: string): ImageGenerator {
    const normalizeModelId = (rawModelId?: string): string | undefined => {
        if (!rawModelId) return rawModelId
        const delimiterIndex = rawModelId.indexOf('::')
        return delimiterIndex === -1 ? rawModelId : rawModelId.slice(delimiterIndex + 2)
    }

    const actualModelId = normalizeModelId(modelId)
    const providerKey = assertNotRelayProvider(provider)
    switch (providerKey) {
        case 'google':
            if (actualModelId === 'gemini-3-pro-image-preview-batch') {
                return new GoogleGeminiBatchImageGenerator()
            }
            if (actualModelId && actualModelId.startsWith('imagen-')) {
                return new GoogleImagenGenerator(actualModelId)
            }
            return new GoogleGeminiImageGenerator(actualModelId)
        case 'google-batch':
            return new GoogleGeminiBatchImageGenerator()
        case 'imagen':
            return new GoogleImagenGenerator(actualModelId)
        case 'ark':
            return new ArkSeedreamGenerator()
        case 'bailian':
            return new BailianImageGenerator()
        default:
            throw new Error(`UNSUPPORTED_OFFICIAL_PROVIDER: image provider ${provider} has no first-party generator implementation`)
    }
}

/** 根据 provider 创建视频生成器。 */
export function createVideoGenerator(provider: string): VideoGenerator {
    const providerKey = assertNotRelayProvider(provider)
    switch (providerKey) {
        case 'ark':
            return new ArkSeedanceVideoGenerator()
        case 'google':
            return new GoogleVeoVideoGenerator()
        case 'minimax':
            return new MinimaxVideoGenerator()
        case 'vidu':
            return new ViduVideoGenerator()
        case 'bailian':
            return new BailianVideoGenerator()
        default:
            throw new Error(`UNSUPPORTED_OFFICIAL_PROVIDER: video provider ${provider} has no first-party generator implementation`)
    }
}

/** 创建语音生成器。 */
export function createAudioGenerator(provider: string): AudioGenerator {
    const providerKey = assertNotRelayProvider(provider)
    switch (providerKey) {
        case 'bailian':
            return new BailianAudioGenerator()
        default:
            throw new Error(`UNSUPPORTED_OFFICIAL_PROVIDER: audio provider ${provider} has no first-party generator implementation`)
    }
}
