const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const distDir = path.resolve(__dirname, '..', 'dist');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

function sendFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const type = mimeTypes[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const rawUrl = req.url || '/';
  const urlPath = decodeURIComponent(rawUrl.split('?')[0]);
  const safePath = path.normalize(urlPath).replace(/^(\.\.[\\/])+/, '');
  let filePath = path.join(distDir, safePath);

  if (urlPath === '/') {
    filePath = path.join(distDir, 'index.html');
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) {
      return sendFile(path.join(filePath, 'index.html'), res);
    }

    if (!err && stat.isFile()) {
      return sendFile(filePath, res);
    }

    return sendFile(path.join(distDir, 'index.html'), res);
  });
});

server.listen(port, host, () => {
  console.log(`Preview server running at http://${host}:${port}`);
});
