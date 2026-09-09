/**
 * [DEMO / MOCK] 演示项目种子脚本：《24小时之后》
 *
 * 为项目经理面试 Demo 预置一个结构完整的项目（纯演示数据，不代表真实统计）：
 * - Project + StudioProject
 * - 3 个角色（林默 / 顾晚 / AURA）
 * - 5 个场景（出租屋 / 地铁 / 咖啡馆 / 医院 / 天台）
 * - 第 1 集：片段（StudioClip）+ 分镜板（StudioStoryboard）+ 24 个镜头（StudioPanel）
 * - 20 镜已生成（本地占位图 /demo/shots/panel-XX.svg）
 * - 2 镜处理中（processing 任务，无图）
 * - 2 镜失败（failed 任务，含第 12 镜 attempt=3，对齐驾驶舱风险 R-03）
 *
 * 数据源两种模式：
 * 1) --from-pipeline=path/to/short_drama_result.json
 *    从 DramaFlow Pipeline（ai-short-drama-pipeline 二开）的 JSON 输出导入创意数据
 *    （角色/场景/分镜/Prompt），本脚本只叠加「生产状态层」（失败/处理中/占位图）。
 *    引擎 → 平台一条数据流，面试演示时可讲「分镜方案进生产队列」。
 * 2) 默认（不带参数）：使用脚本内置的演示数据（内容与 demo_data_24h 同源）。
 *
 * 不调用任何模型 / Worker / 队列；不改 Worker、Provider、Redis、MinIO 逻辑，
 * 仅引用现有 Prisma Schema 写入演示数据。
 *
 * 用法：
 *   npx tsx --env-file=.env scripts/seed-demo-project.ts                          # 预览（不写库）
 *   npx tsx --env-file=.env scripts/seed-demo-project.ts --apply                  # 写入（幂等：同名项目先删后建）
 *   npx tsx --env-file=.env scripts/seed-demo-project.ts --apply --create-user    # 用户不存在时自动创建
 *   npx tsx --env-file=.env scripts/seed-demo-project.ts --apply \
 *       --from-pipeline=../ai-short-drama-pipeline/output/short_drama_result.json
 *   可选：--user=<用户名>（默认 demo）、--password=<密码>（默认 demo123456）
 */
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'

type Args = {
  apply: boolean
  user: string
  password: string
  createUser: boolean
  fromPipeline?: string
}

function parseArgs(): Args {
  return {
    apply: process.argv.includes('--apply'),
    user: process.argv.find((a) => a.startsWith('--user='))?.slice('--user='.length) || 'demo',
    password: process.argv.find((a) => a.startsWith('--password='))?.slice('--password='.length) || 'demo123456',
    createUser: process.argv.includes('--create-user'),
    fromPipeline: process.argv.find((a) => a.startsWith('--from-pipeline='))?.slice('--from-pipeline='.length),
  }
}

function writeJson(payload: unknown) {
  process.stdout.write(`${JSON.stringify({ demo: true, ...payload }, null, 2)}\n`)
}

function writeError(msg: string) {
  process.stderr.write(`${msg}\n`)
}

/**
 * 镜头生成状态（演示数据）：
 * - done:       有 imageUrl（本地占位图 /demo/shots/panel-XX.svg）
 * - processing: 无图 + processing 任务
 * - failed:     无图 + failed 任务
 * 视频均未生成（与项目状态「视频生成中」自洽）。
 */
type ShotState = 'done' | 'processing' | 'failed'

