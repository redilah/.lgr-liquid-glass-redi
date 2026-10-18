/**
 * LIQUID GLASS REDI (LGR) — STANDALONE LAB SERVER
 * Serves the LGR Interactive Visual Workbench on http://localhost:4321/lab/index.html
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4321;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glsl': 'text/plain; charset=utf-8',
  '.lgr': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const cleanUrl = (req.url === '/' ? '/lab/index.html' : req.url).split('?')[0];
  const filePath = path.join(__dirname, cleanUrl);

  if (!filePath.startsWith(__dirname) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`======================================================================`);
  console.log(`  LGR INTERACTIVE VISUAL LAB AKTIF DI: http://localhost:${PORT}/lab/index.html`);
  console.log(`======================================================================`);
});
