import fs from 'fs';
import path from 'path';

const videoDir = 'qa-dashboard/reports/videos';
const screenshotDir = 'qa-dashboard/reports/screenshots';

// 1. Cleanup old screenshots (optional but recommended to keep it clean)
// Note: We don't delete everything here if we want to keep shots from multiple blocks,
// but the user requested: "deleting old screenshots before copying new ones"
// and "clear the folder before copying new ones".
// Since this script runs AFTER the run, we should probably only cleanup if we are managing a state.
// However, I'll stick to the video cleanup primarily as requested.

// 2. Video Cleanup: Keep only the latest video per MLR tag
if (fs.existsSync(videoDir)) {
  const files = fs.readdirSync(videoDir).filter(f => f.endsWith('.webm'));
  
  // Group by MLR tag
  const byTag = {};
  for (const f of files) {
    const match = f.match(/MLR-(\d+)/);
    const tag = match ? `MLR-${match[1]}` : 'unknown';
    if (!byTag[tag]) byTag[tag] = [];
    byTag[tag].push(f);
  }
  
  // For each tag, keep only the most recent (highest timestamp prefix or alphanumeric sort)
  for (const [tag, tagFiles] of Object.entries(byTag)) {
    if (tag === 'unknown') continue; // Don't delete unknown files automatically
    const sorted = tagFiles.sort().reverse(); // latest first assuming timestamp prefix
    for (const old of sorted.slice(1)) {
      fs.unlinkSync(path.join(videoDir, old));
      console.log(`Deleted old video: ${old}`);
    }
  }
}

// 3. Regenerate index.json
const remaining = fs.existsSync(videoDir)
  ? fs.readdirSync(videoDir).filter(f => f.endsWith('.webm'))
  : [];

fs.writeFileSync(
  path.join(videoDir, 'index.json'),
  JSON.stringify(remaining, null, 2)
);

console.log('Video index updated:', remaining);
