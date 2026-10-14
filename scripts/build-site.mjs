import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
export const siteDirectory = path.join(root, 'dist-site');

export async function buildSite() {
  // Keep marketing output separate from Expo's dist/ renderer.
  await rm(siteDirectory, { recursive: true, force: true });
  await mkdir(siteDirectory, { recursive: true });
  await cp(path.join(root, 'website'), siteDirectory, { recursive: true });
  await cp(path.join(root, 'LICENSE'), path.join(siteDirectory, 'LICENSE'));
  await writeFile(path.join(siteDirectory, '.nojekyll'), '');

  // GitHub supplies the deployed URL so social previews also work on forks
  // and custom domains. Local builds retain the project's default URL.
  if (process.env.SITE_URL) {
    const siteUrl = new URL(process.env.SITE_URL);
    if (!['https:', 'http:'].includes(siteUrl.protocol)) {
      throw new Error('SITE_URL must be an HTTP(S) URL.');
    }
    const socialImage = new URL(
      'assets/social-card.png',
      `${siteUrl.href.replace(/\/$/, '')}/`,
    );
    const indexPath = path.join(siteDirectory, 'index.html');
    const html = await readFile(indexPath, 'utf8');
    await writeFile(
      indexPath,
      html.replace(
        'https://iteufel.github.io/cinefern/assets/social-card.png',
        socialImage.href.replaceAll('&', '&amp;').replaceAll('"', '&quot;'),
      ),
    );
  }
  console.log(`Cinefern website built in ${siteDirectory}`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await buildSite();
}
