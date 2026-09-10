import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
let failures = 0

function pass(message) {
  console.log(`PASS  ${message}`)
}

function fail(message) {
  failures += 1
  console.error(`FAIL  ${message}`)
}

function check(condition, message) {
  condition ? pass(message) : fail(message)
}

function file(path) {
  return resolve(root, path)
}

console.log('\nDramaFlow Studio · Interview Demo Preflight\n')

const requiredFiles = [
  'README.md',
  'product/PRODUCT_CASE.md',
  'product/COMPETITOR_ANALYSIS.md',
  'product/INTERVIEW_DEMO.md',
  'scripts/seed-demo-project.ts',
  'messages/zh/dashboard.json',
  'messages/en/dashboard.json',
]

for (const path of requiredFiles) {
  check(existsSync(file(path)), `required file exists: ${path}`)
}

let panelCount = 0
for (let i = 1; i <= 24; i += 1) {
  const name = `public/demo/shots/panel-${String(i).padStart(2, '0')}.svg`
  if (existsSync(file(name))) panelCount += 1
}
check(panelCount === 24, `24/24 offline storyboard placeholder assets (${panelCount}/24 found)`)

const seedPath = file('scripts/seed-demo-project.ts')
if (existsSync(seedPath)) {
  const seed = readFileSync(seedPath, 'utf8')
  const doneCount = (seed.match(/state:\s*'done'/g) || []).length
  const processingCount = (seed.match(/state:\s*'processing'/g) || []).length
  const failedCount = (seed.match(/state:\s*'failed'/g) || []).length

  check(doneCount === 20, `seed has 20 completed image shots (${doneCount})`)
  check(processingCount === 2, `seed has 2 processing shots (${processingCount})`)
  check(failedCount === 2, `seed has 2 failed shots (${failedCount})`)
  check(seed.includes('failAttempts: 3'), 'seed includes a three-attempt failure for retry storytelling')
  check(seed.includes('(shot 12)'), 'shot #12 is explicitly represented as a failed interview case')
  check(seed.includes('imagePrompt:'), 'storyboard seed contains editable image prompts')
}

const zhDashboardPath = file('messages/zh/dashboard.json')
if (existsSync(zhDashboardPath)) {
  try {
    const dashboard = JSON.parse(readFileSync(zhDashboardPath, 'utf8'))
    const counts = dashboard?.funnel?.items?.map((item) => item.count) || []
    check(
      JSON.stringify(counts) === JSON.stringify([24, 24, 20, 2, 2, 0]),
      `dashboard funnel matches seed state (${counts.join('/')})`,
    )
    check(dashboard?.demoBadge?.includes('Mock'), 'dashboard visibly labels metrics as Demo / Mock')
    check(dashboard?.issues?.items?.some((item) => item.id === 'R-03' && item.issue.includes('第 12 镜')), 'dashboard R-03 maps to shot #12 retry case')
  } catch (error) {
    fail(`Chinese dashboard JSON parses: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const envExample = file('.env.example')
if (existsSync(envExample)) {
  const env = readFileSync(envExample, 'utf8')
  check(env.includes('localhost:23306'), '.env.example MySQL port matches docker-compose host port 23306')
  check(env.includes('REDIS_PORT=26379'), '.env.example Redis port matches docker-compose host port 26379')
  check(env.includes('localhost:29000'), '.env.example MinIO documentation matches docker-compose host port 29000')
}

console.log('')
if (failures > 0) {
  console.error(`Interview demo preflight FAILED with ${failures} issue(s).`)
  process.exit(1)
}

console.log('Interview demo preflight PASSED.')
console.log('Seed command: npx tsx --env-file=.env scripts/seed-demo-project.ts --apply --create-user')
console.log('Demo account: demo / demo123456')
console.log('Recommended live path: Dashboard → Assets → Storyboard → Shot #12 failure → Retry → Provider config')
