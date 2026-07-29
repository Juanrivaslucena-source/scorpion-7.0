#!/usr/bin/env node
/**
 * scripts/dev-server.js
 * Zero-dependency static server for local development.
 *
 *   node scripts/dev-server.js            # http://localhost:4173
 *   node scripts/dev-server.js --port 8080
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const portFlag = argv.indexOf('--port');
const PORT = Number(process.env.PORT || (portFlag > -1 ? argv[portFlag + 1] : 0)) || 4173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let rel = url === '/' ? '/index.html' : url;
  let file = path.join(ROOT, rel);

  // keep requests inside the project directory
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(file, (err, stat) => {
    if (err || stat.isDirectory()) {
      const fallback = path.join(file, 'index.html');
      if (!err && stat.isDirectory() && fs.existsSync(fallback)) {
        return send(fallback, res);
      }
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<h1>404</h1><p>Not found: ' + rel + '</p>');
    }
    send(file, res);
  });
});

function send(file, res) {
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

server.listen(PORT, () => {
  console.log(`\n  Scorpion dev server\n  → http://localhost:${PORT}\n  serving ${ROOT}\n`);
});
