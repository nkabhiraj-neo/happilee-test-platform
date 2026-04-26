import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { execSync } from 'child_process';

const RUN_ID = Date.now();
const videoSrcDir = 'codebase/_hap_fe_auth/artifacts/videos';
const cucumberJsonPath = 'codebase/_hap_fe_auth/artifacts/cucumber/cucumber.json';

// Clean up old videos from flat dir
const videosDir = 'qa-dashboard/reports/videos';
if (fs.existsSync(videosDir)) {
  fs.readdirSync(videosDir)
    .filter(f => f.endsWith('.webm'))
    .forEach(f => fs.unlinkSync(path.join(videosDir, f)));
}
console.log('🧹 Cleared old videos');

if (!fs.existsSync(cucumberJsonPath)) {
  console.error('❌ Cucumber JSON not found!');
  process.exit(1);
}

const cucumberJson = JSON.parse(fs.readFileSync(cucumberJsonPath, 'utf8'));
const allScenarios = cucumberJson.flatMap(f => f.elements || []);

// ── Build sorted list of all .webm files with mtime ──────────────────────────
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

console.log(`Found ${namedVideos.length} named videos, ${hashVideos.length} hash (tab) videos`);

// ── Only consider the LATEST named video per MLR tag ─────────────────────────
// Group named videos by MLR tag, take the most recent one for each
const latestByTag = {};
namedVideos.forEach(vid => {
  const mlrMatch = vid.name.match(/MLR-(\d+)/);
  if (!mlrMatch) return;
  const mlrTag = `MLR-${mlrMatch[1]}`;
  if (!latestByTag[mlrTag] || vid.mtime > latestByTag[mlrTag].mtime) {
    latestByTag[mlrTag] = vid;
  }
});

// Sort by mtime so we can compute next-video windows correctly
const latestNamedVideos = Object.values(latestByTag).sort((a, b) => a.mtime - b.mtime);

console.log('Latest named videos per tag:');
latestNamedVideos.forEach(v => console.log(`  ${v.name} @ ${new Date(v.mtime).toISOString()}`));

// ── Assign each hash video to the named video that comes immediately AFTER it ─
// A Yopmail tab opens DURING a scenario, so its mtime is BEFORE the scenario ends.
// The first named video whose mtime is GREATER than the hash video's mtime
// is the scenario that opened it.

const videoIndex = {};

// Pre-populate all tags with null yopmail
latestNamedVideos.forEach(vid => {
  const mlrMatch = vid.name.match(/MLR-(\d+)/);
  if (!mlrMatch) return;
  videoIndex[`MLR-${mlrMatch[1]}`] = { app: null, yopmail: null };
});

// For each hash video, find the first named video whose mtime > hash mtime
hashVideos.forEach(hashVid => {
  const owner = latestNamedVideos.find(named => named.mtime > hashVid.mtime);
  if (owner) {
    const mlrMatch = owner.name.match(/MLR-(\d+)/);
    if (mlrMatch) {
      const mlrTag = `MLR-${mlrMatch[1]}`;
      // Only assign if not already claimed (first hash wins)
      if (!videoIndex[mlrTag]?.yopmail) {
        console.log(`  Assigning hash ${hashVid.name} → ${mlrTag} (named mtime: ${new Date(owner.mtime).toISOString()})`);
        videoIndex[mlrTag].yopmail = hashVid;  // store object temporarily
      }
    }
  }
});

latestNamedVideos.forEach((mainVid, index) => {
  const mlrMatch = mainVid.name.match(/MLR-(\d+)/);
  if (!mlrMatch) return;
  const mlrTag = `MLR-${mlrMatch[1]}`;

  console.log(`${mlrTag}: app=${mainVid.name}`);
  const yopmailVidObj = videoIndex[mlrTag]?.yopmail;
  console.log(`${mlrTag}: yopmail=${yopmailVidObj?.name || 'none'}`);

  // Reset to strings for the final index
  videoIndex[mlrTag] = { app: null, yopmail: null };

  // Copy app video
  const appDest = `${RUN_ID}-${mlrTag}-app.webm`;
  fs.mkdirSync(videosDir, { recursive: true });
  fs.copyFileSync(mainVid.path, path.join(videosDir, appDest));

  // Copy run-specific app video
  const runVideosDir = `qa-dashboard/reports/runs/${RUN_ID}/videos`;
  fs.mkdirSync(runVideosDir, { recursive: true });
  fs.copyFileSync(mainVid.path, path.join(runVideosDir, appDest));

  videoIndex[mlrTag].app = appDest;

  // Copy yopmail video if found
  if (yopmailVidObj) {
    const yopmailDest = `${RUN_ID}-${mlrTag}-yopmail.webm`;
    fs.copyFileSync(yopmailVidObj.path, path.join(videosDir, yopmailDest));
    fs.copyFileSync(yopmailVidObj.path, path.join(runVideosDir, yopmailDest));
    videoIndex[mlrTag].yopmail = yopmailDest;
    console.log(`✅ ${mlrTag}: stitched yopmail video → ${yopmailDest}`);
  } else {
    console.log(`✅ ${mlrTag}: no yopmail tab video found`);
  }
});

