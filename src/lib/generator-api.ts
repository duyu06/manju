import { logInfo as _ulogInfo } from '@/lib/logging/core'
/**
 * 生成器统一入口（官方 API 严格模式）
 *
 * 支持：
 * - 严格使用 model_key（provider::modelId）
 * - 仅调用模型厂商第一方官方 API
 * - 不允许 EvoLink/FAL/SiliconFlow/OpenRouter/OpenAI-compatible 等中转或兼容入口
 */

import { createAudioGenerator, createImageGenerator, createVideoGenerator } from './generators/factory'
import type { GenerateResult } from './generators/base'
import { getProviderKey, resolveModelSelection } from './api-config'
import { generateBailianAudio, generateBailianImage, generateBailianVideo } from './providers/bailian'

const BLOCKED_PROVIDER_KEYS = new Set([
    'evolink',
    'fal',
    'siliconflow',
    'openrouter',
    'openai-compatible',
    'gemini-compatible',
])

function assertOfficialSelection(provider: string): string {
    const providerKey = getProviderKey(provider).toLowerCase()
    if (BLOCKED_PROVIDER_KEYS.has(providerKey)) {
        throw new Error(`OFFICIAL_PROVIDER_REQUIRED: ${provider} is disabled in official-only mode`)
    }
    return providerKey
}

export async function generateImage(
    userId: string,
    modelKey: string,
    prompt: string,
    options?: {
        referenceImages?: string[]
        aspectRatio?: string
        resolution?: string
        outputFormat?: string
        keepOriginalAspectRatio?: boolean
        size?: string
    }
): Promise<GenerateResult> {
    const selection = await resolveModelSelection(userId, modelKey, 'image')
    const providerKey = assertOfficialSelection(selection.provider)
    _ulogInfo(`[generateImage] official model selection: ${selection.modelKey}`)

    if (providerKey === 'bailian') {
        return await generateBailianImage({
            userId,
            prompt,
            referenceImages: options?.referenceImages,
            options: {
                ...(options || {}),
                provider: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
            },
        })
    }

    const { referenceImages, ...generatorOptions } = options || {}
    const generator = createImageGenerator(selection.provider, selection.modelId)
    return await generator.generate({
        userId,
        prompt,
        referenceImages,
        options: {
            ...generatorOptions,
            provider: selection.provider,
            modelId: selection.modelId,
            modelKey: selection.modelKey,
        },
    })
}

export async function generateVideo(
    userId: string,
    modelKey: string,
    imageUrl: string,
    options?: {
        prompt?: string
        duration?: number
        fps?: number
        resolution?: string
        aspectRatio?: string
        generateAudio?: boolean
        lastFrameImageUrl?: string
        [key: string]: string | number | boolean | undefined
    }
): Promise<GenerateResult> {
    const selection = await resolveModelSelection(userId, modelKey, 'video')
    const providerKey = assertOfficialSelection(selection.provider)
    _ulogInfo(`[generateVideo] official model selection: ${selection.modelKey}`)

    if (providerKey === 'bailian') {
        return await generateBailianVideo({
            userId,
            imageUrl,
            prompt: options?.prompt,
            options: {
                ...(options || {}),
                provider: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
            },
        })
    }

    const { prompt, ...providerOptions } = options || {}
    const generator = createVideoGenerator(selection.provider)
    return await generator.generate({
        userId,
        imageUrl,
        prompt,
        options: {
            ...providerOptions,
            provider: selection.provider,
            modelId: selection.modelId,
            modelKey: selection.modelKey,
        },
    })
}

export async function generateAudio(
    userId: string,
    modelKey: string,
    text: string,
    options?: {
        voice?: string
        rate?: number
    }
): Promise<GenerateResult> {
    const selection = await resolveModelSelection(userId, modelKey, 'audio')
    const providerKey = assertOfficialSelection(selection.provider)
    _ulogInfo(`[generateAudio] official model selection: ${selection.modelKey}`)

    if (providerKey === 'bailian') {
        return await generateBailianAudio({
            userId,
            text,
            voice: options?.voice,
            rate: options?.rate,
            options: {
                provider: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
            },
        })
    }

    const generator = createAudioGenerator(selection.provider)
    return await generator.generate({
        userId,
        text,
        voice: options?.voice,
        rate: options?.rate,
        options: {
            provider: selection.provider,
            modelId: selection.modelId,
            modelKey: selection.modelKey,
        },
    })
}
