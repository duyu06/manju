# DramaFlow Studio · AI 短剧智能生产平台

> AI 产品经理面试项目｜从一句创意到可交付视频的生成式 AI Workflow

DramaFlow Studio 是一个面向 **短剧 / 漫剧 / 宣传视频创作者** 的 AI 内容生产平台。项目希望解决生成式视频创作中最常见的三个问题：**工具链割裂、角色/场景一致性差、长耗时任务缺少可控工作流**。

项目将创作流程统一为：

```text
创意 / 小说 / 剧本
      ↓
AI 剧本分析
      ↓
角色与场景资产
      ↓
智能分镜
      ↓
图片生成
      ↓
视频生成
      ↓
配音 / 音乐
      ↓
合成与交付
```

当前仓库用于产品经理面试演示，重点展示 **产品流程设计、Human-in-the-loop、模型接入策略、异步任务管理、生成一致性和项目可观测性**，而不是单纯展示模型 API 调用。

---

## 1. 为什么做这个产品

传统 AI 视频生产通常需要在多个产品之间反复切换：

```text
LLM 写剧本 → 生图工具 → 视频模型 → TTS → 剪辑软件
```

这会带来：

- Prompt、角色设定和素材需要重复复制；
- 不同镜头之间人物、服装、场景容易漂移；
- 图片/视频生成耗时长，失败后缺少清晰的 Retry 机制；
- 创作者很难知道项目目前卡在哪个阶段；
- AI 自动生成与人工审核之间缺少明确的确认节点。

DramaFlow 的产品目标不是“再做一个 AI 生成按钮”，而是把 **AI 能力组织成可管理、可回退、可审核、可持续编辑的生产流程**。

---

## 2. 核心用户

| 用户 | 主要诉求 | 产品价值 |
|---|---|---|
| 独立创作者 | 少工具、低门槛完成短视频 | 一站式 Workflow |
| 短剧 / 漫剧团队 | 批量生成并保持素材一致 | 角色资产 + 分镜 + 任务管理 |
| 文旅 / 企业宣传 | 快速把文字方案变成视频 | 模板化流程 + 多模型生成 |
| AI 内容运营 | 控成本、控进度、快速返工 | 项目看板 + Human Review + Retry |

---

## 3. 产品设计

### 3.1 Human-in-the-loop

每个关键生成阶段都遵循：

```text
AI Generate → Human Review → Approve / Edit / Regenerate
```

AI 负责提高生产效率，人负责最终质量判断。这样可以避免“一次生成到底”导致错误持续向后传播。

### 3.2 角色与场景一致性

将角色、场景从 Prompt 中抽离成可复用资产：

```text
角色设定
  ↓
角色参考图 / 关键视觉
  ↓
分镜绑定角色
  ↓
Image-to-Video / Reference-to-Video
```

产品层面把“一致性”设计成资产管理和生成约束问题，而不是只依赖更长 Prompt。

### 3.3 AI Workflow

系统把长链路拆分为多个独立阶段，每一步都有自己的输入、输出和状态，可单独修改或重跑，而不是整条任务失败后从头开始。

### 3.4 模型 Provider 抽象

支持文本、图片、视频、语音等不同模型能力，并允许通过 Provider 配置切换模型来源。当前项目包含 GPT / Gemini / Claude / Doubao / Qwen，以及 FLUX / Kling / Seedance / Vidu / Veo 等模型接入能力。

### 3.5 异步任务

图片、视频、音频等长耗时任务进入 Redis + BullMQ 队列，由不同 Worker Pool 处理：

```text
Create Task
   ↓
Queue
   ↓
Worker
   ↓
Processing
   ├─ Success → Media Asset
   └─ Failed  → Error + Retry
```

前端不需要阻塞等待模型返回。

---

## 4. 面试 Demo：24 Hours Later

仓库内置面试 Demo 项目：**《24 Hours Later / 24 小时之后》**。

故事设定：

> 一名失业程序员获得一个能够预测未来 24 小时的 AI 助手，但每次预测都会随机夺走他的一段过去记忆。

Demo 用来展示一条完整 AI 短剧生产链：

1. 项目 Dashboard 查看交付状态；
2. 查看剧本、角色和场景资产；
3. 查看 Storyboard；
4. 修改单个镜头 Prompt；
5. 单镜头重新生成，而不是整集重做；
6. 查看 Image / Video 任务状态；
7. 配置不同模型 Provider；
8. 展示 AI Generate → Human Review → Regenerate 的质量闭环。