/** 全部 24 镜的演示数据：文案、景别、机位、Prompt、生成状态 */
const SHOTS: Array<{
  clip: number
  shotType: string
  cameraMove: string
  description: string
  imagePrompt: string
  state: ShotState
  failMessage?: string
  failAttempts?: number
}> = [
  // ── 片段 1：林默失业回家，深夜激活 AURA（镜 1-6，全部已生成）──
  {
    clip: 1, shotType: '远景', cameraMove: '固定机位',
    description: '深夜城市天际线，老旧居民楼只有一扇窗亮着灯',
    imagePrompt: '深夜城市天际线全景，老旧居民楼剪影，仅一扇窗透出暖黄灯光，冷蓝色调，电影感构图，美漫风格',
    state: 'done',
  },
  {
    clip: 1, shotType: '中景', cameraMove: '跟拍',
    description: '林默抱着装满个人物品的纸箱走进昏暗出租屋',
    imagePrompt: '26岁男性程序员，深灰连帽衫，黑框眼镜，抱着纸箱推开出租屋门，走廊昏暗，镜头跟随背影，美漫风格',
    state: 'done',
  },
  {
    clip: 1, shotType: '特写', cameraMove: '固定机位',
    description: '林默瘫坐在椅子上，屏幕冷光映在疲惫的脸上',
    imagePrompt: '年轻男性面部特写，黑框眼镜反射电脑屏幕冷蓝光，神情疲惫，深夜室内，美漫风格',
    state: 'done',
  },
  {
    clip: 1, shotType: '特写', cameraMove: '缓推',
    description: '旧笔记本电脑屏幕突然自行亮起，浮现代码流',
    imagePrompt: '旧笔记本电脑屏幕特写，屏幕自行亮起，蓝色代码流刷屏，黑暗房间，屏幕光为主光源，美漫风格',
    state: 'done',
  },
  {
    clip: 1, shotType: '近景', cameraMove: '固定机位',
    description: '林默警觉回头盯住屏幕，屏幕上出现「你好，林默。」',
    imagePrompt: '年轻男性回头警觉注视屏幕，屏幕显示白色文字「你好，林默。」，紧张氛围，室内深夜，美漫风格',
    state: 'done',
  },
  {
    clip: 1, shotType: '特写', cameraMove: '慢推',
    description: '林默瞳孔倒映着屏幕蓝光，神情从疲惫转为震动',
    imagePrompt: '眼部大特写，瞳孔倒映屏幕蓝色光标闪烁，神情从疲惫转为震惊，戏剧化光影，美漫风格',
    state: 'done',
  },
  // ── 片段 2：测试预测能力，第一次失去记忆（镜 7-12，镜 12 失败 attempt=3）──
  {
    clip: 2, shotType: '近景', cameraMove: '过肩',
    description: '林默对着屏幕打字发出预测指令',
    imagePrompt: '过肩镜头，男性背影面对笔记本电脑打字，屏幕显示对话界面，深夜室内，蓝调，美漫风格',
    state: 'done',
  },
  {
    clip: 2, shotType: '特写', cameraMove: '固定机位',
    description: '屏幕上 AURA 输出预测结果',
    imagePrompt: '电脑屏幕特写，AI 助手输出预测结果文本，荧光蓝 UI，代码流背景，近未来感，美漫风格',
    state: 'done',
  },
  {
    clip: 2, shotType: '中景', cameraMove: '手持跟拍',
    description: '咖啡馆门口，林默抬头看见顾晚正好走进来',
    imagePrompt: '咖啡馆门口中景，男性手握预测纸条抬头，年轻女性推门进入，午后暖光，美漫风格',
    state: 'done',
  },
  {
    clip: 2, shotType: '近景', cameraMove: '正反打',
    description: '顾晚落座开始采访提问，录音笔放在桌上',
    imagePrompt: '咖啡馆卡座近景，年轻女性记者坐姿利落，桌上银色录音笔，采访姿态，午后光线，美漫风格',
    state: 'done',
  },
  {
    clip: 2, shotType: '特写', cameraMove: '慢推',
    description: '深夜翻旧相册，手指停在宠物照片上，毫无印象',
    imagePrompt: '手部特写翻旧相册，手指按在一张宠物狗照片上，神情茫然，台灯光晕，美漫风格',
    state: 'done',
  },
  {
    clip: 2, shotType: '特写', cameraMove: '急推',
    description: '林默猛抬头，AURA 显示「记忆是代价」',
    imagePrompt: '年轻男性猛抬头特写，背景屏幕显示「记忆是代价」，红色警告氛围，戏剧化打光，美漫风格',
    state: 'failed',
    failAttempts: 3,
    failMessage: 'Image generation failed after 3 attempts: content moderation rejected (shot 12)',
  },
  // ── 片段 3：咖啡馆交锋（镜 13-18，镜 16 失败，镜 17-18 处理中）──
  {
    clip: 3, shotType: '中景', cameraMove: '环绕',
    description: '林默与顾晚咖啡馆对坐，两杯咖啡',
    imagePrompt: '咖啡馆靠窗卡座中景，男女对坐，两杯咖啡，窗外街景虚化，午后光，美漫风格',
    state: 'done',
  },
  {
    clip: 3, shotType: '特写', cameraMove: '固定机位',
    description: '林默说出预测，顾晚搅咖啡的手停住',
    imagePrompt: '女性手部特写，搅拌勺停在小杯中，背景男性模糊说话，紧张氛围，美漫风格',
    state: 'done',
  },
  {
    clip: 3, shotType: '近景', cameraMove: '正反打',
    description: '顾晚追问消息来源，眼神开始审视',
    imagePrompt: '年轻女性近景，眼神审视追问，利落高马尾，咖啡馆背景虚化，美漫风格',
    state: 'done',
  },
  {
    clip: 3, shotType: '俯拍', cameraMove: '俯拍',
    description: '顾晚笔记本写下「他说中了三次」和一个问号',
    imagePrompt: '桌面俯拍，笔记本上手写「他说中了三次」和问号，旁边咖啡杯和录音笔，美漫风格',
    state: 'failed',
    failAttempts: 2,
    failMessage: 'Image generation failed after 2 attempts: provider timeout (shot 16)',
  },
  {
    clip: 3, shotType: '中景', cameraMove: '长镜头',
    description: '两人走出咖啡馆，林默欲言又止，顾晚快步离开',
    imagePrompt: '咖啡馆门口中景，男性欲言又止，女性快步离开背影，傍晚冷色，美漫风格',
    state: 'processing',
  },
  {
    clip: 3, shotType: '远景', cameraMove: '升镜头',
    description: '十字路口人流，两人朝相反方向汇入人群',
    imagePrompt: '十字路口俯瞰远景，人流穿梭，两人朝相反方向走远，暮色，美漫风格',
    state: 'processing',
  },
  // ── 片段 4：地铁异常 + AURA 警告 + 悬念收尾（镜 19-24，全部已生成）──
  {
    clip: 4, shotType: '中景', cameraMove: '手持',
    description: '晚高峰地铁车厢，林默闭眼默念指令，额头渗汗',
    imagePrompt: '地铁车厢中景，男性闭眼默念，额头渗汗，车厢灯光，乘客虚化背景，美漫风格',
    state: 'done',
  },
  {
    clip: 4, shotType: '特写', cameraMove: '快速闪切',
    description: '林默眼前闪回碎片画面：出租屋、天台、医院走廊',
    imagePrompt: '碎片化闪回蒙太奇特写，出租屋/天台/医院走廊画面撕裂重叠，红蓝对比色，美漫风格',
    state: 'done',
  },
  {
    clip: 4, shotType: '近景', cameraMove: '晃动跟拍',
    description: '林默扶扶手剧烈头痛，车厢灯光忽明忽暗',
    imagePrompt: '地铁车厢近景，男性扶扶手痛苦表情，灯光忽明忽暗，动感模糊，美漫风格',
    state: 'done',
  },
  {
    clip: 4, shotType: '中景', cameraMove: '固定机位',
    description: '顾晚目睹异常，缓缓放下手机',
    imagePrompt: '地铁车厢中景，年轻女性目光凝视前方，缓缓放下手机，警觉表情，美漫风格',
    state: 'done',
  },
  {
    clip: 4, shotType: '特写', cameraMove: '缓拉',
    description: '林默手机屏幕 AURA 警告「记忆透支已达临界」',
    imagePrompt: '手机屏幕特写，AI 助手界面显示红色警告文字「记忆透支已达临界」，车厢背景虚化，美漫风格',
    state: 'done',
  },
  {
    clip: 4, shotType: '远景', cameraMove: '升格',
    description: '地铁驶入隧道，灯光扫过两人对视剪影，画面转黑',
    imagePrompt: '地铁列车驶入隧道远景，灯光扫过车窗剪影，明暗对比强烈，悬念收尾，美漫风格',
    state: 'done',
  },
]

