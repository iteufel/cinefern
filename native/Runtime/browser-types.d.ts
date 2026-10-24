// Types of the standard APIs supplied by the browser polyfills; no Node host access.
declare module '@ungap/structured-clone' {
  const clone: typeof globalThis.structuredClone;
  export default clone;
}
declare module 'whatwg-url' {
  export const URL: typeof globalThis.URL;
  export const URLSearchParams: typeof globalThis.URLSearchParams;
}
declare module 'abort-controller/dist/abort-controller.mjs' {
  export const AbortController: typeof globalThis.AbortController;
  export const AbortSignal: typeof globalThis.AbortSignal;
}
declare module 'whatwg-fetch' {
  export const Headers: typeof globalThis.Headers;
  export const Request: typeof globalThis.Request;
  export const Response: typeof globalThis.Response;
}
