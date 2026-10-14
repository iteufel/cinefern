const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  protocol,
  net,
  shell,
} = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { pipeline } = require('node:stream/promises');
const { Readable, Transform } = require('node:stream');
const { randomUUID } = require('node:crypto');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'cinefern',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
let window;
const active = new Map();
const streams = new Map();
const developmentUrl = process.env.CINEFERN_DEV_URL;
const rendererDirectory = () =>
  app.isPackaged
    ? path.join(process.resourcesPath, 'renderer')
    : path.resolve(__dirname, '../../dist');
const downloadDirectory = () => path.join(app.getPath('userData'), 'downloads');
const cleanId = (id) => {
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(id))
    throw new Error('Invalid download id.');
  return id;
};
function networkUrl(value) {
  const url = new URL(value);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error('Only HTTP(S) URLs are allowed.');
  return url.href;
}
function trusted(event) {
  const uri = event.senderFrame?.url;
  if (
    !uri ||
    (uri !== 'cinefern://app/' &&
      !uri.startsWith('cinefern://app/') &&
      !(
        developmentUrl && new URL(uri).origin === new URL(developmentUrl).origin
      ))
  )
    throw new Error('Untrusted renderer.');
}
function handle(name, fn) {
  ipcMain.handle(name, async (event, ...args) => {
    trusted(event);
    return fn(event, ...args);
  });
}
function createWindow() {
  window = new BrowserWindow({
    title: 'Cinefern',
    width: 1400,
    height: 940,
    minWidth: 420,
    minHeight: 600,
    backgroundColor: '#0c1015',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    const allowed = developmentUrl
      ? new URL(url).origin === new URL(developmentUrl).origin
      : url.startsWith('cinefern://app/');
    if (!allowed) event.preventDefault();
  });
  window.loadURL(developmentUrl || 'cinefern://app/');
  if (process.env.CINEFERN_DEVTOOLS === '1')
    window.webContents.openDevTools({ mode: 'detach' });
  window.on('closed', () => {
    window = undefined;
  });
}
app.whenReady().then(async () => {
  protocol.handle('cinefern', async (request) => {
    const url = new URL(request.url);
    if (url.hostname === 'stream') {
      const descriptor = streams.get(url.pathname.slice(1));
      if (!descriptor) return new Response('Stream expired', { status: 404 });
      const headers = { ...descriptor.headers };
      const range = request.headers.get('range');
      if (range) headers.Range = range;
      const response = await net.fetch(descriptor.url, {
        headers,
        signal: request.signal,
      });
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set(
        'Access-Control-Allow-Origin',
        developmentUrl ? new URL(developmentUrl).origin : 'cinefern://app',
      );
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    }
    if (url.hostname === 'media') {
      const id = cleanId(url.pathname.slice(1));
      return net.fetch(
        pathToFileURL(path.join(downloadDirectory(), id + '.mp4')).href,
        { headers: request.headers },
      );
    }
    if (url.hostname !== 'app')
      return new Response('Not found', { status: 404 });
    let relative;
    try {
      relative = decodeURIComponent(url.pathname);
    } catch {
      return new Response('Invalid path', { status: 400 });
    }
    const root = rendererDirectory();
    const target = path.resolve(
      root,
      '.' + (relative === '/' ? '/index.html' : relative),
    );
    if (target !== root && !target.startsWith(root + path.sep))
      return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(target).href);
  });
  app.on('web-contents-created', (_, contents) => {
    contents.session.setPermissionRequestHandler((_, permission, callback) =>
      callback(['fullscreen', 'mediaKeySystem'].includes(permission)),
    );
  });
  handle('provider:request', async (_, url, options = {}) => {
    const response = await net.fetch(networkUrl(url), {
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body,
      signal: AbortSignal.timeout(25_000),
    });
    const body = await response.text();
    if (body.length > 5_000_000)
      throw new Error('Provider response is too large.');
    return {
      ok: response.ok,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    };
  });
  handle('media:file', async (_, uri, headers = {}) => {
    const url = networkUrl(uri);
    if (
      Object.keys(headers).length > 50 ||
      Object.entries(headers).some(
        ([key, value]) =>
          typeof value !== 'string' || /[\r\n]/.test(key + value),
      )
    )
      throw new Error('Invalid media headers.');
    const token = randomUUID();
    if (streams.size >= 100) streams.delete(streams.keys().next().value);
    streams.set(token, { url, headers });
    return 'cinefern://stream/' + token;
  });
  handle('media:release', async (_, uri) => {
    const url = new URL(uri);
    if (url.protocol !== 'cinefern:' || url.hostname !== 'stream')
      throw new Error('Invalid media stream.');
    streams.delete(url.pathname.slice(1));
  });
  handle('download:start', async (event, request) => {
    const id = cleanId(request.id);
    if (active.has(id)) throw new Error('Download already running.');
    const controller = new AbortController();
    active.set(id, controller);
    await fsp.mkdir(downloadDirectory(), { recursive: true });
    const target = path.join(downloadDirectory(), id + '.mp4');
    const partial = target + '.part';
    try {
      const response = await net.fetch(networkUrl(request.url), {
        headers: request.headers,
        signal: controller.signal,
      });
      if (!response.ok || !response.body)
        throw new Error('Download failed (HTTP ' + response.status + ').');
      const totalBytes =
        Number(response.headers.get('content-length')) || undefined;
      let bytes = 0,
        lastUpdate = 0;
      const counter = new Transform({
        transform(chunk, _, callback) {
          bytes += chunk.length;
          if (Date.now() - lastUpdate > 500 && !event.sender.isDestroyed()) {
            lastUpdate = Date.now();
            event.sender.send('download:progress', { id, bytes, totalBytes });
          }
          callback(null, chunk);
        },
      });
      await pipeline(
        Readable.fromWeb(response.body),
        counter,
        fs.createWriteStream(partial),
        { signal: controller.signal },
      );
      await fsp.rename(partial, target);
      return 'cinefern://media/' + id;
    } catch (error) {
      await fsp.rm(partial, { force: true });
      throw error;
    } finally {
      active.delete(id);
    }
  });
  handle('download:cancel', async (_, id) => {
    active.get(cleanId(id))?.abort();
  });
  handle('download:remove', async (_, uri) => {
    const url = new URL(uri);
    if (url.protocol !== 'cinefern:' || url.hostname !== 'media')
      throw new Error('Invalid downloaded file.');
    await fsp.rm(
      path.join(downloadDirectory(), cleanId(url.pathname.slice(1)) + '.mp4'),
      { force: true },
    );
  });
  handle('window:float', async (_, enabled) => {
    window?.setAlwaysOnTop(Boolean(enabled));
  });
  handle('window:external', async (_, uri) => {
    await shell.openExternal(networkUrl(uri));
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { role: 'fileMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]),
  );
  createWindow();
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => {
  for (const controller of active.values()) controller.abort();
});
