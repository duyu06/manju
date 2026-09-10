
import {
  BaseAudioGenerator,
  BaseImageGenerator,
  BaseVideoGenerator,
  type AudioGenerateParams,
  type GenerateResult,
  type ImageGenerateParams,
  type VideoGenerateParams,
} from './base'
import { generateBailianAudio, generateBailianImage, generateBailianVideo } from '@/lib/providers/bailian'

export class BailianImageGenerator extends BaseImageGenerator {
  protected async doGenerate(params: ImageGenerateParams): Promise<GenerateResult> {
    return await generateBailianImage({
      userId: params.userId,
      prompt: params.prompt,
      referenceImages: params.referenceImages,
      options: {
        ...params.options,
        provider: 'bailian',
        modelId: typeof params.options?.modelId === 'string' ? params.options.modelId : '',
        modelKey: typeof params.options?.modelKey === 'string' ? params.options.modelKey : '',
      },
    })
  }
}

export class BailianVideoGenerator extends BaseVideoGenerator {
  protected async doGenerate(params: VideoGenerateParams): Promise<GenerateResult> {
    return await generateBailianVideo({
      userId: params.userId,
      imageUrl: params.imageUrl,
      prompt: params.prompt,
      options: {
        ...params.options,
        provider: 'bailian',
        modelId: typeof params.options?.modelId === 'string' ? params.options.modelId : '',
        modelKey: typeof params.options?.modelKey === 'string' ? params.options.modelKey : '',
      },
    })
  }
}

export class BailianAudioGenerator extends BaseAudioGenerator {
  protected async doGenerate(params: AudioGenerateParams): Promise<GenerateResult> {
    return await generateBailianAudio({
      userId: params.userId,
      text: params.text,
      voice: params.voice,
      rate: params.rate,
      options: {
        ...params.options,
        provider: 'bailian',
        modelId: typeof params.options?.modelId === 'string' ? params.options.modelId : '',
        modelKey: typeof params.options?.modelKey === 'string' ? params.options.modelKey : '',
      },
    })
  }
}
