import { Parser } from 'htmlparser2';
import type { AgentCitation } from '@cinefern/provider-sdk';

export interface BrowserPage {
  url: string;
  title: string;
  text: string;
  links: AgentCitation[];
  media: string[];
  mode: 'reader' | 'rendered';
}
/** Agent browsing is public HTTPS only. Provider HTTP permissions remain separate. */
export function publicWebUrl(value: string): string {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    value.length > 2048 ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !host.includes('.') ||
    /^[\d.]+$/.test(host) ||
    host.includes(':') ||
    /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|onion)$/.test(
      host,
    )
  )
    throw new Error(
      'Agent browsing requires a public HTTPS website without credentials.',
    );
  url.hash = '';
  return url.href;
}
export function tryPublicUrl(value: string, base?: string): string | undefined {
  try {
    return publicWebUrl(new URL(value, base).href);
  } catch {
    return undefined;
  }
}
/** A streaming parser works on Hermes as well as the browser, without DOM/eval access. */
export function parseBrowserPage(html: string, url: string): BrowserPage {
  const page: BrowserPage = {
    url,
    title: '',
    text: '',
    links: [],
    media: [],
    mode: 'reader',
  };
  let hidden = 0;
  let title = false;
  let link: AgentCitation | undefined;
  const hiddenTags = new Set([
    'script',
    'style',
    'noscript',
    'svg',
    'template',
  ]);
  const parser = new Parser(
    {
      onopentag(name, attrs) {
        if (hiddenTags.has(name)) hidden++;
        if (hidden) return;
        if (name === 'title') title = true;
        if (name === 'a' && attrs.href) {
          const href = tryPublicUrl(attrs.href, url);
          link = href ? { url: href, title: '' } : undefined;
        }
        if (['video', 'source'].includes(name) && attrs.src) {
          const src = tryPublicUrl(attrs.src, url);
          if (src && page.media.length < 20) page.media.push(src);
        }
        if (
          ['p', 'br', 'div', 'li', 'h1', 'h2', 'h3'].includes(name) &&
          page.text.length < 16000
        )
          page.text += '\n';
      },
      ontext(text) {
        if (hidden) return;
        if (title) page.title += text.slice(0, 300 - page.title.length);
        if (link) link.title += text.slice(0, 180 - link.title.length);
        if (page.text.length < 16000)
          page.text += text.slice(0, 16000 - page.text.length);
      },
      onclosetag(name) {
        if (hiddenTags.has(name)) hidden = Math.max(0, hidden - 1);
        if (name === 'title') title = false;
        if (name === 'a' && link) {
          if (
            page.links.length < 60 &&
            !page.links.some((v) => v.url === link!.url)
          )
            page.links.push({ ...link, title: link.title.trim() || link.url });
          link = undefined;
        }
      },
    },
    { decodeEntities: true },
  );
  parser.end(html.slice(0, 1_000_000));
  page.text = page.text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
  page.title = page.title.trim() || new URL(url).hostname;
  return page;
}
