/**
 * 服务端获取 EvoLink API Key（去除强制鉴权后的统一入口）
 *
 * 优先级：
 * 1) 已登录用户的配置中心（personal key）
 * 2) 服务端环境变量 EVOLINK_API_KEY（平台共享 key）
 *
 * 登录不再是生成入口的强制条件：未登录用户走平台共享 key。
 */
import { getProviderConfig } from '@/lib/api-config'
import { getAuthSession } from '@/lib/api-auth'

const PLATFORM_API_KEY = process.env.EVOLINK_API_KEY || ''

export interface EvoLinkCredential {
  apiKey: string
  /** true = 来自登录用户自己的配置；false = 平台共享环境变量 */
  fromUserConfig: boolean
}

/**
 * 解析 EvoLink 凭证：用户配置优先，未登录或未配置时回退环境变量。
 * 两者都没有时 apiKey 为空串，由调用方返回 400。
 */
export async function resolveEvoLinkCredential(userId?: string | null): Promise<EvoLinkCredential> {
  if (userId) {
    try {
      const config = await getProviderConfig(userId, 'evolink')
      if (config.apiKey) {
        return { apiKey: config.apiKey, fromUserConfig: true }
      }
    } catch {
      // 用户未配置 evolink provider → 落到平台 key
    }
  }
  return { apiKey: PLATFORM_API_KEY, fromUserConfig: false }
}

/**
 * 工作流路由通用模式：可选登录 + 凭证解析。
 * 返回 session（可能为 null）与 apiKey；apiKey 为空时返回 400 响应。
 */
export async function requireOptionalAuthWithEvoLinkKey(): Promise<
  { session: AuthSessionLike | null; apiKey: string; fromUserConfig: boolean; error: null }
  | { session: null; apiKey: null; fromUserConfig: false; error: Response }
> {
  const session = await getAuthSession()
  const credential = await resolveEvoLinkCredential(session?.user?.id)

  if (!credential.apiKey) {
    return {
      session: null,
      apiKey: null,
      fromUserConfig: false,
      error: new Response(
        JSON.stringify({
          error: 'API_KEY_REQUIRED',
          message: 'EvoLink API key not configured (neither user config nor platform EVOLINK_API_KEY)',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    }
  }

  return { session, apiKey: credential.apiKey, fromUserConfig: credential.fromUserConfig, error: null }
}

type AuthSessionLike = { user: { id: string; name?: string | null; email?: string | null } }
