
import { logError as _ulogError, logInfo as _ulogInfo } from '@/lib/logging/core'
import { getProviderKey, resolveModelSelectionOrSingle } from '@/lib/api-config'
import { preprocessLipSyncParams, type LipSyncProviderKey } from '@/lib/lipsync/preprocess'
import { submitBailianLipSync } from '@/lib/lipsync/providers/bailian'
import { submitViduLipSync } from '@/lib/lipsync/providers/vidu'
import type { LipSyncParams, LipSyncResult, LipSyncSubmitContext } from '@/lib/lipsync/types'

function context(userId: string, selection: { provider: string; modelId: string; modelKey: string }): LipSyncSubmitContext {
  return { userId, providerId: selection.provider, modelId: selection.modelId, modelKey: selection.modelKey }
}

function resolveProviderKey(value: string): LipSyncProviderKey {
  const key = value.toLowerCase()
  if (key === 'vidu' || key === 'bailian') return key
  throw new Error(`LIPSYNC_PROVIDER_UNSUPPORTED: ${value}`)
}

export async function generateLipSync(params: LipSyncParams, userId: string, modelKey?: string): Promise<LipSyncResult> {
  _ulogInfo('[LipSync Async] 开始提交官方口型同步任务')
  try {
    const selection = await resolveModelSelectionOrSingle(userId, modelKey, 'lipsync')
    const providerKey = resolveProviderKey(getProviderKey(selection.provider))
    const { params: normalized } = await preprocessLipSyncParams(params, { providerKey })
    if (providerKey === 'vidu') return await submitViduLipSync(normalized, context(userId, selection))
    if (providerKey === 'bailian') return await submitBailianLipSync(normalized, context(userId, selection))
    throw new Error(`LIPSYNC_PROVIDER_UNSUPPORTED: ${selection.provider}`)
  } catch (error: unknown) {
    _ulogError('[LipSync Async] 错误:', error)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`口型同步任务提交失败: ${message}`)
  }
}

export type { LipSyncParams, LipSyncResult } from '@/lib/lipsync/types'