const CLIP_META: Record<number, { summary: string; location: string; content: string; characters: string[] }> = {
  1: {
    summary: '林默失业回家，深夜偶然激活 AURA',
    location: '出租屋',
    content: '深夜出租屋，林默拖着纸箱回到住处。他打开旧笔记本电脑，屏幕突然亮起，AURA 的声音第一次响起：「你好，林默。」',
    characters: ['林默', 'AURA'],
  },
  2: {
    summary: '林默测试 AURA 预测能力，第一次失去记忆',
    location: '咖啡馆',
    content: '林默半信半疑让 AURA 预测明天。AURA 给出预测，第二天全部应验。当晚林默发现自己想不起童年的第一只宠物——记忆消失了。',
    characters: ['林默', 'AURA', '顾晚'],
  },
  3: {
    summary: '林默用预测接近顾晚，顾晚开始起疑',
    location: '咖啡馆',
    content: '林默借采访之名再次约见顾晚，几次「恰好」说出她未公开的行程。顾晚表面平静，暗中把异常记进笔记本。',
    characters: ['林默', '顾晚'],
  },
  4: {
    summary: '地铁预测失控，AURA 警告，悬念收尾',
    location: '地铁',
    content: '林默在地铁上再次动用预测，剧烈头痛，周围画面短暂崩坏。顾晚恰好目睹。AURA 警告：「记忆透支已达临界。」',
    characters: ['林默', '顾晚', 'AURA'],
  },
}

const CHARACTERS = [
  {
    name: '林默',
    aliases: [] as string[],
    profile: {
      role_level: '主角',
      archetype: '理性天才',
      personality_tags: ['内向', '理性', '执拗'],
      era_period: '现代都市',
      social_class: '普通职员',
      occupation: '失业程序员',
      costume_tier: '日常休闲',
      suggested_colors: ['深灰', '藏蓝'],
      primary_identifier: '总是穿一件洗旧的深灰连帽衫',
      visual_keywords: ['黑框眼镜', '眼下发青', '瘦削', '连帽衫'],
      gender: '男',
      age_range: '26岁',
    },
    introduction: '26 岁失业程序员。内向、理性，把 AURA 当作唯一能证明自己的东西，哪怕代价是记忆。',
  },
  {
    name: '顾晚',
    aliases: [] as string[],
    profile: {
      role_level: '女主角',
      archetype: '行动派调查者',
      personality_tags: ['行动力强', '敏锐', '执着'],
      era_period: '现代都市',
      social_class: '职场白领',
      occupation: '记者',
      costume_tier: '通勤职业',
      suggested_colors: ['白色', '卡其'],
      primary_identifier: '随身携带一支银色录音笔',
      visual_keywords: ['高马尾', '利落风衣', '录音笔'],
      gender: '女',
      age_range: '25岁',
    },
    introduction: '25 岁调查记者。行动力强，对「巧合」零容忍。她在追一个都市传说，却撞上了林默的秘密。',
  },
  {
    name: 'AURA',
    aliases: ['小A'],
    profile: {
      role_level: '核心配角',
      archetype: '非人智能',
      personality_tags: ['冷静', '中性', '不可预测'],
      era_period: '近未来',
      social_class: '无',
      occupation: 'AI 预测助手',
      costume_tier: '无',
      suggested_colors: ['荧光蓝', '屏幕黑'],
      primary_identifier: '只以屏幕文字与合成音存在，无实体',
      visual_keywords: ['文字流UI', '蓝色光标', '合成音'],
      gender: '无',
      age_range: '无',
    },
    introduction: '来历不明的预测 AI。冷静、中性、语调毫无波澜。每次预测都在取走林默的一段过去。',
  },
]

