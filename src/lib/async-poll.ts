
import { logError as _ulogError } from '@/lib/logging/core'
import { queryGeminiBatchStatus, queryGoogleVideoStatus, querySeedanceVideoStatus } from './async-task-utils'
import { getProviderConfig } from './api-config'

export interface PollResult {
  status: 'pending' | 'completed' | 'failed'
  resultUrl?: string
  imageUrl?: string
  videoUrl?: string
  downloadHeaders?: Record<string, string>
  error?: string
}

export type OfficialAsyncProvider = 'ARK' | 'GEMINI' | 'GOOGLE' | 'MINIMAX' | 'VIDU' | 'BAILIAN'
export type OfficialAsyncType = 'VIDEO' | 'IMAGE' | 'BATCH'

export function parseExternalId(externalId: string): {
  provider: OfficialAsyncProvider
  type: OfficialAsyncType
  requestId: string
} {
  const parts = externalId.split(':')
  const provider = parts[0] as OfficialAsyncProvider
  const type = parts[1] as OfficialAsyncType
  const requestId = parts.slice(2).join(':').trim()
  const allowedProvider = new Set<OfficialAsyncProvider>(['ARK', 'GEMINI', 'GOOGLE', 'MINIMAX', 'VIDU', 'BAILIAN'])
  if (!allowedProvider.has(provider) || !requestId) throw new Error(`UNSUPPORTED_ASYNC_PROVIDER: ${parts[0] || 'UNKNOWN'}`)
  if (provider === 'GEMINI' && type !== 'BATCH') throw new Error('INVALID_GEMINI_EXTERNAL_ID')
  if (provider === 'GOOGLE' && type !== 'VIDEO') throw new Error('INVALID_GOOGLE_EXTERNAL_ID')
  if (provider !== 'GEMINI' && type !== 'VIDEO' && type !== 'IMAGE') throw new Error(`INVALID_EXTERNAL_ID_TYPE: ${type}`)
  return { provider, type, requestId }
}

export async function pollAsyncTask(externalId: string, userId: string): Promise<PollResult> {
  if (!userId) throw new Error('缺少用户ID，无法获取 API Key')
  const parsed = parseExternalId(externalId)
  if (parsed.provider === 'ARK') return await pollArk(parsed.requestId, userId)
  if (parsed.provider === 'GEMINI') return await pollGemini(parsed.requestId, userId)
  if (parsed.provider === 'GOOGLE') return await pollGoogle(parsed.requestId, userId)
  if (parsed.provider === 'MINIMAX') return await pollMiniMax(parsed.requestId, userId)
  if (parsed.provider === 'VIDU') return await pollVidu(parsed.requestId, userId)
  return await pollBailian(parsed.requestId, userId, parsed.type)
}

async function pollArk(taskId: string, userId: string): Promise<PollResult> {
  const { apiKey } = await getProviderConfig(userId, 'ark')
  const result = await querySeedanceVideoStatus(taskId, apiKey)
  return { status: result.status, videoUrl: result.videoUrl, resultUrl: result.videoUrl, error: result.error }
}

async function pollGemini(batchName: string, userId: string): Promise<PollResult> {
  const { apiKey } = await getProviderConfig(userId, 'google')
  const result = await queryGeminiBatchStatus(batchName, apiKey)
  return { status: result.status, imageUrl: result.imageUrl, resultUrl: result.imageUrl, error: result.error }
}

async function pollGoogle(operationName: string, userId: string): Promise<PollResult> {
  const { apiKey } = await getProviderConfig(userId, 'google')
  const result = await queryGoogleVideoStatus(operationName, apiKey)
  return { status: result.status, videoUrl: result.videoUrl, resultUrl: result.videoUrl, error: result.error }
}

