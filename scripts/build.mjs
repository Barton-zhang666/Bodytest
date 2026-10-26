import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
// 只清理当前项目固定的构建目录，避免上次构建留下本地设计文档。
if (path.relative(root, output) !== 'dist') throw new Error('构建目录必须位于项目内的 dist/');
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
for (const entry of ['index.html', 'README.md', 'README.en.md', 'LICENSE']) await fs.copyFile(path.join(root, entry), path.join(output, entry));
await fs.cp(path.join(root, 'src'), path.join(output, 'src'), { recursive: true, filter: source => !source.endsWith('.md') });
// README 预览图同样可在静态构建中查看。
await fs.cp(path.join(root, '.github/assets'), path.join(output, '.github/assets'), { recursive: true });
console.log('静态构建完成：dist/（运行资源均在本地）');
