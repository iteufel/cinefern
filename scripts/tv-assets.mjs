import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';

const directory = fileURLToPath(new URL('../assets/tv/', import.meta.url));
await mkdir(directory, { recursive: true });

function svg(width, height, body, viewBox = '0 0 1280 768') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">${body}</svg>`;
}
// Package the same generated master into the existing vector TV asset system.
const master = (
  await readFile(new URL('../assets/icon.png', import.meta.url))
).toString('base64');
const background = `<defs><radialGradient id="glow"><stop stop-color="#1b3e30"/><stop offset="1" stop-color="#080c0a"/></radialGradient></defs><rect width="1280" height="768" fill="url(#glow)"/>`;
const mark = `<defs><clipPath id="mask"><rect x="410" y="154" width="460" height="460" rx="110"/></clipPath></defs><image x="410" y="154" width="460" height="460" href="data:image/png;base64,${master}" clip-path="url(#mask)"/>`;
async function render(name, source, opaque = false) {
  let png = new Resvg(source, {
    font: { loadSystemFonts: true, defaultFontFamily: 'Arial' },
  })
    .render()
    .asPng();
  if (opaque) {
    const decoded = PNG.sync.read(png);
    for (let i = 3; i < decoded.data.length; i += 4)
      if (decoded.data[i] !== 255) throw new Error(name + ' must be opaque.');
    png = PNG.sync.write(decoded, { colorType: 2 });
  }
  await writeFile(path.join(directory, name), png);
  console.log(name);
}
for (const [width, height] of [
  [1280, 768],
  [400, 240],
  [800, 480],
]) {
  await render(
    `icon-back-${width}x${height}.png`,
    svg(width, height, background),
    true,
  );
  await render(`icon-front-${width}x${height}.png`, svg(width, height, mark));
}
for (const [width, height] of [
  [1920, 720],
  [3840, 1440],
  [2320, 720],
  [4640, 1440],
]) {
  const logicalWidth = (width * 720) / height;
  const left = logicalWidth / 2 - 345;
  await render(
    `shelf-${width}x${height}.png`,
    svg(
      width,
      height,
      `
    <defs><radialGradient id="bg"><stop stop-color="#204638"/><stop offset="1" stop-color="#0c1015"/></radialGradient></defs>
    <rect width="${logicalWidth}" height="720" fill="url(#bg)"/>
    <g transform="translate(${left}, 230)">
      <defs><clipPath id="shelf-mask"><rect width="170" height="170" rx="42"/></clipPath></defs>
      <image width="170" height="170" href="data:image/png;base64,${master}" clip-path="url(#shelf-mask)"/>
      <text x="214" y="126" fill="#f5f5f7" font-family="Helvetica Neue" font-size="128" font-weight="700" letter-spacing="-5">Cinefern</text>
      <text x="220" y="194" fill="#b5c9be" font-family="Helvetica Neue" font-size="29">Your cinema. Everywhere.</text>
    </g>`,
      `0 0 ${logicalWidth} 720`,
    ),
    true,
  );
}
