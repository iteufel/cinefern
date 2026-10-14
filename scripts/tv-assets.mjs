import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const directory = fileURLToPath(new URL('../assets/tv/', import.meta.url));
await mkdir(directory, { recursive: true });

function svg(width, height, body, viewBox = '0 0 1280 768') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">${body}</svg>`;
}
const background = `<defs><radialGradient id="glow"><stop stop-color="#285a4c"/><stop offset="1" stop-color="#0c1015"/></radialGradient></defs><rect width="1280" height="768" fill="url(#glow)"/><path d="M-60 720 Q640 0 1340 720" fill="none" stroke="#345a4a" stroke-width="2"/>`;
const mark = `<rect x="432" y="176" width="416" height="416" rx="118" fill="#a4e3c6"/><path d="M590 280 L590 488 Q590 502 603 494 L762 397 Q782 384 762 371 L603 274 Q590 266 590 280" fill="#0c1015"/>`;
async function render(name, source) {
  const png = new Resvg(source, {
    font: { loadSystemFonts: true, defaultFontFamily: 'Arial' },
  })
    .render()
    .asPng();
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
      <rect width="170" height="170" rx="48" fill="#a4e3c6"/>
      <path d="M64 43 L64 127 L129 85 Z" fill="#0c1015"/>
      <text x="214" y="126" fill="#eef0f3" font-family="Arial" font-size="128" font-weight="700" letter-spacing="-5">cine<tspan fill="#a4e3c6">fern</tspan></text>
      <text x="220" y="207" fill="#b5c9be" font-family="Arial" font-size="25" letter-spacing="5">YOUR CINEMA. EVERYWHERE.</text>
    </g>`,
      `0 0 ${logicalWidth} 720`,
    ),
  );
}
