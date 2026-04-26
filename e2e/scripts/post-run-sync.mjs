import fs from 'fs';
import path from 'path';

const RUN_ID = Date.now();
const videoSrcDir = 'codebase/_hap_fe_auth/artifacts/videos';
const cucumberJsonPath = 'codebase/_hap_fe_auth/artifacts/cucumber/cucumber.json';

// CHANGE 3: Clean up old mismatched videos
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
const webmFiles = fs.existsSync(videoSrcDir) 
  ? fs.readdirSync(videoSrcDir).filter(f => f.endsWith('.webm')).sort().reverse()
  : [];

console.log('Found videos:', webmFiles);

const allScenarios = cucumberJson.flatMap(f => f.elements || []);

allScenarios.forEach((scenario, i) => {
  const mlrTag = (scenario.tags || [])
    .map(t => t.name.replace('@',''))
    .find(t => t.startsWith('MLR-'));

  // Direct match by MLR tag in filename — no guessing
  const matchedVideo = mlrTag
    ? webmFiles.find(f => f.includes(mlrTag))
    : null;

  if (!matchedVideo) {
    console.log(`⚠️  No video found for ${mlrTag}`);
    return;
  }

  console.log(`✅ ${mlrTag} → ${matchedVideo}`);

  // Copy to dashboard with clean name
  const destName = `${RUN_ID}-${mlrTag}-test.webm`;
  
  // Copy to flat videos dir (latest)
  fs.mkdirSync('qa-dashboard/reports/videos', { recursive: true });
  fs.copyFileSync(
    path.join(videoSrcDir, matchedVideo),
    path.join('qa-dashboard/reports/videos', destName)
  );

  // Copy to run-specific dir
  const runVideoDir = `qa-dashboard/reports/runs/${RUN_ID}/videos`;
  fs.mkdirSync(runVideoDir, { recursive: true });
  fs.copyFileSync(
    path.join(videoSrcDir, matchedVideo),
    path.join(runVideoDir, destName)
  );
});

// Copy cucumber JSON to dashboard
fs.copyFileSync(
  cucumberJsonPath,
  `qa-dashboard/reports/runs/${RUN_ID}/_hap_fe_auth.json`
);
fs.copyFileSync(
  cucumberJsonPath,
  'qa-dashboard/reports/_hap_fe_auth.json'
);

// Append to run-history.json
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
  passedScenarios: passedScenarios,
  failedScenarios: allScenarios.length - passedScenarios
});
fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
console.log('✅ Updated run-history.json');


// Regenerate index.json
const allVideos = fs.readdirSync('qa-dashboard/reports/videos')
  .filter(f => f.endsWith('.webm'));
fs.writeFileSync(
  'qa-dashboard/reports/videos/index.json',
  JSON.stringify(allVideos, null, 2)
);

// CHANGE 4: Write mapping file for debugging
const mapping = {};
allScenarios.forEach((scenario, i) => {
  const mlr = (scenario.tags || [])
    .map(t => t.name.replace('@',''))
    .find(t => t.startsWith('MLR-'));
  
  const mlrTag = mlr || `scenario-${i}`;
  const matchedVideo = mlr 
    ? webmFiles.find(f => f.includes(mlr))
    : null;
    
  mapping[mlrTag] = matchedVideo || null;
});

fs.mkdirSync('qa-dashboard/reports', { recursive: true });
fs.writeFileSync(
  'qa-dashboard/reports/video-mapping.json',
  JSON.stringify(mapping, null, 2)
);
console.log('Video mapping:', mapping);
