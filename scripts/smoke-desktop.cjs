const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

app.setPath(
  'userData',
  path.join(process.env.TMPDIR || '/tmp', 'cinefern-desktop-smoke'),
);
require('../apps/desktop/main.cjs');
let finished = false;
async function stop(code) {
  if (finished) return;
  finished = true;
  app.exit(code);
}
app.whenReady().then(async () => {
  try {
    const deadline = Date.now() + 25_000;
    let result;
    while (Date.now() < deadline) {
      const window = BrowserWindow.getAllWindows()[0];
      if (window && !window.webContents.isLoading()) {
        result = await window.webContents.executeJavaScript(
          '({title:document.title,text:document.body.innerText,bridge:typeof window.cinefern?.request,platform:window.cinefern?.platform})',
        );
        if (result.text.includes('Your next story starts here.')) {
          if (result.bridge !== 'function')
            throw new Error('Preload bridge is missing.');
          let mediaProxy;
          if (process.env.CINEFERN_SMOKE_MEDIA) {
            mediaProxy = await window.webContents.executeJavaScript(
              '(async () => { const uri = await window.cinefern.fileSource(' +
                JSON.stringify(process.env.CINEFERN_SMOKE_MEDIA) +
                ', {"X-Cinefern-Test":"proxy"}); const response = await fetch(uri); const data = await response.arrayBuffer(); await window.cinefern.releaseFileSource(uri); return {status:response.status,bytes:data.byteLength}; })()',
            );
            if (mediaProxy.status !== 200 || mediaProxy.bytes < 1000)
              throw new Error('Protected file proxy failed.');
          }
          await fs.mkdir('artifacts', { recursive: true });
          await fs.writeFile(
            'artifacts/desktop-smoke.png',
            (await window.webContents.capturePage()).toPNG(),
          );
          console.log(
            JSON.stringify({
              title: result.title,
              platform: result.platform,
              bridge: result.bridge,
              booted: true,
              mediaProxy,
            }),
          );
          return stop(0);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('Desktop app did not boot: ' + JSON.stringify(result));
  } catch (error) {
    console.error(error);
    await stop(1);
  }
});
setTimeout(() => void stop(1), 30_000);
