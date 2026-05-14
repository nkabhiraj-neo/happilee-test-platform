/**
 * Happilee QA — clean test runner
 *
 * Runs ONLY the real feature files (not *_jira.feature) for auth + project.
 * Does NOT use --config to avoid the paths glob picking up jira feature files.
 * All cucumber options are passed directly as CLI args.
 *
 * Usage:
 *   node e2e/scripts/run-qa.mjs                      # headless, all modules
 *   E2E_HEADED=1 node e2e/scripts/run-qa.mjs         # headed browser
 *   node e2e/scripts/run-qa.mjs --auth-only           # only auth
 *   node e2e/scripts/run-qa.mjs --proj-only           # only project
 *   node e2e/scripts/run-qa.mjs --scenario 201        # only @MLR-201
 *   node e2e/scripts/run-qa.mjs --scenario MLR-201    # same
 */

import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..', '..')


const args = process.argv.slice(2)
const authOnly = args.includes('--auth-only')
const projOnly = args.includes('--proj-only')

// --scenario 201  or  --scenario MLR-201
const scenarioIdx = args.indexOf('--scenario')
const rawScenario = scenarioIdx >= 0 ? args[scenarioIdx + 1] : null
const scenarioTag = rawScenario
  ? (rawScenario.toUpperCase().startsWith('MLR-') ? rawScenario.toUpperCase() : `MLR-${rawScenario}`)
  : null

const MODULES = [
  {
    name: 'Auth',
    key: 'auth',
    dir: path.join(root, 'codebase', '_hap_fe_auth'),
    feature: 'tests/bdd/features/login/auth-login.feature',
    // Support files from the auth cucumber.config.cjs — no paths glob
    requires: [
      'tests/bdd/support/world.ts',
      'tests/bdd/support/hooks.ts',
      'tests/bdd/steps/**/*.ts',
    ],
  },
  {
    name: 'Project',
    key: 'project',
    dir: path.join(root, 'codebase', '_hap_fe_project'),
    feature: 'tests/bdd/features/project/project-listing-and-creation.feature',
    // Support files from the project cucumber.config.cjs — no paths glob
    requires: [
      'tests/bdd/support/world.ts',
      'tests/bdd/support/hooks.ts',
      '../_hap_fe_auth/tests/bdd/steps/**/*.ts',
      'tests/bdd/steps/**/*.ts',
    ],
  },
].filter(m => {
  if (authOnly) return m.key === 'auth'
  if (projOnly) return m.key === 'project'
  return true
})

const moduleKey = scenarioTag
  ? scenarioTag
  : authOnly ? 'auth' : projOnly ? 'project' : 'full'

const startTime = Date.now()
const testStartedAt = new Date(startTime).toISOString()

const line = '═'.repeat(62)
console.log('\n' + line)
console.log('  🚀  HAPPILEE QA — TEST RUNNER')
console.log(line)
console.log(`  Modules  : ${MODULES.map(m => m.name).join(' + ')}`)
if (scenarioTag) console.log(`  Scenario : ${scenarioTag}`)
console.log(`  Mode     : ${process.env.E2E_HEADED === '1' ? 'HEADED' : 'headless'}`)
console.log(`  Started  : ${new Date().toLocaleString('en-IN')}`)
console.log(line + '\n')

const results = []

for (const mod of MODULES) {
  console.log(`\n▶  ${mod.name.toUpperCase()} — ${mod.feature}${scenarioTag ? ` [${scenarioTag}]` : ''}`)
  console.log('─'.repeat(62))

  fs.mkdirSync(path.join(mod.dir, 'artifacts', 'cucumber'), { recursive: true })

  const headed = process.env.E2E_HEADED === '1'
  const env = {
    ...process.env,
    TS_NODE_PROJECT: path.join(root, 'codebase', 'tsconfig.json'),
    NODE_OPTIONS: '--no-deprecation',
    HEADLESS: headed ? 'false' : 'true',
    SLOWMO: headed ? '800' : '0',
    // Force all @cucumber/cucumber imports to resolve from the same node_modules
    // (prevents PENDING error when cross-module requires load auth steps from _hap_fe_auth)
    NODE_PATH: path.join(root, 'codebase', 'node_modules'),
  }

  // Build args without --config so no paths glob is loaded.
  // Feature file first, --require-module last — matches the working Cursor invocation.
  const cucumberBin = path.join(root, 'codebase', 'node_modules', '@cucumber', 'cucumber', 'bin', 'cucumber.js')

  const cucumberArgs = [
    cucumberBin,
    mod.feature,
    ...(scenarioTag ? ['--tags', `@${scenarioTag}`] : []),
    ...mod.requires.flatMap(r => ['--require', r]),
    '--require-module', 'ts-node/register',
    '--format', 'progress',
    '--format', `json:artifacts/cucumber/cucumber.json`,
  ]

  const r = spawnSync(process.execPath, cucumberArgs, { cwd: mod.dir, stdio: 'inherit', shell: false, env })

  const passed = r.status === 0
  results.push({ module: mod.name, passed, exitCode: r.status ?? 1 })

  console.log(passed
    ? `\n  ✅  ${mod.name} — all tests passed`
    : `\n  ❌  ${mod.name} — some tests failed (exit ${r.status})`
  )
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
console.log('\n' + line)
console.log('  TEST SUMMARY')
console.log(line)
for (const r of results) {
  console.log(`  ${r.passed ? '✅' : '❌'}  ${r.module.padEnd(12)} ${r.passed ? 'PASSED' : 'FAILED'}`)
}
console.log(`\n  Total time: ${elapsed}s`)
console.log(line)

console.log('\n📊 Running post-run-sync (AI analysis + dashboard update)...\n')

const syncEnv = {
  ...process.env,
  QA_RUN_MODULE: moduleKey,
  QA_SCENARIO_TAG: scenarioTag || '',
  QA_TEST_STARTED_AT: testStartedAt,
}

const syncResult = spawnSync(
  process.execPath,
  [path.join(root, 'e2e', 'scripts', 'post-run-sync.mjs')],
  { cwd: root, stdio: 'inherit', env: syncEnv }
)

const anyFailed = results.some(r => !r.passed)
process.exit(anyFailed ? 1 : (syncResult.status ?? 0))
