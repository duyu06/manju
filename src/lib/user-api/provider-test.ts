import OpenAI from 'openai'
import { createScopedLogger } from '@/lib/logging/core'

const logger = createScopedLogger({ module: 'user-api.provider-test' })

export type TestStepName = 'models' | 'textGen' | 'imageGen' | 'credits' | 'audioGen'
export type TestStepStatus = 'pass' | 'fail' | 'skip'

export interface TestStep {
  name: TestStepName
  status: TestStepStatus
  message: string
  model?: string
  detail?: string
}

export interface TestProviderResult {
  success: boolean
  steps: TestStep[]
}

type OfficialProviderType = 'openai' | 'google' | 'ark' | 'bailian' | 'minimax' | 'vidu'

type TestProviderPayload = {
  apiType?: string
  apiKey?: string
  llmModel?: string
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (
      error.message.includes('fetch failed')
      || error.message.includes('ECONNREFUSED')
      || error.message.includes('ENOTFOUND')
    ) {
      return 'Network error — check your internet connection / 网络连接失败，请检查网络后重试'
    }
    if (error.message.includes('Connection error')) {
      return 'Network error — temporary connection failure, please retry / 网络抖动，请稍后重试'
    }
    if (error.message.includes('401')) return 'Authentication failed — check API Key'
    if (error.message.includes('403')) return 'Access denied — check API Key permissions'
    if (error.message.includes('timeout') || error.name === 'TimeoutError') return 'Request timed out'
    return error.message.slice(0, 200)
  }
  return String(error).slice(0, 200)
}

function httpFailure(status: number, detail: string, step: TestStepName = 'models'): TestProviderResult {
  const message = status === 401 || status === 403
    ? `Authentication failed (${status})`
    : status === 429
      ? `Rate limited (${status})`
      : `Provider error (${status})`
  return {
    success: false,
    steps: [{ name: step, status: 'fail', message, detail: detail.slice(0, 500) || undefined }],
  }
}

async function testOpenAIProvider(apiKey: string): Promise<TestProviderResult> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return httpFailure(response.status, await response.text().catch(() => ''))
    const data = await response.json() as { data?: unknown[] }
    return {
      success: true,
      steps: [{
        name: 'models',
        status: 'pass',
        message: `OpenAI official API connected (${Array.isArray(data.data) ? data.data.length : 0} models)`,
      }],
    }
  } catch (error) {
    return { success: false, steps: [{ name: 'models', status: 'fail', message: toErrorMessage(error) }] }
  }
}

async function testGoogleProvider(apiKey: string): Promise<TestProviderResult> {
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      method: 'GET',
      headers: { 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return httpFailure(response.status, await response.text().catch(() => ''))
    const data = await response.json() as { models?: unknown[] }
    return {
      success: true,
      steps: [{
        name: 'models',
        status: 'pass',
        message: `Google AI Studio connected (${Array.isArray(data.models) ? data.models.length : 0} models)`,
      }],
    }
  } catch (error) {
    return { success: false, steps: [{ name: 'models', status: 'fail', message: toErrorMessage(error) }] }
  }
}

async function testArkProvider(apiKey: string, llmModel?: string): Promise<TestProviderResult> {
  const model = llmModel?.trim() || 'doubao-seed-2-0-lite-260215'
  try {
    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        max_output_tokens: 8,
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) return httpFailure(response.status, await response.text().catch(() => ''), 'textGen')
    return {
      success: true,
      steps: [{ name: 'textGen', status: 'pass', model, message: 'Volcengine Ark official API connected' }],
    }
  } catch (error) {
    return {
      success: false,
      steps: [{ name: 'textGen', status: 'fail', model, message: toErrorMessage(error) }],
    }
  }
}

async function testBailianProvider(apiKey: string): Promise<TestProviderResult> {
  try {
    const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/models', {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) return httpFailure(response.status, await response.text().catch(() => ''))
    const data = await response.json() as { data?: unknown[] }
    return {
      success: true,
      steps: [{
        name: 'models',
        status: 'pass',
        message: `Alibaba Bailian official API connected (${Array.isArray(data.data) ? data.data.length : 0} models)`,
      }],
    }
  } catch (error) {
    return { success: false, steps: [{ name: 'models', status: 'fail', message: toErrorMessage(error) }] }
  }
}

async function testMiniMaxProvider(apiKey: string, llmModel?: string): Promise<TestProviderResult> {
  const model = llmModel?.trim() || 'MiniMax-M2.5'
  try {
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://api.minimaxi.com/v1',
      timeout: 30_000,
    })
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 8,
      temperature: 0,
    })
    const answer = response.choices[0]?.message?.content?.trim() || ''
    return {
      success: true,
      steps: [{
        name: 'textGen',
        status: 'pass',
        model,
        message: answer ? `MiniMax official API connected: ${answer.slice(0, 60)}` : 'MiniMax official API connected',
      }],
    }
  } catch (error) {
    return {
      success: false,
      steps: [{ name: 'textGen', status: 'fail', model, message: toErrorMessage(error) }],
    }
  }
}

async function testViduProvider(apiKey: string): Promise<TestProviderResult> {
  try {
    const response = await fetch('https://api.vidu.cn/ent/v2/credits', {
      method: 'GET',
      headers: { Authorization: `Token ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return httpFailure(response.status, await response.text().catch(() => ''), 'credits')
    const data = await response.json() as { remains?: Array<{ credit_remain?: number }> }
    const balance = data.remains?.[0]?.credit_remain
    return {
      success: true,
      steps: [{
        name: 'credits',
        status: 'pass',
        message: typeof balance === 'number' ? `Vidu official API connected — balance ${balance}` : 'Vidu official API connected',
      }],
    }
  } catch (error) {
    return { success: false, steps: [{ name: 'credits', status: 'fail', message: toErrorMessage(error) }] }
  }
}

function isOfficialProvider(value: string): value is OfficialProviderType {
  return value === 'openai'
    || value === 'google'
    || value === 'ark'
    || value === 'bailian'
    || value === 'minimax'
    || value === 'vidu'
}

export async function testProviderConnection(payload: TestProviderPayload): Promise<TestProviderResult> {
  const apiType = typeof payload.apiType === 'string' ? payload.apiType.trim().toLowerCase() : ''
  const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : ''
  const llmModel = typeof payload.llmModel === 'string' ? payload.llmModel.trim() : undefined

  if (!apiKey) {
    return {
      success: false,
      steps: [{ name: 'models', status: 'fail', message: 'Missing apiKey' }],
    }
  }

  if (!isOfficialProvider(apiType)) {
    logger.warn({
      action: 'provider.test.blocked',
      message: 'blocked non-official provider test request',
      details: { apiType },
    })
    return {
      success: false,
      steps: [{ name: 'models', status: 'fail', message: `OFFICIAL_PROVIDER_REQUIRED: ${apiType || 'unknown'}` }],
    }
  }

  switch (apiType) {
    case 'openai':
      return testOpenAIProvider(apiKey)
    case 'google':
      return testGoogleProvider(apiKey)
    case 'ark':
      return testArkProvider(apiKey, llmModel)
    case 'bailian':
      return testBailianProvider(apiKey)
    case 'minimax':
      return testMiniMaxProvider(apiKey, llmModel)
    case 'vidu':
      return testViduProvider(apiKey)
  }
}
