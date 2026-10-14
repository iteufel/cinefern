import type { HttpResponse } from '@cinefern/provider-sdk';

// Fetch only. The caller parses and reviews a provider before installing it.
export async function fetchTextDocument(
  address: string,
  request: (url: string) => Promise<HttpResponse>,
): Promise<string> {
  const url = new URL(address.trim());
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      'Enter an HTTP(S) document URL without embedded credentials.',
    );
  const response = await request(url.href);
  if (!response.ok)
    throw new Error(`Document download failed (HTTP ${response.status}).`);
  if (response.body.length > 2_000_000)
    throw new Error('The document is larger than 2 MB.');
  return response.body;
}
