import type { HttpOptions, HttpResponse } from '@cinefern/provider-sdk';
import type { KeyValueStorage } from '../core/library';
import type { AgentPlatform } from '../agent/transport';

export interface DownloadRequest {
  id: string;
  url: string;
  headers?: Record<string, string>;
}
export interface DownloadProgress {
  bytes: number;
  totalBytes?: number;
}
export interface PlatformServices {
  agent: AgentPlatform;
  storage: KeyValueStorage;
  request(url: string, options?: HttpOptions): Promise<HttpResponse>;
  readTextFile(): Promise<{ name: string; text: string } | null>;
  exportText(name: string, text: string): Promise<void>;
  download(
    request: DownloadRequest,
    progress: (p: DownloadProgress) => void,
    signal: AbortSignal,
  ): Promise<string>;
  localMediaUri(uri: string): Promise<string>;
  removeDownload(uri: string): Promise<void>;
  setAlwaysOnTop?(enabled: boolean): Promise<void>;
  prepareFilePlayback?(
    url: string,
    headers: Record<string, string>,
  ): Promise<{ uri: string; dispose(): Promise<void> }>;
  openExternal(url: string): Promise<void>;
  name: string;
}
