# DramaFlow Studio｜洛神 AI 产品经理面试 Demo Checklist

> 目标：把《24小时之后》固定为一个 5–7 分钟、可离线展示大部分流程、不会依赖现场完整视频生成的产品经理演示项目。

## 1. 一键准备（Windows）

如果是全新 clone，先安装依赖：

```bash
npm ci
```

PowerShell 在仓库根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\prepare-interview-demo.ps1
```

需要准备完直接启动应用：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\prepare-interview-demo.ps1 -StartApp
```

Demo 账号：

```text
用户名：demo
密码：demo123456
```

单独运行静态预检：

```bash
node scripts/interview-demo-preflight.mjs
```

单独重置 / 重建 Demo 数据时，需要连续执行 Seed 与失败案例规范化：

```bash
npx tsx --env-file=.env scripts/seed-demo-project.ts --apply --create-user
npx tsx --env-file=.env scripts/normalize-interview-demo.ts
```

## 2. 固定 Demo 数据口径

《24小时之后》第 1 集固定为 24 个镜头：

- 24 / 24 已有 Storyboard；
- 20 个镜头已有本地图片结果（SVG 演示资产，可离线打开）；
- 2 个镜头处于 processing；
- 2 个镜头处于 failed；
- 第 12 镜为重点失败案例：`CHARACTER_CONSISTENCY_LOW`，连续尝试 3 次，用于讲一致性和局部 Retry；
- 第 16 镜为 `PROVIDER_TIMEOUT`，用于讲第三方模型服务稳定性；
- 当前 Seed 不伪造已完成视频，视频生成阶段显示为 0；
- Dashboard 数据必须始终标注 Demo / Mock。

面试中不要把 SVG 占位资产称为“真实模型生成结果”。它们用于保证 Workflow、状态机和交互在断网情况下仍然可演示。若本地另有真实生成图片 / 视频，可额外展示，但不要混淆数据来源。

## 3. 5–7 分钟固定演示路径

### 0:00–0:40 首页 / Dashboard

一句话定位：

> DramaFlow Studio 不是再封装一个视频模型，而是把剧本、角色、场景、分镜、生图、视频和配音组织成一套可审核、可重跑、可追踪的 AI 内容生产 Workflow。

重点展示：项目阶段、Pipeline、Blocker、Human-in-the-loop。

### 0:40–1:40 角色 / 场景资产

重点说明：

- 角色与场景不是每个 Prompt 临时重复描述；
- 抽成可复用资产后，Storyboard 和生成任务绑定资产；
- 产品目标是给一致性提供稳定输入，而不是只靠 Prompt 运气。

### 1:40–3:00 Storyboard

选择一个正常镜头，展示：

- Shot 描述；
- 景别；
- 运镜；
- Prompt；
- 图片结果；
- 当前状态。

现场可以把 `medium shot` 修改成 `close-up`，然后解释：

> Shot 是最小生产单元。导演对一个镜头不满意时，只应该修改 / 重做这一镜，而不是重新生成整部作品。

### 3:00–4:10 第 12 镜失败案例

打开第 12 镜，展示 failed / attempt=3，并讲：

> 生成式 AI 产品不能只设计 Happy Path。图片和视频都可能失败，因此 Retry 必须发生在最小生产单元。第 12 镜因为人物一致性未通过而失败，只重跑第 12 镜，前 11 镜不重复消耗成本。

如果页面支持 Retry，现场点一次即可；若第三方 Provider 不稳定，只展示状态变化 / 已有任务，不等待完整生成。

### 4:10–5:00 Provider 配置

说明模型为什么不能写死：质量、速度、成本、稳定性不同。产品层通过 Provider / Capability 抽象，为后续 fallback、cost router 和场景化模型选择留空间。

### 5:00–6:00 Dashboard 指标收尾

当前 Seed 可直接验证：

- Storyboard Completion = 100%；
- Current Image Completion = 20 / 24 = 83.3%；
- Processing = 2 / 24 = 8.3%；
- Failed / Retry = 2 / 24 = 8.3%。

真实上线后重点采集：

- 有效镜头生成率；
- 平均 Regenerate 次数；
- 角色一致性通过率；
- Time-to-First-Video；
- 单有效镜头 / 单分钟成本；
- 最终有效视频导出量。

## 4. 面试前验收标准

必须全部满足：

- [ ] 首页品牌显示 DramaFlow Studio；
- [ ] 《24小时之后》可以正常进入；
- [ ] Dashboard 明确显示 Demo / Mock；
- [ ] 24 个 Storyboard 镜头存在；
- [ ] 20 个镜头有图片结果；
- [ ] 2 个 processing 状态存在；
- [ ] 2 个 failed 状态存在；
- [ ] 第 12 镜能明确看到 `CHARACTER_CONSISTENCY_LOW` / 三次尝试语义；
- [ ] 第 16 镜能表达 Provider Timeout；
- [ ] 任一正常镜头可以查看并编辑 Prompt；
- [ ] Dashboard 数据和 Seed 状态完全一致；
- [ ] Provider 配置页面可以打开；
- [ ] 断网时仍可完成 Dashboard、资产、Storyboard、状态机的大部分演示；
- [ ] 不把 Mock KPI、SVG 占位图或未生成视频表述为真实线上数据；
- [ ] 明确说明技术底座来自成熟开源项目，自己的贡献是产品化设计与二次开发。

## 5. 现场故障预案

### Provider / API 不稳定

不要现场等待完整视频生成。展示已有任务、Prompt 编辑、FAILED → Retry 产品逻辑即可。

### 网络断开

优先演示本地 Dashboard、24 镜 Storyboard、本地 SVG 图片结果和产品文档。

### Docker / 数据库异常

面试前运行：

```bash
node scripts/interview-demo-preflight.mjs
```

如果只是 DB 数据丢失，重新执行：

```bash
npx tsx --env-file=.env scripts/seed-demo-project.ts --apply --create-user
npx tsx --env-file=.env scripts/normalize-interview-demo.ts
```

### 面试官问“这些结果都是真实 AI 生成的吗？”

回答原则：

> Workflow、数据模型、任务状态和二次开发是真实项目实现；仓库内为了保证面试稳定性预置了一部分明确标记为 Demo / Mock 的本地媒体资产。我不会把 Mock 数据包装成线上真实指标。真实模型链路可以根据 Provider 配置运行，但现场演示不依赖第三方 API 稳定性。

这比冒险声称所有素材都是真实线上结果更可靠，也更符合产品经理对数据口径和交付风险的基本要求。
