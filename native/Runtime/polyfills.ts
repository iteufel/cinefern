// Installed before importing the trusted application core. Plugins still run in SandboxJS.
import 'fast-text-encoding';
import structuredClone from '@ungap/structured-clone';
import { URL, URLSearchParams } from 'whatwg-url';
import {
  AbortController,
  AbortSignal,
} from 'abort-controller/dist/abort-controller.mjs';
import { Headers, Request, Response } from 'whatwg-fetch';
import {
  ReadableStream,
  WritableStream,
  TransformStream,
} from 'web-streams-polyfill';
import { Buffer } from 'buffer';

declare const __nativeSync: (operation: string, json: string) => string;
declare const __nativeAsync: (
  id: string,
  operation: string,
  json: string,
) => void;
const pending = new Map<
  string,
  { resolve(value: any): void; reject(error: Error): void }
>();
let serial = 0;
export function nativeCall(
  operation: string,
  value: unknown = {},
): Promise<any> {
  const id = String(++serial);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    __nativeAsync(id, operation, JSON.stringify(value));
  });
}
Object.assign(globalThis, {
  URL,
  URLSearchParams,
  AbortController,
  AbortSignal,
  Headers,
  Request,
  Response,
  FormData: class NativeFormData {
    private fields: Array<[string, unknown]> = [];
    append(key: string, value: unknown) {
      this.fields.push([key, value]);
    }
    entries() {
      return this.fields[Symbol.iterator]();
    }
    [Symbol.iterator]() {
      return this.entries();
    }
  },
  ReadableStream,
  WritableStream,
  TransformStream,
  Buffer,
  self: globalThis,
  process: {
    env: {},
    platform: 'darwin',
    versions: {},
    cwd: () => '/',
    nextTick: (callback: () => void) => Promise.resolve().then(callback),
  },
  structuredClone,
  atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
  btoa: (value: string) => Buffer.from(value, 'binary').toString('base64'),
  crypto: {
    randomUUID: () => JSON.parse(__nativeSync('uuid', '{}')),
    getRandomValues: (array: Uint8Array) => {
      if (!ArrayBuffer.isView(array) || array.byteLength > 65536)
        throw new Error('Invalid random buffer');
      const bytes = JSON.parse(
        __nativeSync('random', JSON.stringify({ count: array.byteLength })),
      );
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(
        bytes,
      );
      return array;
    },
  },
  console: Object.fromEntries(
    [
      'log',
      'info',
      'warn',
      'error',
      'debug',
      'trace',
      'assert',
      'group',
      'groupEnd',
      'table',
      'dir',
    ].map((key) => [key, () => {}]),
  ),
  __nativeComplete: (id: string, json: string) => {
    const callback = pending.get(id);
    if (!callback) return;
    pending.delete(id);
    const reply = JSON.parse(json);
    if (reply.error) callback.reject(new Error(reply.error));
    else callback.resolve(reply.value);
  },
});
// DispatchSourceTimer delivers callbacks on the same serial JS queue, never the UI thread.
let timerSerial = 0;
const timers = new Map<number, () => void>();
const intervals = new Set<number>();
Object.assign(globalThis, {
  setTimeout: (
    callback: (...args: any[]) => void,
    milliseconds = 0,
    ...args: any[]
  ) => {
    const id = ++timerSerial;
    timers.set(id, () => callback(...args));
    __nativeAsync('timer:' + id, 'timer', JSON.stringify({ id, milliseconds }));
    return id;
  },
  setInterval: (
    callback: (...args: any[]) => void,
    milliseconds = 0,
    ...args: any[]
  ) => {
    const id = ++timerSerial;
    intervals.add(id);
    timers.set(id, () => callback(...args));
    __nativeAsync(
      'timer:' + id,
      'timer',
      JSON.stringify({ id, milliseconds, repeating: true }),
    );
    return id;
  },
  clearInterval: (id: number) => {
    intervals.delete(id);
    timers.delete(id);
    __nativeAsync('timer:' + id, 'clearTimer', JSON.stringify({ id }));
  },
  clearTimeout: (id: number) => {
    timers.delete(id);
    __nativeAsync('timer:' + id, 'clearTimer', JSON.stringify({ id }));
  },
  __nativeTimer: (id: number) => {
    const callback = timers.get(id);
    if (!intervals.has(id)) timers.delete(id);
    callback?.();
  },
});
Object.assign(globalThis, {
  queueMicrotask: (callback: () => void) => Promise.resolve().then(callback),
  performance: { now: () => Date.now() },
});

// abort-controller supplies events; current LangChain also requires these DOM additions.
const abortReasons = new WeakMap<object, unknown>();
const originalAbort = AbortController.prototype.abort;
AbortController.prototype.abort = function (reason?: unknown) {
  if (!this.signal.aborted)
    abortReasons.set(this.signal, reason ?? new Error('Request aborted.'));
  originalAbort.call(this);
};
Object.defineProperty(AbortSignal.prototype, 'reason', {
  get() {
    return abortReasons.get(this);
  },
});
Object.assign(AbortSignal.prototype, {
  throwIfAborted(this: AbortSignal) {
    if (this.aborted) throw this.reason;
  },
});
Object.assign(AbortSignal, {
  abort: (reason?: unknown) => {
    const controller = new AbortController();
    controller.abort(reason);
    return controller.signal;
  },
  timeout: (milliseconds: number) => {
    const controller = new AbortController();
    setTimeout(
      () => controller.abort(new Error('Request timed out.')),
      milliseconds,
    );
    return controller.signal;
  },
  any: (signals: AbortSignal[]) => {
    const controller = new AbortController();
    const listeners: Array<[AbortSignal, () => void]> = [];
    const abort = (signal: AbortSignal) => {
      controller.abort(signal.reason);
      for (const [s, f] of listeners) s.removeEventListener('abort', f);
    };
    for (const signal of signals) {
      if (signal.aborted) {
        abort(signal);
        break;
      }
      const listener = () => abort(signal);
      listeners.push([signal, listener]);
      signal.addEventListener('abort', listener, { once: true });
    }
    return controller.signal;
  },
});
