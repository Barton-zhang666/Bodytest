import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const port = Number(process.env.PORT || 4173);
const mime = { '.ogg': 'audio/ogg', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filename = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    const relative = path.relative(root, filename);
    if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => part.startsWith('.')) || !['index.html', 'src', 'README.md', 'README.en.md', 'LICENSE'].includes(relative.split(/[\\/]/)[0])) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    const data = await fs.readFile(filename);
    res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 400); res.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => process.stdout.write(`VITALIS 本地预览: http://127.0.0.1:${port}\n`));
