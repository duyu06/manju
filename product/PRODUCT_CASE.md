# DramaFlow Studio 产品案例（PRD Lite）

> 用途：AI 产品经理面试项目说明  
> 项目形态：开源技术底座上的产品化二次开发 / Demo 验证  
> 核心场景：AI 短剧、漫剧、宣传视频生产

## 1. 产品一句话

DramaFlow Studio 把剧本、角色、场景、分镜、生图、视频、配音和合成组织成一条 **可审核、可重跑、可追踪的 AI 内容生产 Workflow**，降低创作者跨工具协作和返工成本。

## 2. 用户问题

### 2.1 不是“没有模型”，而是模型之间没有生产关系

单点 AI 工具已经很多，但用户真正完成一条短剧时仍要：

- 在多个工具之间迁移 Prompt 和素材；
- 手工维护人物设定和场景设定；
- 等待长耗时任务且不知道进度；
- 某一个镜头失败后重复生成大量内容；
- 最终还要人工整理素材进入剪辑环节。

因此产品问题被定义为：

> 如何把多个生成模型变成一条可靠的内容生产线，而不是一组互不相关的按钮？

## 3. 核心用户与 JTBD

### 独立创作者

**When** 我有一个故事或内容创意，  
**I want to** 在一个产品内完成从文字到视频的主要生产步骤，  
**So I can** 不学习多个复杂工具也能快速得到可用内容。

### 专业短剧 / 漫剧团队

**When** 我要批量生产多镜头、多集内容，  
**I want to** 固定角色与视觉资产并只重做失败镜头，  
**So I can** 控制一致性、成本和交付周期。

### 文旅 / 企业内容团队

**When** 我要持续生产宣传视频，  
**I want to** 使用品牌、景区或文化资料作为稳定内容输入，  
**So I can** 低成本持续输出符合业务设定的内容。

## 4. MVP 范围

### P0：主链必须跑通

```text
创建项目
→ 输入故事 / 剧本
→ AI 分析
→ 角色 / 场景
→ Storyboard
→ Image
→ Video
→ 查看结果
```

验收：用户无需离开产品即可完成一次主要生成链路。

### P1：让 Workflow 可用

- 单镜头编辑 Prompt；
- 单镜头 Regenerate；
- 任务 Processing / Success / Failed；
- Project Dashboard；
- 模型 Provider 配置；
- Demo seed assets；
- 中英文界面。

### P2：让生成质量可控

- 角色 reference asset；
- 场景 reference asset；
- 关键帧策略；
- 多候选生成；
- Human Review；
- 一致性评估。

## 5. 核心 Workflow

```text
┌──────────────┐
│ Idea / Novel │
└──────┬───────┘
       ↓
┌──────────────┐
│ Script       │  AI 生成 / 导入 / 人工编辑
└──────┬───────┘
       ↓
┌────────────────────┐
│ Character / Scene  │  可复用资产
└──────┬─────────────┘
       ↓
┌──────────────┐
│ Storyboard   │  镜头、构图、动作、台词
└──────┬───────┘
       ↓
┌──────────────┐
│ Image        │  Reference + Prompt
└──────┬───────┘
       ↓
       Review ─── Regenerate
       ↓ Approve
┌──────────────┐
│ Video        │  Image-to-Video / Reference-to-Video
└──────┬───────┘
       ↓
       Review ─── Regenerate
       ↓ Approve
┌──────────────┐
│ Voice / BGM  │
└──────┬───────┘
       ↓
┌──────────────┐
│ Delivery     │
└──────────────┘
```

## 6. 为什么一定需要 Human-in-the-loop

生成式 AI 的错误具有传播性。

例如角色图出现服装错误，如果没有审核节点，错误会继续进入分镜图、视频和最终合成，导致后期返工成本指数增加。

因此关键阶段采用：

```text
Generate → Review → Approve / Edit / Regenerate
```

产品目标不是减少所有人工，而是把人工判断放在 **最值得介入的位置**。

## 7. 一致性设计

一致性不是单纯 Prompt Engineering 问题，而是产品中的资产约束问题。

### 角色层

- Character Profile；
- Reference Images；
- 服装 / 年龄 / 发型 / 面部特征；
- 镜头绑定角色资产。

### 场景层

- Scene Profile；
- 主视觉参考；
- 时间 / 光线 / 空间描述；
- 分镜绑定场景。

### 镜头层

- Prompt；
- Camera / Shot Type；
- Character refs；
- Scene refs；
- Previous / Next key frame。

