import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
async function visit(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(filename);
    else if (/\.(m?js)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
      if (result.status !== 0) { process.stderr.write(result.stderr); process.exitCode = 1; }
    }
  }
}
for (const directory of ['src', 'scripts', 'tests']) await visit(directory);
if (!process.exitCode) console.log('全部 JavaScript 语法检查通过。');
