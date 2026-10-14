import type { HttpOptions, HttpResponse } from '@cinefern/provider-sdk';
import type { BrowserPage } from './browser';
import { parseBrowserPage, publicWebUrl } from './browser';
import { AI_ENDPOINTS } from './settings';

export type AgentHttp = (
  url: string,
  options: HttpOptions,
  signal: AbortSignal,
) => Promise<HttpResponse>;
export interface AgentPlatform {
  request: AgentHttp;
  browse(url: string, signal: AbortSignal): Promise<BrowserPage>;
}
export function assertAiEndpoint(value: string) {
  if (
    !Object.values(AI_ENDPOINTS).some((base) =>
      [base + '/responses', base + '/chat/completions'].includes(value),
    )
  )
    throw new Error('Unknown AI endpoint.');
}
export async function boundedFetch(
  fetcher: typeof fetch,
  url: string,
  options: RequestInit,
  signal: AbortSignal,
  limit = 1_000_000,
): Promise<HttpResponse> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) throw new Error('Agent run cancelled.');
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 45_000);
  try {
    const response = await fetcher(url, {
      ...options,
      credentials: 'omit',
      redirect: 'error',
      signal: controller.signal,
    });
    if (Number(response.headers.get('content-length')) > limit)
      throw new Error('Agent response is too large.');
    const reader = response.body?.getReader();
    let body = '';
    if (reader) {
      const decoder = new TextDecoder();
      let bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > limit) {
          await reader.cancel();
          throw new Error('Agent response is too large.');
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } else body = await response.text();
    if (body.length > limit) throw new Error('Agent response is too large.');
    return {
      status: response.status,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}
export function portableAgentPlatform(fetcher: typeof fetch): AgentPlatform {
  return {
    request: async (url, options, signal) => {
      assertAiEndpoint(url);
      return boundedFetch(fetcher, url, options, signal);
    },
    async browse(value, signal) {
      const url = publicWebUrl(value);
      const response = await boundedFetch(
        fetcher,
        url,
        { headers: { Accept: 'text/html,text/plain,application/json' } },
        signal,
      );
      if (!response.ok)
        throw new Error(
          'Page could not be read (HTTP ' + response.status + ').',
        );
      const type = response.headers['content-type'] ?? '';
      if (type && !/text\/|application\/(?:json|xhtml\+xml)/i.test(type))
        throw new Error('This URL is not a readable page.');
      return /json|text\/plain/.test(type)
        ? {
            url,
            title: new URL(url).hostname,
            text: response.body.slice(0, 16000),
            links: [],
            media: [],
            mode: 'reader',
          }
        : parseBrowserPage(response.body, url);
    },
  };
}
