import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/** Deep Agents uses only synchronous SHA-256 for in-memory content identifiers. */
export function createHash(algorithm: string) {
  if (algorithm !== 'sha256')
    throw new Error('Unsupported agent hash algorithm.');
  const hash = sha256.create();
  const api = {
    update(value: string | Uint8Array) {
      hash.update(
        typeof value === 'string' ? new TextEncoder().encode(value) : value,
      );
      return api;
    },
    digest(encoding?: string) {
      const bytes = hash.digest();
      if (encoding === 'hex') return bytesToHex(bytes);
      if (encoding) throw new Error('Unsupported agent hash encoding.');
      return bytes;
    },
  };
  return api;
}
