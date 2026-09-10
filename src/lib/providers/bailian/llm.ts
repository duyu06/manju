import OpenAI from 'openai'
import {
  assertOfficialModelRegistered,
  type OfficialModelModality,
} from '@/lib/providers/official/model-registry'
import { ensureBailianCatalogRegistered } from './catalog'
import type { BailianLlmMessage } from './types'

const BAILIAN_OFFICIAL_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

export interface BailianLlmCompletionParams {
  modelId: string
  messages: BailianLlmMessage[]
  apiKey: string
  temperature?: number
}

function assertRegistered(modelId: string): void {
  ensureBailianCatalogRegistered()
  assertOfficialModelRegistered({
    provider: 'bailian',
    modality: 'llm' satisfies OfficialModelModality,
    modelId,
  })
}

export async function completeBailianLlm(
  params: BailianLlmCompletionParams,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  assertRegistered(params.modelId)
  const client = new OpenAI({
    apiKey: params.apiKey,
    baseURL: BAILIAN_OFFICIAL_BASE_URL,
    timeout: 30_000,
  })
  const completion = await client.chat.completions.create({
    model: params.modelId,
    messages: params.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    temperature: params.temperature ?? 0.7,
  })
  return completion as OpenAI.Chat.Completions.ChatCompletion
}
