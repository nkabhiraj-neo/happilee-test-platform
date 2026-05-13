import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ── Human-readable run ID ─────────────────────────────────────────────────────
// IDs: auth-test-1, project-test-2, full-test-1, MLR-201-test-1, etc.
const MODULE_KEY = process.env.QA_RUN_MODULE || 'full';
const SCENARIO_TAG = process.env.QA_SCENARIO_TAG || '';

function getRunId() {
  const countersPath = 'docs/reports/run-counters.json';
  let counters = {};
  try {
    if (fs.existsSync(countersPath)) counters = JSON.parse(fs.readFileSync(countersPath, 'utf8'));
  } catch {}
  const key = SCENARIO_TAG || MODULE_KEY;
  const next = (counters[key] || 0) + 1;
  counters[key] = next;
  fs.mkdirSync('docs/reports', { recursive: true });
  fs.writeFileSync(countersPath, JSON.stringify(counters, null, 2));
  const label = SCENARIO_TAG ? SCENARIO_TAG : MODULE_KEY;
  return `${label}-test-${next}`;
}

const RUN_ID = getRunId();
const SESSION_STARTED_AT = process.env.QA_TEST_STARTED_AT || new Date().toISOString();

// Reset token counter for this run (ensures no bleed-over from previous runs)
fs.mkdirSync('docs/reports', { recursive: true });
fs.writeFileSync('docs/reports/ai-usage.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  runId: RUN_ID,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
}, null, 2));

// Only sync the module(s) that actually ran — prevents cross-contamination
// MODULE_KEY is 'auth', 'project', a scenario tag like 'MLR-902', or 'full'
const allModules = [
  { name: 'auth', dir: 'codebase/_hap_fe_auth' },
  { name: 'project', dir: 'codebase/_hap_fe_project' }
];
const modules = allModules.filter(m => {
  if (MODULE_KEY === 'full') return true;
  if (MODULE_KEY === 'auth') return m.name === 'auth';
  if (MODULE_KEY === 'project') return m.name === 'project';
  // scenario tag (e.g. MLR-902) — determine by which cucumber.json is freshest
  const jsonPath = path.join(m.dir, 'artifacts/cucumber/cucumber.json');
  if (!fs.existsSync(jsonPath)) return false;
  const age = Date.now() - fs.statSync(jsonPath).mtimeMs;
  return age < 5 * 60 * 1000; // only include if modified in last 5 minutes
});

const videosDir = 'docs/reports/videos';
if (fs.existsSync(videosDir)) {
  fs.readdirSync(videosDir)
    .filter(f => f.endsWith('.webm'))
    .forEach(f => fs.unlinkSync(path.join(videosDir, f)));
}
console.log('🧹 Cleared old videos');

let totalScenarios = 0;
let totalPassed = 0;

