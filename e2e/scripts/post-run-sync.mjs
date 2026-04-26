import fs from 'fs';
import path from 'path';

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
