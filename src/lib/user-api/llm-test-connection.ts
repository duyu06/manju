import OpenAI from 'openai'
import { ApiError } from '@/lib/api-errors'

type SupportedProvider = 'openai' | 'google' | 'ark' | 'bailian' | 'minimax'

type TestConnectionPayload = {
  provider?: string
  apiKey?: string
  model?: string
}

export type LlmConnectionTestResult = {
  provider: SupportedProvider
  message: string
  model?: string
  answer?: string
}

function normalizeProvider(payload: TestConnectionPayload): SupportedProvider {
  const provider = typeof payload.provider === 'string' ? payload.provider.trim().toLowerCase() : ''
  if (
    provider === 'openai'
    || provider === 'google'
    || provider === 'ark'
    || provider === 'bailian'
    || provider === 'minimax'
  ) {
    return provider
  }
  throw new ApiError('INVALID_PARAMS', {
    message: `OFFICIAL_PROVIDER_REQUIRED: ${provider || 'unknown'}`,
  })
}

function requireApiKey(payload: TestConnectionPayload): string {
  const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : ''
  if (!apiKey) throw new ApiError('INVALID_PARAMS', { message: '缺少必要参数 apiKey' })
  return apiKey
}

async function testGoogleAI(apiKey: string): Promise<void> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    { method: 'GET', signal: AbortSignal.timeout(15_000) },
  )
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Google AI 认证失败: ${error}`)
  }
}

async function testOfficialOpenAICompatibleApi(params: {
  apiKey: string
  baseURL: string
  model: string
}): Promise<Pick<LlmConnectionTestResult, 'model' | 'answer'>> {
  const client = new OpenAI({
    apiKey: params.apiKey,
    baseURL: params.baseURL,
    timeout: 30_000,
  })
  const response = await client.chat.completions.create({
    model: params.model,
    messages: [{ role: 'user', content: '1+1等于几？只回答数字' }],
    max_tokens: 10,
    temperature: 0,
  })
  return {
    model: response.model || params.model,
    answer: response.choices[0]?.message?.content?.trim() || '',
  }
}

async function testOpenAI(apiKey: string, requestedModel: string): Promise<Pick<LlmConnectionTestResult, 'model' | 'answer'>> {
  if (requestedModel) {
    return await testOfficialOpenAICompatibleApi({
      apiKey,
      baseURL: 'https://api.openai.com/v1',
      model: requestedModel,
    })
  }
  const client = new OpenAI({ apiKey, baseURL: 'https://api.openai.com/v1', timeout: 20_000 })
  await client.models.list()
  return {}
}

async function testArk(apiKey: string, requestedModel: string): Promise<Pick<LlmConnectionTestResult, 'model' | 'answer'>> {
  return await testOfficialOpenAICompatibleApi({
    apiKey,
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    model: requestedModel || 'doubao-seed-2-0-lite-260215',
  })
}

async function testBailian(apiKey: string, requestedModel: string): Promise<Pick<LlmConnectionTestResult, 'model' | 'answer'>> {
  if (requestedModel) {
    return await testOfficialOpenAICompatibleApi({
      apiKey,
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: requestedModel,
    })
  }
  const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/models', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Bailian probe failed (${response.status}): ${error}`)
  }
  const data = await response.json() as { data?: Array<{ id?: string }> }
  return { model: Array.isArray(data.data) ? data.data.find((item) => typeof item.id === 'string')?.id : undefined }
}

async function testMiniMax(apiKey: string, requestedModel: string): Promise<Pick<LlmConnectionTestResult, 'model' | 'answer'>> {
  return await testOfficialOpenAICompatibleApi({
    apiKey,
    baseURL: 'https://api.minimaxi.com/v1',
    model: requestedModel || 'MiniMax-M2.5',
  })
}

export async function testLlmConnection(payload: TestConnectionPayload): Promise<LlmConnectionTestResult> {
  const provider = normalizeProvider(payload)
  const apiKey = requireApiKey(payload)
  const requestedModel = typeof payload.model === 'string' ? payload.model.trim() : ''

  switch (provider) {
    case 'google':
      await testGoogleAI(apiKey)
      return { provider, message: 'google 官方 API 连接成功' }
    case 'openai': {
      const tested = await testOpenAI(apiKey, requestedModel)
      return { provider, message: 'openai 官方 API 连接成功', ...tested }
    }
    case 'ark': {
      const tested = await testArk(apiKey, requestedModel)
      return { provider, message: 'ark 官方 API 连接成功', ...tested }
    }
    case 'bailian': {
      const tested = await testBailian(apiKey, requestedModel)
      return { provider, message: 'bailian 官方 API 连接成功', ...tested }
    }
    case 'minimax': {
      const tested = await testMiniMax(apiKey, requestedModel)
      return { provider, message: 'minimax 官方 API 连接成功', ...tested }
    }
  }
}