const LOCATIONS = [
  { name: '出租屋', summary: '林默的住所。堆满纸箱与旧设备，旧笔记本电脑是 AURA 的宿主。' },
  { name: '地铁', summary: '林默每天通勤的线路。预测能力副作用首次失控的公共空间。' },
  { name: '咖啡馆', summary: '林默与顾晚交锋的核心场景，靠窗卡座，午后光线。' },
  { name: '医院', summary: '记忆检查相关的场景，冷白色调，走廊纵深。' },
  { name: '天台', summary: '居民楼天台。林默独处与做决定的地方，俯瞰城市夜景。' },
]

const EPISODE_SYNOPSIS =
  '第一集：林默失业当夜激活预测 AI「AURA」，预测全部应验却开始失去记忆；记者顾晚察觉他的「巧合」，地铁上 AURA 发出警告——记忆透支已达临界。'

// ============================================================
// DramaFlow Pipeline JSON 导入（--from-pipeline）
// 引擎输出的创意数据（角色/场景/分镜/Prompt）映射为平台 Schema，
// 生产状态（失败/处理中/占位图）仍由本脚本叠加。
// ============================================================

interface PipelineShot {
  shot_id: string
  scene_id: string
  shot_type: string
  camera_angle: string
  camera_setup: string
  visual_description: string
  character_actions: Record<string, string>
  dialogue: string
  duration_seconds: number
  camera_movement: string
  transition: string
  mood: string
}

interface PipelineJson {
  characters: { characters: Array<{ id: string; name: string; type: string; gender: string; age_group: string; personality: string[]; appearance: string[]; first_line: string; relationships: Array<{ to: string; relation: string }> }> }
  scenes: { scenes: Array<{ id: string; name: string; location_type: string; time_of_day: string; description: string; lighting: string; atmosphere: string; color_tone: string; characters_present: string[]; key_props: string[] }> }
  storyboard: { project: { title: string; genre: string; estimated_duration: string }; storyboard: PipelineShot[] }
  image_prompts: { prompts: Array<{ shot_id: string; prompt_cn: string; prompt_en: string; negative_prompt: string; style_tags: string[]; aspect_ratio: string }> }
  video_prompts: { video_prompts: Array<{ shot_id: string; prompt: string; motion_description: string; camera_motion: string; duration_seconds: number }> }
}

/** 生产状态层（演示口径，与驾驶舱 Mock 对齐）：失败 12/16，处理中 17/18，其余已生成 */
const SHOT_STATE_OVERRIDES: Record<number, { state: 'processing' | 'failed'; failMessage?: string; failAttempts?: number }> = {
  12: { state: 'failed', failAttempts: 3, failMessage: 'Image generation failed after 3 attempts: content moderation rejected (shot 12)' },
  16: { state: 'failed', failAttempts: 2, failMessage: 'Image generation failed after 2 attempts: provider timeout (shot 16)' },
  17: { state: 'processing' },
  18: { state: 'processing' },
}

type SeedShots = Array<{
  clip: number
  shotType: string
  cameraMove: string
  description: string
  imagePrompt: string
  videoPrompt?: string
  dialogue?: string
  state: ShotState
  failMessage?: string
  failAttempts?: number
}>

