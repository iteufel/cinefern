import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Packaging only: the opaque 1024px master is generated artwork. iOS applies
// its own icon mask. Run on macOS to rebuild the desktop image containers.
const assets = fileURLToPath(new URL('../assets/', import.meta.url));
const source = path.join(assets, 'icon.png');
const temporary = await mkdtemp(path.join(tmpdir(), 'cinefern-icons-'));
try {
  const iconset = path.join(temporary, 'Cinefern.iconset');
  await mkdir(iconset);
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const pixels = size * scale;
      execFileSync(
        'sips',
        [
          '-z',
          String(pixels),
          String(pixels),
          source,
          '--out',
          path.join(
            iconset,
            `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`,
          ),
        ],
        { stdio: 'ignore' },
      );
    }
  }
  execFileSync('iconutil', [
    '-c',
    'icns',
    iconset,
    '-o',
    path.join(assets, 'icon.icns'),
  ]);

  // Windows Vista and newer accept PNG-compressed images in ICO containers.
  const images = [];
  for (const size of [16, 24, 32, 48, 64, 128, 256]) {
    const file = path.join(temporary, `${size}.png`);
    execFileSync(
      'sips',
      ['-z', String(size), String(size), source, '--out', file],
      { stdio: 'ignore' },
    );
    images.push({ size, data: await readFile(file) });
  }
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  await writeFile(
    path.join(assets, 'icon.ico'),
    Buffer.concat([header, ...images.map(({ data }) => data)]),
  );
  console.log(
    'Rebuilt assets/icon.icns and assets/icon.ico from assets/icon.png',
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
