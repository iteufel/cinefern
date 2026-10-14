import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { buildSite, siteDirectory } from './build-site.mjs';

const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}
await buildSite();

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const url = new URL(request.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    // Both URLs work so the project-relative GitHub Pages path can be checked.
    if (pathname === '/cinefern') {
      response.writeHead(302, { Location: '/cinefern/' }).end();
      return;
    }
    if (pathname.startsWith('/cinefern/'))
      pathname = pathname.slice('/cinefern'.length);
    const filePath = path.resolve(
      siteDirectory,
      `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`,
    );
    if (!filePath.startsWith(`${siteDirectory}${path.sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    if (!(await stat(filePath)).isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    const data = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type':
        contentTypes[path.extname(filePath)] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch (error) {
    if (error instanceof URIError) response.writeHead(400).end('Bad request');
    else if (error.code === 'ENOENT' || error.code === 'ENOTDIR')
      response.writeHead(404).end('Not found');
    else {
      console.error(error);
      response.writeHead(500).end('Server error');
    }
  }
});

server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Local: http://127.0.0.1:${port}/cinefern/`);
  console.log('After editing website/, run npm run site:build and refresh.');
});