function loadFromPipeline(jsonPath: string) {
  const abs = resolve(jsonPath)
  const raw = JSON.parse(readFileSync(abs, 'utf-8')) as PipelineJson

  const shots = raw.storyboard.storyboard
  if (!shots.length) throw new Error(`pipeline JSON has no storyboard shots: ${abs}`)

  // 场景 → 片段：shot.scene_id 归组（保持引擎输出顺序）
  const sceneOrder: string[] = []
  for (const s of shots) if (!sceneOrder.includes(s.scene_id)) sceneOrder.push(s.scene_id)
  const sceneMetaById = new Map(raw.scenes.scenes.map((sc) => [sc.id, sc]))
  const charNameSet = new Set(raw.characters.characters.map((c) => c.name))

  // 引擎分镜在场景间可能交错（如闪回），按片段聚合后需重算全局镜号，
  // 生产状态层（失败/处理中）按重算后的全局镜号叠加，
  // 保证平台里「第 12 镜失败」与驾驶舱 R-03 叙事一致。
  const shotIdToGlobalPanel = new Map<string, number>()
  let running = 0
  for (let clipNo = 1; clipNo <= sceneOrder.length; clipNo++) {
    const clipShots = shots.filter((s) => s.scene_id === sceneOrder[clipNo - 1])
    for (const s of clipShots) {
      running += 1
      shotIdToGlobalPanel.set(s.shot_id, running)
    }
  }

  const seedShots: SeedShots = shots.map((s) => {
    const globalPanel = shotIdToGlobalPanel.get(s.shot_id)!
    const override = SHOT_STATE_OVERRIDES[globalPanel]
    const img = raw.image_prompts.prompts.find((p) => p.shot_id === s.shot_id)
    const vid = raw.video_prompts.video_prompts.find((p) => p.shot_id === s.shot_id)
    return {
      clip: sceneOrder.indexOf(s.scene_id) + 1,
      shotType: s.shot_type,
      cameraMove: `${s.camera_movement}｜${s.camera_setup}`,
      description: s.visual_description,
      imagePrompt: img?.prompt_cn || `影视级现实主义，电影质感，${s.visual_description.slice(0, 60)}，8K超清，专业布光`,
      videoPrompt: vid?.prompt,
      dialogue: s.dialogue || undefined,
      state: override?.state ?? 'done',
      failMessage: override?.failMessage,
      failAttempts: override?.failAttempts,
    }
  })

  // 片段元信息（按 pipeline 场景聚合；角色 = 该场景镜头的 actions/dialogue 出现过的角色）
  const clipMeta: Record<number, { summary: string; location: string; content: string; characters: string[] }> = {}
  for (let i = 0; i < sceneOrder.length; i++) {
    const sc = sceneMetaById.get(sceneOrder[i])!
    const sceneShots = shots.filter((s) => s.scene_id === sceneOrder[i])
    const charSet = new Set<string>()
    for (const s of sceneShots) {
      for (const name of Object.keys(s.character_actions)) {
        if (charNameSet.has(name)) charSet.add(name)
      }
      const match = s.dialogue.match(/^(林默|顾晚|AURA)/)
      if (match && charNameSet.has(match[1])) charSet.add(match[1])
    }
    clipMeta[i + 1] = {
      summary: `${sc.name}（${sc.time_of_day}）— ${sc.atmosphere}`,
      location: sc.name,
      content: sc.description,
      characters: Array.from(charSet),
    }
  }

  const characters = raw.characters.characters.map((c) => ({
    name: c.name,
    aliases: [] as string[],
    profile: {
      role_level: c.type,
      archetype: c.type,
      personality_tags: c.personality,
      era_period: '现代都市',
      social_class: '未知',
      occupation: '未知',
      costume_tier: '未知',
      suggested_colors: [],
      primary_identifier: c.appearance[0] || '',
      visual_keywords: c.appearance,
      gender: c.gender,
      age_range: c.age_group,
    },
    introduction: `${c.name}（${c.type}）：${c.personality.join('、')}。台词「${c.first_line}」`,
  }))

  const locations = raw.scenes.scenes.map((sc) => ({
    name: sc.name,
    summary: `${sc.description}（光线：${sc.lighting}）`,
  }))

  return {
    title: raw.storyboard.project.title,
    genre: raw.storyboard.project.genre,
    estimatedDuration: raw.storyboard.project.estimated_duration,
    clipMeta,
    shots: seedShots,
    characters,
    locations,
  }
}

async function ensureUser(args: Args) {
  let user = await prisma.user.findUnique({ where: { name: args.user } })
  if (user) return user

  // dry-run 不产生任何写入：用户不存在时只提示，不创建
  if (!args.apply || !args.createUser) {
    writeError(
      `ERROR: user "${args.user}" not found. 先注册账号，用 --user=<用户名> 指定已存在用户，` +
        `或加 --apply --create-user 直接创建（密码用 --password= 指定，默认 demo123456）。`,
    )
    process.exit(1)
  }

  const hashedPassword = await bcrypt.hash(args.password, 12)
  user = await prisma.user.create({
    data: {
      name: args.user,
      password: hashedPassword,
      balance: { create: { balance: 0, frozenAmount: 0, totalSpent: 0 } },
    },
  })
  writeJson({ createdUser: { id: user.id, name: user.name } })
  return user
}