// ── Write index.json (object keyed by MLR tag) ───────────────────────────────
fs.mkdirSync(videosDir, { recursive: true });
fs.writeFileSync(
  path.join(videosDir, 'index.json'),
  JSON.stringify(videoIndex, null, 2)
);

const runVideosDir = `qa-dashboard/reports/runs/${RUN_ID}/videos`;
fs.mkdirSync(runVideosDir, { recursive: true });
fs.writeFileSync(
  path.join(runVideosDir, 'index.json'),
  JSON.stringify(videoIndex, null, 2)
);

console.log('\nVideo index written:');
console.log(JSON.stringify(videoIndex, null, 2));

// ── Copy cucumber JSON to dashboard ──────────────────────────────────────────
fs.mkdirSync(`qa-dashboard/reports/runs/${RUN_ID}`, { recursive: true });
fs.copyFileSync(cucumberJsonPath, `qa-dashboard/reports/runs/${RUN_ID}/_hap_fe_auth.json`);
fs.copyFileSync(cucumberJsonPath, 'qa-dashboard/reports/_hap_fe_auth.json');

// ── Append to run-history.json ────────────────────────────────────────────────
const historyPath = 'qa-dashboard/reports/run-history.json';
let history = [];
if (fs.existsSync(historyPath)) {
  history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
}
const passedScenarios = allScenarios.filter(s =>
  (s.steps || []).every(st => st.result?.status === 'passed' || st.hidden)
).length;
history.push({
  id: RUN_ID,
  timestamp: new Date().toISOString(),
  totalScenarios: allScenarios.length,
  passedScenarios,
  failedScenarios: allScenarios.length - passedScenarios
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
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const KNOWN_BLOCKERS = [
  'MLR-203: Yopmail CAPTCHA blocks automated OTP fetch — this is an ENVIRONMENT_ISSUE not a real bug',
  'Timeout errors on yopmail.com are caused by bot detection CAPTCHA'
];

async function analyzeFailure(scenario, featureName) {
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
  userContent.push({
    type: 'text',
    text: `FAILED TEST:
Scenario: ${scenario.name}
Tag: ${mlrTag}
Feature: ${featureName}
Failed Step: "${failedStep.keyword}${failedStep.name}"
Error: ${failedStep.result?.error_message || 'No error message'}
Duration: ${failedStep.result?.duration}ns
Video recorded: ${videoAvailable ? 'YES' : 'NO'}

KNOWN BLOCKERS:
${KNOWN_BLOCKERS.join('\n')}

${screenshotData ? 'Failure screenshot attached.' : 'No screenshot available.'}

Return this exact JSON:
{
  "type": "REAL_BUG" | "ENVIRONMENT_ISSUE" | "TEST_ISSUE",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "headline": "One line: what failed",
  "what_happened": "2-3 sentences: what the test was doing when it failed",
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
        model: 'claude-sonnet-4-20250514',
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
    console.log(line);

    return analysis;
  } catch (err) {
    console.error(`❌ AI analysis failed for ${mlrTag}:`, err.message);
    return null;
  }
}

if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'your_key_here') {
  console.log('\n⚠️  ANTHROPIC_API_KEY not set in .env — skipping AI analysis');
  doGitPush();
} else {
  const dashboardJson = JSON.parse(
    fs.readFileSync('qa-dashboard/reports/_hap_fe_auth.json', 'utf8')
  );
  const featuresArray = Array.isArray(dashboardJson)
    ? dashboardJson
    : (dashboardJson.results || []);

  let hasFailures = false;

  for (const feature of featuresArray) {
    for (const scenario of (feature.elements || [])) {
      const hasFailed = (scenario.steps || []).some(s => s.result?.status === 'failed');
      if (!hasFailed) continue;

      hasFailures = true;
      const analysis = await analyzeFailure(scenario, feature.name);
      if (analysis) scenario.aiAnalysis = analysis;
    }
  }

  if (hasFailures) {
    const enriched = JSON.stringify(dashboardJson, null, 2);
    fs.writeFileSync('qa-dashboard/reports/_hap_fe_auth.json', enriched);
    fs.writeFileSync(`qa-dashboard/reports/runs/${RUN_ID}/_hap_fe_auth.json`, enriched);
    console.log('\n✅ AI analysis injected into dashboard JSON');

    // Ask user about ticket creation
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('\n📋 Create Jira + GitHub tickets for failed scenarios? (yes/no): ', async (answer) => {
      rl.close();
      if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
        console.log('🎫 Creating tickets...');
        execSync('node e2e/scripts/post-e2e-failures.mjs', { stdio: 'inherit' });
        console.log('✅ Tickets created');
      } else {
        console.log('⏭️  Skipping ticket creation');
      }
      doGitPush();
    });
  } else {
    console.log('\n✅ All scenarios passed — no AI analysis needed');
    doGitPush();
  }
}

function doGitPush() {
  try {
    console.log('\n🚀 Pushing to GitHub...');
    execSync('git add qa-dashboard/', { stdio: 'inherit' });
    execSync(`git commit -m "test: sync run ${RUN_ID}"`, { stdio: 'inherit' });
    execSync('git push origin main', { stdio: 'inherit' });
    console.log('✅ Pushed to GitHub — dashboard will update shortly');
  } catch (e) {
    console.error('❌ Git push failed:', e.message);
  }
}