for (const module of modules) {
  const videoSrcDir = path.join(module.dir, 'artifacts/videos');
  const cucumberJsonPath = path.join(module.dir, 'artifacts/cucumber/cucumber.json');

  if (!fs.existsSync(cucumberJsonPath)) {
    console.log(`⚠️  Cucumber JSON for ${module.name} not found, skipping...`);
    continue;
  }

  const cucumberJson = JSON.parse(fs.readFileSync(cucumberJsonPath, 'utf8'));
  const scenarios = cucumberJson.flatMap(f => f.elements || []);
  totalScenarios += scenarios.length;
  totalPassed += scenarios.filter(s =>
    (s.steps || []).every(st => st.result?.status === 'passed' || st.hidden)
  ).length;

  const allFiles = fs.existsSync(videoSrcDir)
    ? fs.readdirSync(videoSrcDir)
        .filter(f => f.endsWith('.webm'))
        .map(f => ({
          name: f,
          path: path.join(videoSrcDir, f),
          mtime: fs.statSync(path.join(videoSrcDir, f)).mtime.getTime(),
          isHash: f.startsWith('page@')
        }))
        .sort((a, b) => a.mtime - b.mtime)
    : [];

  const hashVideos = allFiles.filter(f => f.isHash);
  const namedVideos = allFiles.filter(f => !f.isHash);

  const latestByTag = {};
  namedVideos.forEach(vid => {
    const mlrMatch = vid.name.match(/MLR-(\d+)/);
    if (!mlrMatch) return;
    const mlrTag = `MLR-${mlrMatch[1]}`;
    if (!latestByTag[mlrTag] || vid.mtime > latestByTag[mlrTag].mtime) {
      latestByTag[mlrTag] = vid;
    }
  });

  const latestNamedVideos = Object.values(latestByTag).sort((a, b) => a.mtime - b.mtime);
  const videoIndex = {};

  latestNamedVideos.forEach(vid => {
    const mlrMatch = vid.name.match(/MLR-(\d+)/);
    if (!mlrMatch) return;
    const mlrTag = `MLR-${mlrMatch[1]}`;
    videoIndex[mlrTag] = { app: null, yopmail: null };
  });

  hashVideos.forEach(hashVid => {
    const owner = latestNamedVideos.find(named => named.mtime > hashVid.mtime);
    if (owner) {
      const mlrMatch = owner.name.match(/MLR-(\d+)/);
      if (mlrMatch) {
        const mlrTag = `MLR-${mlrMatch[1]}`;
        if (!videoIndex[mlrTag]?.yopmail) {
          videoIndex[mlrTag].yopmail = hashVid;
        }
      }
    }
  });

  latestNamedVideos.forEach((mainVid) => {
    const mlrMatch = mainVid.name.match(/MLR-(\d+)/);
    if (!mlrMatch) return;
    const mlrTag = `MLR-${mlrMatch[1]}`;

    const appDest = `${RUN_ID}-${module.name}-${mlrTag}-app.webm`;
    fs.mkdirSync(videosDir, { recursive: true });
    fs.copyFileSync(mainVid.path, path.join(videosDir, appDest));

    const runVideosDir = `docs/reports/runs/${RUN_ID}/videos`;
    fs.mkdirSync(runVideosDir, { recursive: true });
    fs.copyFileSync(mainVid.path, path.join(runVideosDir, appDest));

    videoIndex[mlrTag].app = appDest;

    const yopmailVidObj = videoIndex[mlrTag]?.yopmail;
    if (yopmailVidObj) {
      const yopmailDest = `${RUN_ID}-${module.name}-${mlrTag}-yopmail.webm`;
      fs.copyFileSync(yopmailVidObj.path, path.join(videosDir, yopmailDest));
      fs.copyFileSync(yopmailVidObj.path, path.join(runVideosDir, yopmailDest));
      videoIndex[mlrTag].yopmail = yopmailDest;
    }
  });

  const moduleIndexFile = path.join(videosDir, `index-${module.name}.json`);
  fs.writeFileSync(moduleIndexFile, JSON.stringify(videoIndex, null, 2));

  // Merge into master index.json for the dashboard
  const masterIndexFile = path.join(videosDir, 'index.json');
  let masterIndex = {};
  if (fs.existsSync(masterIndexFile)) {
    try { masterIndex = JSON.parse(fs.readFileSync(masterIndexFile, 'utf8')); } catch (e) {}
  }
  Object.assign(masterIndex, videoIndex);
  fs.writeFileSync(masterIndexFile, JSON.stringify(masterIndex, null, 2));

  const destJson = `docs/reports/_hap_fe_${module.name}.json`;
  const runDestJson = `docs/reports/runs/${RUN_ID}/_hap_fe_${module.name}.json`;
  
  const wrappedJson = {
    _meta: {
      generatedAt: new Date().toISOString(),
      runId: RUN_ID,
      version: RUN_ID,
      module: module.name
    },
    features: cucumberJson
  };

  fs.mkdirSync(path.dirname(runDestJson), { recursive: true });
  fs.writeFileSync(destJson, JSON.stringify(wrappedJson, null, 2));
  fs.writeFileSync(runDestJson, JSON.stringify(wrappedJson, null, 2));
  console.log(`✅ Synced ${module.name} results`);
}