async function main() {
  const args = parseArgs()
  const projectName = 'AI 短剧《24小时之后》'

  // 数据源：--from-pipeline 优先（引擎 JSON → 平台），否则用内置演示数据
  let clipMeta = CLIP_META
  let seedCharacters = CHARACTERS
  let seedLocations = LOCATIONS
  let seedShots: SeedShots = SHOTS.map((s) => ({ ...s }))
  let dataSource = 'builtin (demo_data_24h 同源)'
  if (args.fromPipeline) {
    const piped = loadFromPipeline(args.fromPipeline)
    clipMeta = piped.clipMeta
    seedCharacters = piped.characters
    seedLocations = piped.locations
    seedShots = piped.shots
    dataSource = `pipeline JSON: ${args.fromPipeline}`
  }

  const user = await ensureUser(args)

  const existing = await prisma.project.findFirst({
    where: { name: projectName, userId: user.id },
  })

  const doneCount = seedShots.filter((s) => s.state === 'done').length
  const processingCount = seedShots.filter((s) => s.state === 'processing').length
  const failedCount = seedShots.filter((s) => s.state === 'failed').length

  writeJson({
    mode: args.apply ? 'APPLY' : 'DRY-RUN',
    user: { id: user.id, name: user.name },
    existingProject: existing ? { id: existing.id } : null,
    dataSource,
    plan: {
      project: projectName,
      characters: seedCharacters.map((c) => c.name),
      locations: seedLocations.map((l) => l.name),
      episodes: 1,
      clips: Object.keys(clipMeta).length,
      panels: seedShots.length,
      panelStates: { done: doneCount, processing: processingCount, failed: failedCount },
    },
  })

  if (!args.apply) {
    writeJson({ note: 'DRY-RUN：未写入数据库。加 --apply 执行写入。' })
    return
  }

  // 幂等：同名项目先删后建（级联清理 studio 数据与任务）
  if (existing) {
    await prisma.task.deleteMany({ where: { projectId: existing.id } })
    await prisma.project.delete({ where: { id: existing.id } })
    writeJson({ reset: true, deletedProjectId: existing.id })
  }

  const project = await prisma.project.create({
    data: {
      name: projectName,
      description: '面试演示项目：程序员获得预测未来 24 小时的 AI 助手，代价是随机失去一段记忆。',
      mode: 'studio',
      userId: user.id,
    },
  })

  // 与 src/app/api/projects/route.ts 的创建流程保持一致：
  // StudioProject.projectId 指向 Project.id
  const studioProject = await prisma.studioProject.create({
    data: {
      projectId: project.id,
      artStyle: 'american-comic',
      workflowMode: 'srt',
      globalAssetText: [
        '林默：26 岁失业程序员，深灰连帽衫，黑框眼镜，内向理性。',
        '顾晚：25 岁调查记者，高马尾，利落风衣，随身银色录音笔。',
        'AURA：预测 AI，无实体，屏幕文字流 UI，荧光蓝光标，中性合成音。',
        '场景：出租屋（深夜）、地铁（晚高峰）、咖啡馆（午后）、医院（冷白）、天台（夜景）。',
      ].join('\n'),
    },
  })

  const studioProjectId = studioProject.id
  const projectId = project.id

  // 角色（profileConfirmed=true，跳过角色确认卡点直接可演示）
  for (const c of seedCharacters) {
    await prisma.studioCharacter.create({
      data: {
        id: randomUUID(),
        studioProjectId,
        name: c.name,
        aliases: JSON.stringify(c.aliases),
        profileData: JSON.stringify(c.profile),
        profileConfirmed: true,
        introduction: c.introduction,
      },
    })
  }

  // 场景
  for (const l of seedLocations) {
    await prisma.studioLocation.create({
      data: {
        id: randomUUID(),
        studioProjectId,
        name: l.name,
        summary: l.summary,
        assetKind: 'location',
      },
    })
  }

  // 第 1 集
  const episode = await prisma.studioEpisode.create({
    data: {
      id: randomUUID(),
      studioProjectId,
      episodeNumber: 1,
      name: '第 1 集：你好，林默',
      description: EPISODE_SYNOPSIS,
    },
  })

  // 按片段分组镜头（pipeline 模式下片段数 = 引擎场景数）
  const clipNumbers = Object.keys(clipMeta).map(Number).sort((a, b) => a - b)
  const clipIds: Record<number, string> = {}
  const storyboardIds: Record<number, string> = {}

  for (const clipNo of clipNumbers) {
    const meta = clipMeta[clipNo]
    const clipShots = seedShots.filter((s) => s.clip === clipNo)

    const clip = await prisma.studioClip.create({
      data: {
        id: randomUUID(),
        episodeId: episode.id,
        summary: meta.summary,
        location: meta.location,
        characters: JSON.stringify(meta.characters),
        props: JSON.stringify(['笔记本电脑', '纸箱', '录音笔', '相册', '手机']),
        content: meta.content,
        shotCount: clipShots.length,
      },
    })
    clipIds[clipNo] = clip.id

    const storyboard = await prisma.studioStoryboard.create({
      data: {
        id: randomUUID(),
        episodeId: episode.id,
        clipId: clip.id,
        panelCount: clipShots.length,
        storyboardTextJson: JSON.stringify({
          panels: clipShots.map((s, i) => ({
            panel_number: clipNumbers.slice(0, clipNumbers.indexOf(clipNo)).reduce((sum, c) => sum + seedShots.filter((x) => x.clip === c).length, 0) + i + 1,
            shot_type: s.shotType,
            camera_move: s.cameraMove,
            description: s.description,
            duration: s.state === 'processing' ? null : 4,
          })),
        }),
      },
    })
    storyboardIds[clipNo] = storyboard.id
  }

  // 镜头（StudioPanel）+ 模拟任务（Task）
  let globalIndex = 0
  for (const clipNo of clipNumbers) {
    const clipShots = seedShots.filter((s) => s.clip === clipNo)
    for (let i = 0; i < clipShots.length; i++) {
      const shot = clipShots[i]
      globalIndex += 1
      const panelNumber = globalIndex

      const imageUrl = shot.state === 'done' ? `/demo/shots/panel-${String(panelNumber).padStart(2, '0')}.svg` : null

      await prisma.studioPanel.create({
        data: {
          id: randomUUID(),
          storyboardId: storyboardIds[clipNo],
          panelIndex: i,
          panelNumber,
          shotType: shot.shotType,
          cameraMove: shot.cameraMove,
          description: shot.description,
          location: clipMeta[clipNo].location,
          characters: JSON.stringify(seedCharacters.filter((c) => clipMeta[clipNo].characters.includes(c.name)).map((c) => ({ name: c.name, appearance: c.profile.visual_keywords.join('、') || '按角色设定' }))),
          imagePrompt: shot.imagePrompt,
          imageUrl,
          duration: shot.state === 'processing' ? null : 4,
        },
      })

      // 模拟生成任务：处理中 / 失败的镜头写入 Task，让任务中心可演示
      if (shot.state === 'processing' || shot.state === 'failed') {
        const isFailed = shot.state === 'failed'
        const now = new Date()
        await prisma.task.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            projectId,
            episodeId: episode.id,
            type: 'image_panel',
            targetType: 'panel',
            targetId: panelNumber.toString(),
            status: isFailed ? 'failed' : 'processing',
            progress: isFailed ? 100 : 40,
            attempt: isFailed ? (shot.failAttempts ?? 2) : 1,
            maxAttempts: 3,
            errorCode: isFailed ? 'GENERATION_FAILED' : null,
            errorMessage: isFailed ? (shot.failMessage ?? null) : null,
            payload: { demo: true, panelNumber, clipNumber: clipNo },
            queuedAt: now,
            startedAt: new Date(now.getTime() - 5 * 60 * 1000),
            finishedAt: isFailed ? now : null,
          },
        })
      }
    }
  }

  writeJson({
    applied: true,
    projectId,
    studioProjectId,
    episodeId: episode.id,
    stats: {
      characters: seedCharacters.length,
      locations: seedLocations.length,
      clips: clipNumbers.length,
      panels: seedShots.length,
      panelStates: { done: doneCount, processing: processingCount, failed: failedCount },
      mockTasks: processingCount + failedCount,
    },
  })

  // 第二个演示项目：真实媒体样片库（public/videos/showcase 内置文件，非《24小时之后》生成结果）
  await createShowcaseProject(args, user)
}

