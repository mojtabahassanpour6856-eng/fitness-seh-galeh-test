'use strict';
const path = require('node:path');
const fs = require('node:fs');
const sharp = require('sharp');
const root = process.cwd();
const tasks = [
  ['assets/auth/trainee-entry.png', 'assets/auth/trainee-entry.webp', 80],
  ['assets/auth/coach-entry.png', 'assets/auth/coach-entry.webp', 80],
  ['icon.svg', 'icon.webp', 82]
];
(async () => {
  for (const [input, output, quality] of tasks) {
    const source = path.join(root, input);
    const target = path.join(root, output);
    await sharp(source, { failOn: 'error' }).rotate().webp({ quality, effort: 5 }).toFile(target);
    const before = fs.statSync(source).size;
    const after = fs.statSync(target).size;
    console.log(input + ' -> ' + output + ': ' + before + ' -> ' + after + ' bytes (' + Math.round((1-after/before)*100) + '% smaller)');
  }
  // The PNG originals remain safely stored in Git; omit them only from the published artifact.
  for (const input of ['assets/auth/trainee-entry.png', 'assets/auth/coach-entry.png']) {
    fs.rmSync(path.join(root, input), { force: true });
  }
})().catch(error => { console.error(error); process.exit(1); });
