import { describe, expect, it } from 'vitest'
import { formatExternalId, parseExternalId } from '@/lib/async-poll'

describe('official-only async poll externalId contract', () => {
  it('parses and formats Ark video tasks', () => {
    const externalId = formatExternalId('ARK', 'VIDEO', 'task_789')
    expect(externalId).toBe('ARK:VIDEO:task_789')
    expect(parseExternalId(externalId)).toEqual({
      provider: 'ARK',
      type: 'VIDEO',
      requestId: 'task_789',
    })
  })

  it('parses Gemini batch tasks', () => {
    const externalId = formatExternalId('GEMINI', 'BATCH', 'batches/abc123')
    expect(parseExternalId(externalId)).toEqual({
      provider: 'GEMINI',
      type: 'BATCH',
      requestId: 'batches/abc123',
    })
  })

  it('parses Bailian image tasks', () => {
    const externalId = formatExternalId('BAILIAN', 'IMAGE', 'task_456')
    expect(parseExternalId(externalId)).toEqual({
      provider: 'BAILIAN',
      type: 'IMAGE',
      requestId: 'task_456',
    })
  })

  it('rejects intermediary and compatibility externalId providers', () => {
    for (const externalId of [
      'FAL:VIDEO:fal-ai/wan/v2.6/image-to-video:req_123',
      'EVOLINK:IMAGE:task_123',
      'OCOMPAT:VIDEO:provider:model:task_123',
      'SILICONFLOW:IMAGE:task_456',
      'OPENROUTER:VIDEO:task_789',
    ]) {
      expect(() => parseExternalId(externalId)).toThrow(/UNSUPPORTED_ASYNC_PROVIDER/)
    }
  })

  it('rejects invalid official provider task types', () => {
    expect(() => parseExternalId('GEMINI:VIDEO:task_123')).toThrow(/INVALID_GEMINI_EXTERNAL_ID/)
    expect(() => parseExternalId('GOOGLE:IMAGE:task_123')).toThrow(/INVALID_GOOGLE_EXTERNAL_ID/)
    expect(() => parseExternalId('ARK:BATCH:task_123')).toThrow(/INVALID_EXTERNAL_ID_TYPE/)
  })

  it('requires a non-empty request id', () => {
    expect(() => formatExternalId('ARK', 'VIDEO', '   ')).toThrow(/ASYNC_REQUEST_ID_REQUIRED/)
    expect(() => parseExternalId('ARK:VIDEO:')).toThrow(/UNSUPPORTED_ASYNC_PROVIDER/)
  })
})
