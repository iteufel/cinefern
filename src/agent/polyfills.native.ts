import { getRandomValues, randomUUID } from 'expo-crypto';

// LangChain and LangSmith generate run/tool IDs with the Web Crypto interface.
// Hermes has no Web Crypto global; supply native secure randomness before importing the app.
const nativeCrypto = globalThis.crypto ?? ({} as Crypto);
nativeCrypto.getRandomValues ??= getRandomValues as Crypto['getRandomValues'];
nativeCrypto.randomUUID ??= randomUUID as Crypto['randomUUID'];
if (!globalThis.crypto)
  Object.defineProperty(globalThis, 'crypto', {
    value: nativeCrypto,
    configurable: true,
  });
