# YAOKE Drama Studio

YAOKE Drama Studio 是一个基于 Next.js 的 AI 短剧生产工作台，用于把小说、剧本或故事梗概拆解为角色、场景、分镜、图片、视频和配音素材。

> **模型调用安全边界：应用服务器只允许连接模型厂商第一方官方 API。**
> 项目不提供 EvoLink、FAL、OpenRouter、SiliconFlow、LiteLLM、OneAPI、NewAPI 或任意 OpenAI-compatible 中转入口，也不允许用户配置模型 API Base URL。

## 调用架构

```text
Browser
  -> YAOKE Next.js App Server
       -> OpenAI official API
       -> Google Gemini / Imagen / Veo official API
       -> Volcengine Ark official API
       -> Alibaba Cloud Bailian / DashScope official API
       -> MiniMax official API
       -> Vidu official API

App Server
  -> Redis / BullMQ workers      # 内部任务调度，不是模型中转
  -> MySQL / Prisma
  -> MinIO / S3-compatible storage
```

模型厂商 API Key 按用户保存在应用数据库中，并使用 `API_ENCRYPTION_KEY` 加密。请求由应用服务器直接发往代码中固定的厂商官方端点；数据库、前端和环境变量均不能覆盖模型 API hostname。

## 主要能力

- 小说 / 剧本分析与角色、场景、道具提取
- 角色参考图与场景图生成
- 分镜拆解与提示词优化
- 图片和视频生成任务编排
- 角色配音与音色绑定
- BullMQ 异步队列与任务状态管理
- MinIO / S3-compatible 媒体存储
- 中英文界面
- Remotion 成片工作流

## 官方模型提供商

当前配置界面只暴露项目已有第一方实现的厂商：

| Provider | 用途 | 路由约束 |
| --- | --- | --- |
| OpenAI | LLM | 固定 OpenAI 官方 API |
| Google | LLM / Image / Video | Google 官方 SDK / API |
| Volcengine Ark | LLM / Image / Video | 固定火山方舟官方 API |
| Alibaba Bailian | LLM / Image / Video / Audio | 固定 DashScope / 百炼官方 API |
| MiniMax | LLM / Video | 固定 MiniMax 官方 API |
| Vidu | Video / Lip Sync | 固定 Vidu 官方 API |

协议兼容不等于官方厂商。即使第三方服务实现 OpenAI-compatible API，也不会被 YAOKE 注册为可选 Provider。

## Quick Start

### Docker

```bash
git clone https://github.com/duyu06/manju.git
cd manju
cp .env.example .env

docker compose up -d
```

默认 Docker 端口以当前 `docker-compose.yml` 为准。启动后在 **Settings / API Configuration** 中填写你自己的模型厂商官方 API Key。

### Local Development

要求：Node.js 18.18+、npm 9+、MySQL 8、Redis 7；如使用对象存储，再准备 MinIO 或兼容 S3 的存储服务。

```bash
git clone https://github.com/duyu06/manju.git
cd manju
npm install
cp .env.example .env

npx prisma db push
npm run dev
```

`.env` 至少需要正确配置 `DATABASE_URL`、`NEXTAUTH_SECRET` 和 `API_ENCRYPTION_KEY`。模型厂商 API Key 不放在共享服务端中转变量中，而是在用户设置页配置。

## Tech Stack

| Category | Technology |
| --- | --- |
| Framework | Next.js 15 App Router + React 19 |
| Language | TypeScript strict mode |
| Database | MySQL 8 + Prisma |
| Queue | Redis 7 + BullMQ |
| Storage | MinIO / S3-compatible / local |
| Auth | NextAuth v4 JWT |
| i18n | next-intl |
| Styling | Tailwind CSS v4 |
| Video | Remotion |
| Testing | Vitest + architecture guards |

## 模型配置约束

模型使用 `provider::modelId` 作为唯一键。例如：

```text
google::gemini-3.1-pro-preview
ark::doubao-seed-2-0-pro-260215
bailian::qwen3.5-plus
```

配置层遵循以下规则：

1. Provider 必须命中服务端第一方白名单。
2. 前端不能新增任意 Provider，也没有 Base URL 输入框。
3. API 配置写接口拒绝 `baseUrl` 字段。
4. 历史数据库中遗留的 `baseUrl` 不会进入运行时 `ProviderConfig`。
5. 异步任务 ID 只接受已实现的官方 Provider 前缀，未知 Provider fail closed。
6. BullMQ 只负责应用内部排队；worker 最终仍由应用服务器代码直连厂商官方 API。

## Environment

参考 `.env.example`。核心变量：

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | MySQL connection string |
| `NEXTAUTH_URL` | Yes | 应用公开地址 |
| `NEXTAUTH_SECRET` | Yes | NextAuth JWT secret |
| `API_ENCRYPTION_KEY` | Yes | 用户 API Key 加密密钥；投入使用后不要随意更换 |
| `REDIS_HOST` / `REDIS_PORT` | Yes | BullMQ / Redis |
| `STORAGE_TYPE` | No | `minio` 或 `local` 等当前代码支持的存储实现 |
| `INTERNAL_APP_URL` | No | 仅用于应用服务器访问自己的内部 API / 文件，不是模型代理地址 |

## Validation

官方直连清理分支包含 `.github/workflows/official-api-cleanup.yml`，验证：

```bash
npm ci
npm run typecheck
npx prisma db push --skip-generate
npm run check:model-config-contract
```

CI 还会拒绝已知中转域名、第三方 Provider import、FAL/OpenRouter 直接依赖，以及重新引入可配置模型 Base URL 的改动。

## License

MIT。具体版权与许可文本见 [LICENSE](LICENSE)。
