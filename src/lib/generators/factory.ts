/**
 * Generator factory.
 *
 * Runtime outbound traffic is restricted to first-party model vendors.
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
import {
    BailianAudioGenerator,
    BailianImageGenerator,
    BailianVideoGenerator,
} from './official'
import { assertOfficialProvider } from '@/lib/providers/official/provider-policy'

/** Create an image generator for an official provider. */
export function createImageGenerator(provider: string, modelId?: string): ImageGenerator {
    const normalizeModelId = (rawModelId?: string): string | undefined => {
        if (!rawModelId) return rawModelId
        const delimiterIndex = rawModelId.indexOf('::')
        return delimiterIndex === -1 ? rawModelId : rawModelId.slice(delimiterIndex + 2)
    }

    const actualModelId = normalizeModelId(modelId)
    const providerKey = assertOfficialProvider(provider)

    switch (providerKey) {
        case 'google':
            if (actualModelId === 'gemini-3-pro-image-preview-batch') {
                return new GoogleGeminiBatchImageGenerator()
            }
            if (actualModelId && actualModelId.startsWith('imagen-')) {
                return new GoogleImagenGenerator(actualModelId)
            }
            return new GoogleGeminiImageGenerator(actualModelId)
        case 'ark':
            return new ArkSeedreamGenerator()
        case 'bailian':
            return new BailianImageGenerator()
        default:
            throw new Error(`OFFICIAL_IMAGE_PROVIDER_UNSUPPORTED: ${providerKey}`)
    }
}

/** Create a video generator for an official provider. */
export function createVideoGenerator(provider: string): VideoGenerator {
    const providerKey = assertOfficialProvider(provider)

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
            throw new Error(`OFFICIAL_VIDEO_PROVIDER_UNSUPPORTED: ${providerKey}`)
    }
}

/** Create an audio generator for an official provider. */
export function createAudioGenerator(provider: string): AudioGenerator {
    const providerKey = assertOfficialProvider(provider)

    switch (providerKey) {
        case 'bailian':
            return new BailianAudioGenerator()
        default:
            throw new Error(`OFFICIAL_AUDIO_PROVIDER_UNSUPPORTED: ${providerKey}`)
    }
}