// ============================================================
// [DEMO] 项目二：《AI影视真实样片库》
// 复用仓库 public/videos/showcase/ 内置真实样片（8 风格 × MP4+JPG 海报），
// 用于演示媒体预览与审核流程。不是《24小时之后》的生成结果，
// 不创建伪造 MinIO Media 记录，直接引用 public 静态路径。
// ============================================================
const SHOWCASE_PROJECT_NAME = 'AI影视真实样片库'
const SHOWCASE_DESCRIPTION =
  '仓库内置真实媒体样片，用于演示媒体生产、预览和审核流程。（样片为通用风格演示素材，不是《24小时之后》的实际生成结果。）'

const SHOWCASE_CLIPS: Array<{
  name: string
  style: string
  shotType: string
  cameraMove: string
  duration: number
  description: string
  imagePrompt: string
  videoPrompt: string
}> = [
  { name: '01-romance', style: 'romance', shotType: '近景', cameraMove: '缓推', duration: 5,
    description: '黄昏城市天台，两人相视而笑，暖色逆光勾勒轮廓，空气中漂浮着细小光尘，情绪从试探转向靠近。',
    imagePrompt: 'cinematic romance, golden hour rooftop, two people smiling, warm backlight, floating dust, 8k, photorealistic',
    videoPrompt: 'cinematic romance scene, slow push-in on two faces at golden hour, soft warm backlight, gentle hair movement, 24fps' },
  { name: '02-revenge', style: 'revenge', shotType: '特写', cameraMove: '环绕', duration: 5,
    description: '雨夜街头，主角裹紧黑色大衣抬眼，眼神从隐忍转为锋利，霓虹在湿地面拉出冷色长反光。',
    imagePrompt: 'cinematic revenge noir, rainy night street, black coat, sharp gaze, neon reflections on wet ground, 8k, photorealistic',
    videoPrompt: 'cinematic noir revenge, slow orbit around a rain-soaked figure, neon reflections, intense stare, 24fps' },
  { name: '03-scifi', style: 'scifi', shotType: '远景', cameraMove: '升镜头', duration: 6,
    description: '巨大的环状空间站悬停在行星轨道上，蓝白色引擎光晕缓慢脉动，星空深邃，镜头逐渐拉升展现全貌。',
    imagePrompt: 'cinematic sci-fi establishing shot, massive ring space station over planet, blue engine glow, deep starfield, 8k, photorealistic',
    videoPrompt: 'cinematic sci-fi, slow rising crane shot revealing ring station and planet, pulsing engine light, 24fps' },
  { name: '04-anime', style: 'anime', shotType: '全景', cameraMove: '横移', duration: 5,
    description: '夏日祭典夜市，灯笼连成光带，浴衣少女回眸，樱花瓣随风掠过，赛璐璐上色风格明快通透。',
    imagePrompt: 'anime style summer festival night, lantern light trail, girl in yukata looking back, cherry petals, cel shading, vibrant',
    videoPrompt: 'anime style festival scene, lateral tracking past lanterns, yukata girl turns, petals drifting, 24fps' },
  { name: '05-action', style: 'action', shotType: '中景', cameraMove: '跟拍', duration: 5,
    description: '废弃工厂追逐，主角翻越集装箱，火花与扬尘四溅，手持镜头剧烈晃动营造紧迫感。',
    imagePrompt: 'cinematic action chase, abandoned factory, jumping over containers, sparks and dust, handheld motion blur, 8k',
    videoPrompt: 'cinematic action, fast handheld chase through factory, sparks flying, dynamic camera shake, 24fps' },
  { name: '06-luxury', style: 'luxury', shotType: '特写', cameraMove: '缓拉', duration: 5,
    description: '鎏金宴会厅，香槟杯塔折射水晶灯光，红裙主角指尖划过大理石台面，质感奢华沉稳。',
    imagePrompt: 'cinematic luxury gala, champagne tower, crystal chandelier reflections, red dress fingertips on marble, 8k, photorealistic',
    videoPrompt: 'cinematic luxury, slow pull-back from champagne glasses, chandelier bokeh, elegant fingertip touch, 24fps' },
  { name: '07-drama', style: 'drama', shotType: '近景', cameraMove: '固定', duration: 6,
    description: '车站长椅，老人握着旧车票望向铁轨尽头，逆光剪影，神情平静中带着释然，候车厅空旷安静。',
    imagePrompt: 'cinematic drama, train station bench, elderly man holding old ticket, silhouette against platform light, quiet release, 8k',
    videoPrompt: 'cinematic drama, static shot, elderly man on bench gazes down the tracks, dust in light beam, subtle breath, 24fps' },
  { name: '08-fantasy', style: 'fantasy', shotType: '全景', cameraMove: '推', duration: 6,
    description: '古老森林深处，发光符文石门缓缓开启，蓝绿色魔法光粒涌出，苔藓巨石间透出神秘气息。',
    imagePrompt: 'cinematic fantasy, ancient forest stone gate with glowing runes, blue-green magic particles, mossy monoliths, 8k',
    videoPrompt: 'cinematic fantasy, slow push toward rune gate as it opens, magic particles surge, forest light rays, 24fps' },
]