const historyPath = 'docs/reports/run-history.json';
let history = [];
if (fs.existsSync(historyPath)) {
  history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
}
const failedCount = totalScenarios - totalPassed;
const runLabel = failedCount === 0
  ? `✅ All passed (${totalScenarios} scenarios)`
  : `❌ ${failedCount} failed / ${totalScenarios} scenarios`;

// Determine which module(s) this run covers for dashboard filtering
const runModule = MODULE_KEY === 'full' ? 'full'
  : MODULE_KEY === 'auth' ? 'auth'
  : MODULE_KEY === 'project' ? 'project'
  : modules.length === 1 ? modules[0].name  // scenario tag — use whichever module ran
  : 'full';

history.push({
  id: RUN_ID,
  timestamp: new Date().toISOString(),
  label: runLabel,
  module: runModule,
  totalScenarios,
  passedScenarios: totalPassed,
  failedScenarios: failedCount,
});
fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
console.log('✅ Updated run-history.json');

// ── Auto-analyze failed scenarios with Claude ─────────────────────────────────
function loadEnv() {
  const envPath = '.env';
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    process.env[k] = v;
  }
}
loadEnv();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const KNOWN_BLOCKERS = [
  'MLR-203: Yopmail CAPTCHA blocks automated OTP fetch — this is an ENVIRONMENT_ISSUE not a real bug',
  'Timeout errors on yopmail.com are caused by bot detection CAPTCHA'
];

function safeReadJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function parseUsageShape(raw) {
  const input = Number(raw?.inputTokens ?? raw?.input_tokens ?? raw?.prompt_tokens ?? 0) || 0;
  const output = Number(raw?.outputTokens ?? raw?.output_tokens ?? raw?.completion_tokens ?? 0) || 0;
  const total = Number(raw?.totalTokens ?? raw?.total_tokens ?? (input + output)) || (input + output);
  return { inputTokens: input, outputTokens: output, totalTokens: total };
}

function readPipelineUsage() {
  const usage = safeReadJson(path.join('docs', 'reports', 'ai-usage.json'), {});
  return parseUsageShape(usage || {});
}

