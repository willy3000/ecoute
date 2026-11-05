// Serves dist/ the way a CDN can: gzip on everything, with Content-Length giving
// the compressed size. Used to test the install path against hosted behaviour.
// Usage: node e2e/support/compressing-server.mjs [port]
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = join(process.cwd(), 'dist');
const port = Number(process.argv[2] ?? 4199);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.zip': 'application/zip', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(root, path === '/' ? 'index.html' : path);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  const body = gzipSync(readFileSync(file));
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Content-Encoding': 'gzip', 'Content-Length': body.length });
  res.end(body);
}).listen(port, () => console.log(`serving on ${port}`));