async function createShowcaseProject(args: Args, user: { id: string }) {
  const existing = await prisma.project.findFirst({
    where: { name: SHOWCASE_PROJECT_NAME, userId: user.id },
  })

  // 幂等：同名项目先删后建
  if (existing) {
    await prisma.task.deleteMany({ where: { projectId: existing.id } })
    await prisma.project.delete({ where: { id: existing.id } })
    writeJson({ reset: true, deletedProjectId: existing.id, project: SHOWCASE_PROJECT_NAME })
  }

  const project = await prisma.project.create({
    data: {
      name: SHOWCASE_PROJECT_NAME,
      description: SHOWCASE_DESCRIPTION,
      mode: 'studio',
      userId: user.id,
    },
  })

  const studioProject = await prisma.studioProject.create({
    data: {
      projectId: project.id,
      artStyle: 'american-comic',
      workflowMode: 'srt',
      globalAssetText: '仓库内置真实媒体样片，用于演示媒体生产、预览和审核流程。8 个风格样片：romance/revenge/scifi/anime/action/luxury/drama/fantasy。',
    },
  })

  const studioProjectId = studioProject.id
  const projectId = project.id

  // 第 1 集：单片段承载 8 镜
  const episode = await prisma.studioEpisode.create({
    data: {
      id: randomUUID(),
      studioProjectId,
      episodeNumber: 1,
      name: '第 1 集：风格样片合集',
      description: SHOWCASE_DESCRIPTION,
    },
  })

  const clip = await prisma.studioClip.create({
    data: {
      id: randomUUID(),
      episodeId: episode.id,
      summary: '8 个真实样片镜头（public/videos/showcase）',
      location: '样片库',
      characters: JSON.stringify([]),
      props: JSON.stringify([]),
      content: SHOWCASE_DESCRIPTION,
      shotCount: SHOWCASE_CLIPS.length,
    },
  })

  const storyboard = await prisma.studioStoryboard.create({
    data: {
      id: randomUUID(),
      episodeId: episode.id,
      clipId: clip.id,
      panelCount: SHOWCASE_CLIPS.length,
      storyboardTextJson: JSON.stringify({
        panels: SHOWCASE_CLIPS.map((s, i) => ({
          panel_number: i + 1,
          shot_type: s.shotType,
          camera_move: s.cameraMove,
          description: s.description,
          duration: s.duration,
        })),
      }),
    },
  })

  for (let i = 0; i < SHOWCASE_CLIPS.length; i++) {
    const s = SHOWCASE_CLIPS[i]
    await prisma.studioPanel.create({
      data: {
        id: randomUUID(),
        storyboardId: storyboard.id,
        panelIndex: i,
        panelNumber: i + 1,
        shotType: s.shotType,
        cameraMove: s.cameraMove,
        description: s.description,
        location: '样片库',
        characters: JSON.stringify([]),
        imagePrompt: s.imagePrompt,
        // 仓库内置真实媒体：直接引用 public 静态路径（不伪造 MinIO Media 记录）
        imageUrl: `/videos/showcase/posters/${s.name}.jpg`,
        videoUrl: `/videos/showcase/${s.name}.mp4`,
        duration: s.duration,
      },
    })
  }

  writeJson({
    applied: true,
    project: SHOWCASE_PROJECT_NAME,
    projectId,
    studioProjectId,
    episodeId: episode.id,
    stats: { panels: SHOWCASE_CLIPS.length, states: 'all done', media: 'public/videos/showcase (real files)' },
  })
}

main()
  .catch((err) => {
    writeError(`FATAL: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