async function pollMiniMax(taskId: string, userId: string): Promise<PollResult> {
  const { apiKey } = await getProviderConfig(userId, 'minimax')
  try {
    const response = await fetch(`https://api.minimaxi.com/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!response.ok) return { status: 'failed', error: `MiniMax: 查询失败 ${response.status}` }
    const data = await response.json() as Record<string, any>
    if (data.base_resp?.status_code !== 0) return { status: 'failed', error: data.base_resp?.status_msg || 'MiniMax: 任务失败' }
    if (data.status === 'Failed') return { status: 'failed', error: data.error_message || 'MiniMax: 生成失败' }
    if (data.status !== 'Success') return { status: 'pending' }
    if (!data.file_id) return { status: 'failed', error: 'MiniMax: 任务完成但无 file_id' }
    const fileResponse = await fetch(`https://api.minimaxi.com/v1/files/retrieve?file_id=${encodeURIComponent(String(data.file_id))}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!fileResponse.ok) return { status: 'failed', error: `MiniMax: 文件检索失败 ${fileResponse.status}` }
    const fileData = await fileResponse.json() as Record<string, any>
    const videoUrl = typeof fileData.file?.download_url === 'string' ? fileData.file.download_url : ''
    return videoUrl ? { status: 'completed', videoUrl, resultUrl: videoUrl } : { status: 'failed', error: 'MiniMax: 未返回视频 URL' }
  } catch (error) {
    _ulogError('[MiniMax Query] 异常:', error)
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}

async function pollVidu(taskId: string, userId: string): Promise<PollResult> {
  const { apiKey } = await getProviderConfig(userId, 'vidu')
  try {
    const response = await fetch(`https://api.vidu.cn/ent/v2/tasks/${encodeURIComponent(taskId)}/creations`, {
      headers: { Authorization: `Token ${apiKey}` },
    })
    if (!response.ok) return { status: 'failed', error: `Vidu: 查询失败 ${response.status}` }
    const data = await response.json() as Record<string, any>
    if (data.state === 'failed') return { status: 'failed', error: `Vidu: ${data.err_code || 'Unknown'}` }
    if (data.state !== 'success') return { status: 'pending' }
    const videoUrl = Array.isArray(data.creations) && typeof data.creations[0]?.url === 'string' ? data.creations[0].url : ''
    return videoUrl ? { status: 'completed', videoUrl, resultUrl: videoUrl } : { status: 'failed', error: 'Vidu: 任务完成但无视频 URL' }
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}

async function pollBailian(requestId: string, userId: string, type: OfficialAsyncType): Promise<PollResult> {
  const { apiKey } = await getProviderConfig(userId, 'bailian')
  try {
    const response = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${encodeURIComponent(requestId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const data = await response.json().catch(() => ({})) as Record<string, any>
    if (!response.ok) return { status: 'failed', error: `Bailian: 查询失败 ${response.status}` }
    const status = String(data.output?.task_status || data.task_status || '').toUpperCase()
    if (status === 'FAILED' || status === 'CANCELED' || status === 'CANCELLED') {
      return { status: 'failed', error: data.output?.message || data.message || 'Bailian: 任务失败' }
    }
    if (status !== 'SUCCEEDED' && status !== 'SUCCESS') return { status: 'pending' }
    const first = Array.isArray(data.output?.results) ? data.output.results[0] : undefined
    const videoUrl = data.output?.video_url || first?.video_url
    const imageUrl = data.output?.image_url || first?.image_url || first?.url
    const resultUrl = type === 'VIDEO' ? videoUrl : (imageUrl || videoUrl)
    if (!resultUrl) return { status: 'failed', error: 'Bailian: 任务完成但未返回结果 URL' }
    return {
      status: 'completed',
      resultUrl,
      ...(type === 'VIDEO' ? { videoUrl: resultUrl } : { imageUrl: resultUrl }),
    }
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}

export function formatExternalId(provider: OfficialAsyncProvider, type: OfficialAsyncType, requestId: string): string {
  if (!requestId.trim()) throw new Error('ASYNC_REQUEST_ID_REQUIRED')
  return `${provider}:${type}:${requestId}`
}
