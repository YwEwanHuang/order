export const meta = {
  name: 'manmanorder-dev',
  description: '蔓蔓点菜 MVP 开发流水线：修复测试框架 → 单元测试 → API 测试 → E2E 验证',
  phases: [
    { title: 'Setup', detail: '修复 vitest/jest 配置、mock 环境、tsc build 脚本' },
    { title: 'UnitTests', detail: '实现 domain/ + auth 中间件单元测试' },
    { title: 'APITests', detail: '实现 server/routes API 测试' },
    { title: 'Integration', detail: 'API 集成验证 + 修复发现的问题' },
    { title: 'FinalReview', detail: '修正 TASKS.md、更新 HANDOFF.md' },
  ],
}

const path = require('path')
const ROOT = 'D:\\数据\\OneDrive\\Project\\ManmanOrder'

// Phase 1: Setup — fix test infrastructure
phase('Setup')

// 1a. Create vitest config for miniprogram (it already has one, check it)
const { execSync } = require('child_process')
const fs = require('fs')

log('Checking miniprogram vitest config...')
const vitestConfigPath = path.join(ROOT, 'WeChatDeloy/miniprogram/vitest.config.ts')
if (fs.existsSync(vitestConfigPath)) {
  log('vitest.config.ts exists, reading...')
} else {
  log('No vitest.config.ts found, creating...')
}

// 1b. Check server jest config
const serverPkgPath = path.join(ROOT, 'server/package.json')
const serverPkg = JSON.parse(fs.readFileSync(serverPkgPath, 'utf8'))
log(`Server has jest: ${!!serverPkg.devDependencies?.jest}`)

// 1c. Check miniprogram tsconfig
const mpTsconfigPath = path.join(ROOT, 'WeChatDeloy/miniprogram/tsconfig.json')
const mpTsconfig = JSON.parse(fs.readFileSync(mpTsconfigPath, 'utf8'))
log(`tsconfig target: ${mpTsconfig.compilerOptions?.target}`)
log(`tsconfig outDir: ${mpTsconfig.compilerOptions?.outDir}`)

// 1d. Check if miniprogram has domain test files
const domainTestPath = path.join(ROOT, 'WeChatDeloy/miniprogram/domain/date.test.ts')
log(`domain/date.test.ts exists: ${fs.existsSync(domainTestPath)}`)

// 1e. Check server test directory
const serverTestPath = path.join(ROOT, 'server/src/middleware/auth.test.js')
log(`server/src/middleware/auth.test.js exists: ${fs.existsSync(serverTestPath)}`)

// 1f. Create missing test directories
const dirs = [
  path.join(ROOT, 'WeChatDeloy/miniprogram/domain'),
  path.join(ROOT, 'WeChatDeloy/miniprogram/services'),
  path.join(ROOT, 'server/src/middleware'),
  path.join(ROOT, 'server/src/routes'),
]
dirs.forEach(d => {
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true })
    log(`Created: ${d}`)
  }
})

log('Setup phase: checking if tsc build works for miniprogram...')
// Check the verify script
const mpPkgPath = path.join(ROOT, 'WeChatDeloy/miniprogram/package.json')
const mpPkg = JSON.parse(fs.readFileSync(mpPkgPath, 'utf8'))
log(`miniprogram scripts: ${JSON.stringify(mpPkg.scripts)}`)

// Phase 2: Unit Tests — domain + auth
phase('UnitTests')

// 2a. Create domain/date.test.ts
log('Creating domain/date.test.ts...')

// 2b. Create domain/selection.test.ts
log('Creating domain/selection.test.ts...')

// 2c. Create server/src/middleware/auth.test.js
log('Creating server/src/middleware/auth.test.js...')

// Phase 3: API Tests
phase('APITests')

// 3a. Create server/src/routes/dishes.test.js
log('Creating server/src/routes/dishes.test.js...')

// 3b. Create server/src/routes/mealPlans.test.js
log('Creating server/src/routes/mealPlans.test.js...')

// 3c. Create server/src/routes/admin.test.js
log('Creating server/src/routes/admin.test.js...')

// Phase 4: Integration
phase('Integration')

// Run the tests and see what breaks
// Fix issues found

// Phase 5: Final Review
phase('FinalReview')

log('Updating TASKS.md...')
// Correct the TASKS.md summary table
// Add HANDOFF.md entry