#!/usr/bin/env node
'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 5050;
const ROOT = path.resolve(__dirname, '..');

const MIME = {
  '.html':  'text/html; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  '.js':    'application/javascript; charset=utf-8',
  '.svg':   'image/svg+xml',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.webp':  'image/webp',
  '.gif':   'image/gif',
  '.ico':   'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff':  'font/woff',
  '.md':    'text/plain; charset=utf-8',
  '.json':  'application/json; charset=utf-8',
};

http.createServer((req, res) => {
  let url = req.url.split('?')[0];

  // Root / bare mocks path → redirect so relative links resolve under /mocks/
  if (url === '/' || url === '/mocks') {
    res.writeHead(302, { 'Location': '/mocks/' });
    res.end();
    return;
  }
  // /mocks/ → serve index
  if (url === '/mocks/') {
    url = '/mocks/index.html';
  }

  const file = path.join(ROOT, url);

  // Prevent path traversal
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const serve = (filePath) => {
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found: ' + url);
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type':  MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  };

  // Directory request (e.g. /mocks/logos or /mocks/logos/) → serve its index.html
  // so any child mock folder is reachable without naming the file explicitly.
  fs.stat(file, (err, stats) => {
    serve(!err && stats.isDirectory() ? path.join(file, 'index.html') : file);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log('\n  Gorilla mocks  →  http://localhost:' + PORT + '/\n');
});