function readCursorUsage() {
  const byDefaultPath = path.join('docs', 'reports', 'cursor-usage.json');
  const customPath = String(process.env.CURSOR_USAGE_JSON_PATH || '').trim();
  const usagePath = customPath || byDefaultPath;
  const usage = safeReadJson(usagePath, null);
  if (!usage) {
    return {
      source: usagePath,
      available: false,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  }
  return {
    source: usagePath,
    available: true,
    usage: parseUsageShape(usage),
  };
}

function writeSessionUsageLedger({ pushStartedAt, pushCompletedAt, pushSuccess, pushError = '' }) {
  const pipeline = readPipelineUsage();
  const cursor = readCursorUsage();
  const grandTotal = {
    inputTokens: pipeline.inputTokens + cursor.usage.inputTokens,
    outputTokens: pipeline.outputTokens + cursor.usage.outputTokens,
    totalTokens: pipeline.totalTokens + cursor.usage.totalTokens,
  };
  const payload = {
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    sessionStartedAt: SESSION_STARTED_AT,
    pushStartedAt: pushStartedAt || null,
    pushCompletedAt: pushCompletedAt || null,
    pushSuccess: Boolean(pushSuccess),
    pushError: pushError || null,
    tokenUsage: {
      pipeline,
      cursor: {
        source: cursor.source,
        available: cursor.available,
        ...cursor.usage,
      },
      grandTotal,
    },
  };
  const runUsagePath = path.join('docs', 'reports', 'runs', String(RUN_ID), 'session-usage.json');
  fs.mkdirSync(path.dirname(runUsagePath), { recursive: true });
  fs.writeFileSync(runUsagePath, JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join('docs', 'reports', 'session-usage-latest.json'), JSON.stringify(payload, null, 2));
  console.log(`✅ Wrote session usage ledger: ${runUsagePath}`);
}

async function analyzeFailure(scenario, featureName, videoIndex) {
  const mlrTag = (scenario.tags || [])
    .map(t => t.name.replace('@', ''))
    .find(t => t.startsWith('MLR-'));

  const failedStep = (scenario.steps || [])
    .find(s => s.result?.status === 'failed');

  if (!failedStep) return null;

  // Get screenshot from failed step embeddings
  const stepScreenshot = (failedStep.embeddings || [])
    .find(e => e.mime_type?.startsWith('image/'))?.data || null;

  // Fallback: check after/before hooks
  const hookScreenshot = [
    ...(scenario.before || []),
    ...(scenario.after || [])
  ].flatMap(h => h.embeddings || [])
    .find(e => e.mime_type?.startsWith('image/'))?.data || null;

  const screenshotData = stepScreenshot || hookScreenshot;
  const videoAvailable = !!(videoIndex?.[mlrTag]?.app);

  console.log(`\n🤖 Analyzing failure: ${mlrTag} — ${scenario.name}`);

  const userContent = [];
  if (screenshotData) {
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: screenshotData }
    });
  }

  const rawError = failedStep.result?.error_message || 'No error message';

  // Extract network failures from scenario embeddings (hooks + steps)
  const networkEmb = [
    ...(scenario.before || []),
    ...(scenario.after || []),
    ...(scenario.steps || [])
  ]
    .flatMap(s => s.embeddings || [])
    .find(e => e.mime_type === 'application/json')

  let networkContext = ''
  if (networkEmb) {
    try {
      const networkData = JSON.parse(
        Buffer.from(networkEmb.data, 'base64').toString('utf8')
      )
      if (networkData.failed_requests?.length > 0) {
        const ranked = [...networkData.failed_requests].sort((a, b) => {
          const aScore = (a.status >= 500 ? 3 : a.status >= 400 ? 2 : 1)
          const bScore = (b.status >= 500 ? 3 : b.status >= 400 ? 2 : 1)
          return bScore - aScore
        })
        const topFailures = ranked.slice(0, 3)
        networkContext = `\n\nFAILED NETWORK REQUESTS during test:\n` +
          topFailures.map(r => {
            const responseSnippet = r.responseBody && r.responseBody !== 'Could not read response'
              ? `\n    response_body: ${String(r.responseBody).slice(0, 400)}`
              : ''
            const curlSnippet = r.curlCommand
              ? `\n    curl: ${String(r.curlCommand).replace(/\n/g, ' ').slice(0, 800)}`
              : ''
            return `  ${r.method} ${r.status} ${r.url}${responseSnippet}${curlSnippet}`
          }).join('\n')
      }
    } catch {}
  }

  userContent.push({
    type: 'text',
    text: `FAILED TEST:
Scenario: ${scenario.name}
Tag: ${mlrTag}
Feature: ${featureName}
Failed Step: "${failedStep.keyword}${failedStep.name}"
Error (Raw Log & Stack Trace): 
${rawError}
${networkContext}

Duration: ${failedStep.result?.duration}ns
Video recorded: ${videoAvailable ? 'YES' : 'NO'}

KNOWN BLOCKERS:
${KNOWN_BLOCKERS.join('\n')}

${screenshotData ? 'Failure screenshot attached.' : 'No screenshot available.'}

INSTRUCTIONS:
1. Explain the "Error (Raw Log & Stack Trace)" in plain English for a non-technical stakeholder in the "what_happened" field.
2. Provide a technical root cause in "root_cause".
3. Return the exact JSON format requested below.

Return this exact JSON:
{
  "type": "REAL_BUG" | "ENVIRONMENT_ISSUE" | "TEST_ISSUE",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "headline": "One line: clean summary of what failed",
  "what_happened": "2-3 sentences: plain English explanation of what the test was doing and what exactly went wrong",
  "root_cause": "Technical root cause explanation",
  "is_app_bug": true | false,
  "app_component": "affected component or null",
  "where_to_look": "Specific files/functions to check",
  "how_to_fix": "Step by step fix or workaround",
  "code_hint": "Specific code location if applicable or null",
  "prevention": "How to prevent this failure in future",
  "ticket_worthy": true | false,
  "ticket_title": "Ticket title if ticket_worthy",
  "ticket_body": "Full ticket description if ticket_worthy"
}`
  });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        system: 'You are a senior QA engineer and developer analyzing test failures. Respond ONLY with valid JSON. No markdown. No text outside JSON.',
        messages: [{ role: 'user', content: userContent }]
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));

    const text = data.content?.[0]?.text || '{}';
    const clean = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    const analysis = JSON.parse(clean);

    // Capture token usage from Claude response
    const tokenUsage = {
      inputTokens:  data.usage?.input_tokens  || 0,
      outputTokens: data.usage?.output_tokens || 0,
      totalTokens:  (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    };

    // Print rich terminal output
    const line = '═'.repeat(60);
    console.log('\n' + line);
    console.log(`🤖 AI ANALYSIS — ${mlrTag}`);
    console.log(line);
    console.log(`Type:       ${analysis.type} (${analysis.confidence} confidence)`);
    console.log(`Severity:   ${analysis.severity}`);
    console.log(`Headline:   ${analysis.headline}`);
    console.log(`\nWhat happened:\n  ${analysis.what_happened}`);
    console.log(`\nRoot cause:\n  ${analysis.root_cause}`);
    console.log(`\nWhere to look:\n  ${analysis.where_to_look}`);
    console.log(`\nHow to fix:\n  ${analysis.how_to_fix}`);
    if (analysis.code_hint) console.log(`\nCode hint:\n  ${analysis.code_hint}`);
    console.log(`\nPrevention:\n  ${analysis.prevention}`);
    console.log(`\nTicket worthy: ${analysis.ticket_worthy ? 'YES' : 'NO'}`);
    if (analysis.ticket_worthy) console.log(`Ticket title: ${analysis.ticket_title}`);
    console.log(`\n🪙 Tokens: ${tokenUsage.inputTokens} in · ${tokenUsage.outputTokens} out · ${tokenUsage.totalTokens} total`);
    console.log(line);

    return { ...analysis, _tokenUsage: tokenUsage };
  } catch (err) {
    console.error(`❌ AI analysis failed for ${mlrTag}:`, err.message);
    return null;
  }
}

