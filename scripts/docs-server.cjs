#!/usr/bin/env node
'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// Gorilla docs server. Zero-dependency Node http server (sibling of
// scripts/mocks-server.cjs). Serves the /documentation folder as a browsable,
// markdown-rendered doc site at http://localhost:5051/.
//
//   npm run docs   →   open http://localhost:5051/
//
// The browser viewer (documentation/index.html) renders markdown client-side
// (marked + mermaid + highlight.js via CDN — see that file). This server only
// needs to (a) serve static files and (b) expose a manifest of the .md files so
// the sidebar builds itself. Add a new doc by dropping an `.md` into
// /documentation — it appears in the nav automatically (no server change).
// ─────────────────────────────────────────────────────────────────────────────
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.DOCS_PORT) || 5051;
const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'documentation');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

// Preferred sidebar order; anything not listed is appended alphabetically.
const ORDER = ['index.md', 'architecture.md', 'pages.md'];

// First "# Heading" in a markdown file → nav title (falls back to the filename).
function titleOf(file) {
  try {
    const text = fs.readFileSync(path.join(DOCS_DIR, file), 'utf8');
    const m = text.match(/^\s*#\s+(.+?)\s*$/m);
    if (m) return m[1].replace(/[*_`]/g, '');
  } catch (_) { /* fall through */ }
  return file.replace(/\.md$/, '').replace(/[-_]/g, ' ');
}

function manifest() {
  let files = [];
  try {
    files = fs.readdirSync(DOCS_DIR).filter((f) => f.toLowerCase().endsWith('.md'));
  } catch (_) { files = []; }
  files.sort((a, b) => {
    const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib);
    return a.localeCompare(b);
  });
  return files.map((f) => ({ file: f, slug: f.replace(/\.md$/, ''), title: titleOf(f) }));
}

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
}

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);

  // Manifest endpoint — the viewer fetches this to build the sidebar.
  if (url === '/docs.json') {
    return send(res, 200, MIME['.json'], JSON.stringify(manifest(), null, 2));
  }

  // Root → the viewer shell.
  if (url === '/' || url === '/documentation' || url === '/documentation/') {
    url = '/documentation/index.html';
  }
  // Bare doc slugs (/architecture) resolve to the viewer; it reads the hash.
  if (/^\/[a-z0-9-]+$/i.test(url) && !path.extname(url)) {
    url = '/documentation/index.html';
  }

  const file = path.resolve(ROOT, '.' + url);

  // Scope serving to the documentation folder only — this is a docs server, not a
  // repo file browser. Also blocks any `..` traversal above it.
  if (!file.startsWith(DOCS_DIR + path.sep) && file !== DOCS_DIR) {
    return send(res, 403, 'text/plain', 'Forbidden');
  }

  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'text/plain', 'Not found: ' + url);
    send(res, 200, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', data);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log('\n  Gorilla docs  →  http://localhost:' + PORT + '/\n');
});
