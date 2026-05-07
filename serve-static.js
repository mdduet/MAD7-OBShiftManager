const http = require('http');
const fs = require('fs');
const path = require('path');

const port = parseInt(process.env.PORT || process.env.SERVE_PORT || '8000', 10);
const rootDir = process.cwd();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm'
};

function safeJoin(base, target) {
  const targetPath = '.' + path.posix.normalize('/' + target);
  return path.join(base, targetPath);
}

function sendResponse(res, code, headers, body) {
  res.writeHead(code, headers);
  if (body) {
    res.end(body);
  } else {
    res.end();
  }
}

const server = http.createServer((req, res) => {
  try {
    const decodedUrl = decodeURIComponent(req.url.split('?')[0] || '');
    let filePath = decodedUrl === '/' ? '/index.html' : decodedUrl;
    const absPath = safeJoin(rootDir, filePath);

    if (!absPath.startsWith(rootDir)) {
      return sendResponse(res, 403, { 'Content-Type': 'text/plain' }, 'Forbidden');
    }

    fs.stat(absPath, (err, stats) => {
      if (err || !stats.isFile()) {
        return sendResponse(res, 404, { 'Content-Type': 'text/plain' }, 'Not Found');
      }

      const ext = path.extname(absPath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      const stream = fs.createReadStream(absPath);

      res.writeHead(200, { 'Content-Type': contentType });
      stream.pipe(res);
      stream.on('error', () => sendResponse(res, 500, { 'Content-Type': 'text/plain' }, 'Server Error'));
    });
  } catch (error) {
    sendResponse(res, 500, { 'Content-Type': 'text/plain' }, 'Server Error');
  }
});

server.listen(port, () => {
  console.log(`✅ Static server running at http://localhost:${port}`);
  console.log(`📂 Serving files from ${rootDir}`);
});

server.on('error', err => {
  console.error('Static server error:', err.message);
  process.exit(1);
});