> Demo Dashboard 中的项目进度、成功率和预算等数据均用于产品演示；Mock 数据会明确标识，不作为真实商业运营指标。

---

## 5. 我在这个项目中的工作

这个仓库基于开源 AI 视频生产项目进行二次开发。我没有把开源基础能力包装成“全部从零开发”，面试重点是说明我如何在已有技术底座上完成产品化改造。

我负责 / 重点参与的部分包括：

- AI 视频产品需求拆解与完整生产 Workflow 设计；
- 面试 Demo 的业务场景和项目数据设计；
- Project Dashboard 与项目交付视图；
- Human-in-the-loop 生成 / 审核 / 重生成流程；
- Direct Provider 配置与模型接入体验；
- Workflow 表单、模型选择和状态反馈优化；
- 图片 → 视频、音乐 → 视频等多模态生成链路；
- Demo seed assets 与可演示数据；
- 中英文产品文案与界面体验调整；
- Docker 本地演示环境与问题排查。

详细产品案例：[`product/PRODUCT_CASE.md`](product/PRODUCT_CASE.md)

---

## 6. 产品经理视角的核心指标

当前仓库是 Demo / 原型验证项目，因此下面指标定义为 **后续真实试点需要采集的 North Star / Guardrail 指标**，不是伪造的线上数据。

| 指标 | 定义 | 为什么重要 |
|---|---|---|
| 首次成片完成率 | 创建项目后成功完成首条视频的用户占比 | 判断 Workflow 是否真正跑通 |
| 单镜头有效生成率 | 无需重生成即可被接受的镜头比例 | 衡量模型 + Prompt +资产约束质量 |
| 平均重生成次数 | 每个最终镜头平均生成次数 | 同时影响体验和成本 |
| 角色一致性通过率 | 人工 / 模型评估角色一致的镜头比例 | 短剧核心质量指标 |
| Time-to-First-Video | 从创建项目到得到第一个可播放镜头的时间 | 衡量首屏价值感知 |
| 单分钟生成成本 | 完成 1 分钟可交付内容所消耗模型成本 | 商业化基础指标 |
| Workflow 阶段流失率 | 用户在各生产阶段的退出比例 | 定位产品摩擦点 |

---

## 7. 技术实现

| Layer | Stack |
|---|---|
| Web | Next.js 15 + React 19 + TypeScript |
| Database | MySQL + Prisma |
| Queue | Redis + BullMQ |
| Storage | MinIO / S3-compatible |
| Auth | NextAuth |
| i18n | next-intl |
| Video | Remotion |
| AI Gateway | Multi-provider generators / LLM gateway |

```text
User
 ↓
Next.js Product UI
 ↓
Workflow / API Layer
 ↓
Task Lifecycle
 ↓
Redis + BullMQ
 ├─ Text Worker
 ├─ Image Worker
 ├─ Video Worker
 └─ Voice Worker
 ↓
Model Providers
 ↓
Media Storage / Project Assets
```

---

## 8. 本地启动

### Docker

```bash
git clone https://github.com/duyu06/manju.git
cd manju
cp .env.example .env
docker compose up -d
```

默认访问：

- Product UI: `http://localhost:23000`
- Queue Dashboard: `http://localhost:23010`

AI 生成功能需要配置对应 Provider API Key；不配置 API Key 时仍可使用仓库中的 Demo 数据展示主要产品流程。

---

## 9. 面试资料

- [`product/PRODUCT_CASE.md`](product/PRODUCT_CASE.md) — 产品案例 / PRD Lite
- [`product/INTERVIEW_DEMO.md`](product/INTERVIEW_DEMO.md) — 5–7 分钟现场演示脚本
- [`product/COMPETITOR_ANALYSIS.md`](product/COMPETITOR_ANALYSIS.md) — 洛神 AI 定向竞品分析

---

## 10. 开源来源与边界

本项目基于 **AIDrama Studio / EvoLinkAI AI Short Drama** 开源项目进行二次开发和产品化实践。

原始项目提供了较完整的 AI 视频生产技术底座；本仓库进一步围绕 **产品工作台、Workflow 使用体验、模型 Provider 配置、Demo 场景、Human-in-the-loop 和面试案例表达** 做了迭代。

面试中建议明确区分：

```text
Open-source foundation ≠ 我的原创成果
我的价值 = 需求判断 + 产品设计 + 二开方案 + 落地验证 + Demo 交付
```

这也是实际 AI 产品经理工作中常见的能力：不重复造轮子，而是选择合适能力并把它变成解决业务问题的产品。

## License

Apache License 2.0. See [`LICENSE`](LICENSE).