后续可增加自动一致性评分，将“肉眼判断”逐步转为可计算的质量指标。

## 8. 模型策略

产品不应该绑定单一模型。

### 能力分层

| 能力 | 关注参数 |
|---|---|
| LLM | 剧情理解、结构化输出、稳定 JSON |
| Image | 角色一致性、参考图能力、审美、成本 |
| Video | 动作遵循、首尾帧、时长、稳定性、成本 |
| TTS | 音色、情绪、角色区分、中文表现 |

### Provider 抽象的价值

- 避免单一供应商锁定；
- 按场景选择更合适模型；
- 支持成本 / 质量分层；
- 模型故障时可 fallback；
- 为后续 AB Test 留接口。

## 9. 异步任务与失败设计

视频生成可能持续数分钟，因此不能把它设计成普通同步请求。

### Task State

```text
PENDING
  ↓
PROCESSING
  ├─ SUCCESS
  └─ FAILED → RETRY
```

产品界面至少应该告诉用户：

- 当前阶段；
- 当前状态；
- 是否可以重试；
- 失败原因是否需要用户修改输入；
- 成功资产保存在哪里。

### Retry 原则

优先局部重试：

```text
1 个 Shot 失败 → 只重新生成 Shot
```

而不是：

```text
1 个 Shot 失败 → 整集重新生成
```

这同时减少等待时间和模型成本。

## 10. Demo Project：24 Hours Later

### Logline

一名失业程序员获得一个能够预测未来 24 小时的 AI 助手，但每次预测都会随机夺走他的一段过去记忆。

### 为什么选这个故事

- 人物数量可控，适合展示角色一致性；
- 都市现实 + AI 元素，和产品主题一致；
- 有多个明显场景，可展示 Scene Asset；
- 有情绪和动作变化，可测试视频生成；
- 可以自然拆成 20+ Storyboard shots。

## 11. 指标体系

### North Star Candidate

**每周成功完成并导出的有效视频分钟数**

原因：它同时要求用户真正启动 Workflow、跨过生成障碍，并最终得到可用结果。

### Funnel

```text
Create Project
→ Script Ready
→ Storyboard Ready
→ First Image Generated
→ First Video Generated
→ Episode Completed
→ Export
```

### Quality Metrics

- 单镜头有效生成率；
- 平均 Regenerate 次数；
- 角色一致性通过率；
- Prompt adherence；
- 视频生成失败率。

### Efficiency Metrics

- Time-to-First-Image；
- Time-to-First-Video；
- Episode completion time；
- 单分钟模型成本。

> 当前项目为 Demo，以上是指标定义，不虚构真实线上运营数据。

## 12. 产品风险

| 风险 | 影响 | 方案 |
|---|---|---|
| 角色漂移 | 成片不可用 | Reference assets + key frames + review |
| 视频生成失败 | 用户等待后无结果 | Queue + Retry + provider fallback |
| 成本不可控 | 商业化困难 | 用量记录 + 分模型成本 + 局部重生成 |
| Workflow 太复杂 | 新用户流失 | Beginner / Pro 双模式 |
| 模型更迭快 | 产品能力过期 | Provider abstraction |
| Prompt 黑盒 | 用户无法修改结果 | 暴露可编辑镜头描述与 Prompt |

## 13. 下一阶段 Roadmap

### P2.1 — Beginner / Pro Mode

Beginner：只保留关键选择，系统自动路由模型。  
Pro：开放 Provider、Prompt、Reference、生成参数。

### P2.2 — Consistency Score

对角色脸部、服装、场景等做自动一致性检查，低于阈值提示重新生成。

### P2.3 — Knowledge-grounded Creation

允许导入品牌、景区、企业资料，先检索再生成剧本，降低事实错误并保证品牌表达。

### P2.4 — Cost Router

根据“极速 / 均衡 / 精品”自动路由不同模型和生成参数。

## 14. 我的贡献边界

该项目使用成熟开源项目作为技术底座。

我的工作重点是：

```text
发现问题
→ 设计产品流程
→ 定义 MVP
→ 设计 Demo
→ 调整交互 / 状态 / Provider
→ 推动代码落地
→ 构造验收场景
→ 实际运行与演示
```

面试时不把开源已有能力表述为个人从零研发成果。

对于 AI 产品经理，我认为核心能力不是“自己重写所有基础设施”，而是能判断 **什么能力值得复用、什么部分必须重构、怎样把模型变成稳定的用户价值**。
