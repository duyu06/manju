import { beforeEach, describe, expect, it, vi } from 'vitest'

const openAIState = vi.hoisted(() => ({
  constructorArgs: [] as Array<Record<string, unknown>>,
  modelList: vi.fn(async () => ({ data: [] })),
  create: vi.fn(async () => ({
    model: 'gpt-4.1-mini',
    choices: [{ message: { content: '2' } }],
  })),
}))

const fetchMock = vi.hoisted(() =>
  vi.fn(async (input: unknown) => {
    const url = String(input)
    if (url.includes('generativelanguage.googleapis.com/v1beta/models')) {
      return new Response(JSON.stringify({ models: [{ name: 'models/gemini-3-flash-preview' }] }), { status: 200 })
    }
    if (url.includes('dashscope.aliyuncs.com/compatible-mode/v1/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'qwen-plus' }] }), { status: 200 })
    }
    return new Response('not-found', { status: 404 })
  }),
)

vi.mock('openai', () => ({
  default: class OpenAI {
    constructor(args: Record<string, unknown>) {
      openAIState.constructorArgs.push(args)
    }
    models = {
      list: openAIState.modelList,
    }
    chat = {
      completions: {
        create: openAIState.create,
      },
    }
  },
}))

import { testLlmConnection } from '@/lib/user-api/llm-test-connection'

describe('official-only llm test connection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    openAIState.constructorArgs.length = 0
    vi.stubGlobal('fetch', fetchMock)
  })

  it('tests OpenAI only through the pinned official endpoint', async () => {
    const result = await testLlmConnection({
      provider: 'openai',
      apiKey: 'oa-key',
      model: 'gpt-4.1-mini',
    })

    expect(result.provider).toBe('openai')
    expect(result.message).toBe('openai 官方 API 连接成功')
    expect(result.answer).toBe('2')
    expect(openAIState.constructorArgs[0]).toMatchObject({
      apiKey: 'oa-key',
      baseURL: 'https://api.openai.com/v1',
    })
  })

  it('tests Google through Google official API', async () => {
    const result = await testLlmConnection({
      provider: 'google',
      apiKey: 'google-key',
    })

    expect(result).toMatchObject({
      provider: 'google',
      message: 'google 官方 API 连接成功',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://generativelanguage.googleapis.com/v1beta/models'),
      expect.any(Object),
    )
  })

  it('tests Bailian through the official DashScope endpoint', async () => {
    const result = await testLlmConnection({
      provider: 'bailian',
      apiKey: 'bl-key',
    })

    expect(result).toMatchObject({
      provider: 'bailian',
      message: 'bailian 官方 API 连接成功',
      model: 'qwen-plus',
    })
  })

  it('pins Ark and MiniMax to first-party hosts', async () => {
    await testLlmConnection({ provider: 'ark', apiKey: 'ark-key', model: 'doubao-seed-2-0-lite-260215' })
    await testLlmConnection({ provider: 'minimax', apiKey: 'minimax-key', model: 'MiniMax-M2.5' })

    expect(openAIState.constructorArgs).toEqual(expect.arrayContaining([
      expect.objectContaining({ baseURL: 'https://ark.cn-beijing.volces.com/api/v3' }),
      expect.objectContaining({ baseURL: 'https://api.minimaxi.com/v1' }),
    ]))
  })

  it('rejects relay, aggregator, and arbitrary compatible providers', async () => {
    for (const provider of [
      'openrouter',
      'siliconflow',
      'evolink',
      'fal',
      'openai-compatible',
      'gemini-compatible',
      'custom',
    ]) {
      await expect(testLlmConnection({ provider, apiKey: 'blocked-key' }))
        .rejects.toThrow(/OFFICIAL_PROVIDER_REQUIRED/)
    }
  })
})