if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'your_key_here') {
  console.log('\n⚠️  ANTHROPIC_API_KEY not set in .env — skipping AI analysis');
  doGitPush();
} else {
  let anyFailures = false;
  const reports = fs.readdirSync('docs/reports').filter(f => f.endsWith('.json') && f.startsWith('_hap_fe_'));

  // Per-scenario token breakdown collected across all modules
  const tokenBreakdown = [];
  let tokenGrandTotal = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  for (const reportFile of reports) {
    const reportPath = path.join('docs/reports', reportFile);
    const moduleName = reportFile.replace('_hap_fe_', '').replace('.json', '');

    // Load video index for this module
    const vIndexFile = path.join(videosDir, `index-${moduleName}.json`);
    const vIndex = fs.existsSync(vIndexFile) ? JSON.parse(fs.readFileSync(vIndexFile, 'utf8')) : {};

    const dashboardJson = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const featuresArray = Array.isArray(dashboardJson) ? dashboardJson : (dashboardJson.results || dashboardJson.features || dashboardJson.data || []);

    let moduleFailures = false;
    for (const feature of featuresArray) {
      for (const scenario of (feature.elements || [])) {
        const hasFailed = (scenario.steps || []).some(s => s.result?.status === 'failed');
        if (!hasFailed) continue;

        anyFailures = true;
        moduleFailures = true;
        const result = await analyzeFailure(scenario, feature.name, vIndex);
        if (result) {
          // Strip _tokenUsage from the analysis before embedding in JSON
          const { _tokenUsage, ...cleanAnalysis } = result;
          scenario.aiAnalysis = cleanAnalysis;

          // Track tokens per scenario
          if (_tokenUsage) {
            const mlrTag = (scenario.tags || []).map(t => t.name.replace('@', '')).find(t => t.startsWith('MLR-')) || '?';
            tokenBreakdown.push({
              module: moduleName,
              tag: mlrTag,
              scenario: scenario.name,
              inputTokens:  _tokenUsage.inputTokens,
              outputTokens: _tokenUsage.outputTokens,
              totalTokens:  _tokenUsage.totalTokens,
            });
            tokenGrandTotal.inputTokens  += _tokenUsage.inputTokens;
            tokenGrandTotal.outputTokens += _tokenUsage.outputTokens;
            tokenGrandTotal.totalTokens  += _tokenUsage.totalTokens;
          }
        }
      }
    }

    if (moduleFailures) {
      const enriched = JSON.stringify(dashboardJson, null, 2);
      fs.writeFileSync(reportPath, enriched);
      // Also update the run-specific copy
      fs.writeFileSync(`docs/reports/runs/${RUN_ID}/${reportFile}`, enriched);
    }
  }

  // Save token breakdown for this run
  if (tokenBreakdown.length > 0) {
    const breakdown = {
      runId: RUN_ID,
      generatedAt: new Date().toISOString(),
      scenarios: tokenBreakdown,
      total: tokenGrandTotal,
    };
    fs.mkdirSync(`docs/reports/runs/${RUN_ID}`, { recursive: true });
    fs.writeFileSync(`docs/reports/runs/${RUN_ID}/token-breakdown.json`, JSON.stringify(breakdown, null, 2));

    // Also save to pipeline-level ai-usage.json so session ledger picks it up
    fs.writeFileSync('docs/reports/ai-usage.json', JSON.stringify({
      generatedAt: new Date().toISOString(),
      runId: RUN_ID,
      ...tokenGrandTotal,
    }, null, 2));

    // Print token table to terminal
    console.log('\n🪙 TOKEN USAGE BREAKDOWN');
    console.log('─'.repeat(72));
    console.log(`${'Module'.padEnd(10)} ${'Tag'.padEnd(10)} ${'Scenario'.padEnd(36)} ${'In'.padStart(6)} ${'Out'.padStart(6)} ${'Total'.padStart(7)}`);
    console.log('─'.repeat(72));
    for (const s of tokenBreakdown) {
      console.log(
        `${s.module.padEnd(10)} ${s.tag.padEnd(10)} ${s.scenario.substring(0, 35).padEnd(36)} ` +
        `${String(s.inputTokens).padStart(6)} ${String(s.outputTokens).padStart(6)} ${String(s.totalTokens).padStart(7)}`
      );
    }
    console.log('─'.repeat(72));
    console.log(`${'TOTAL'.padEnd(58)} ${String(tokenGrandTotal.inputTokens).padStart(6)} ${String(tokenGrandTotal.outputTokens).padStart(6)} ${String(tokenGrandTotal.totalTokens).padStart(7)}`);
    console.log('─'.repeat(72));
  }

  if (anyFailures) {
    console.log('\n✅ AI analysis injected into dashboard JSON');
    if (process.env.QA_CREATE_TICKETS === '1') {
      console.log('🎫 Creating tickets...');
      execSync('node e2e/scripts/post-e2e-failures.mjs', { stdio: 'inherit' });
      console.log('✅ Tickets created');
    }
  } else {
    console.log('\n✅ All scenarios passed — no AI analysis needed');
  }
  doGitPush();
}

function doGitPush() {
  if (process.env.QA_NO_PUSH === '1') {
    console.log('\n⏭️  Skipping git push (QA_NO_PUSH=1)');
    writeSessionUsageLedger({ pushStartedAt: null, pushCompletedAt: null, pushSuccess: false, pushError: 'skipped' });
    return;
  }
  const pushStartedAt = new Date().toISOString();
  try {
    console.log('\n🚀 Pushing to GitHub...');
    execSync('git add docs/', { stdio: 'inherit' });
    execSync(`git commit -m "test: sync run ${RUN_ID}"`, { stdio: 'inherit' });
    execSync('git push origin main', { stdio: 'inherit' });
    writeSessionUsageLedger({
      pushStartedAt,
      pushCompletedAt: new Date().toISOString(),
      pushSuccess: true,
    });
    console.log('✅ Pushed to GitHub — dashboard will update shortly');
  } catch (e) {
    writeSessionUsageLedger({
      pushStartedAt,
      pushCompletedAt: new Date().toISOString(),
      pushSuccess: false,
      pushError: String(e?.message || e),
    });
    console.error('❌ Git push failed:', e.message);
  }
}
