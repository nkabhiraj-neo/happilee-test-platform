import fs from 'fs';
import path from 'path';

const dir = 'qa-dashboard/reports/videos';
const files = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter(f => f.endsWith('.webm'))
  : [];

fs.writeFileSync(
  'qa-dashboard/reports/videos/index.json',
  JSON.stringify(files, null, 2)
);

console.log('Video index written:', files);
