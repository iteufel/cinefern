const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cinefern', {
  agentRequest: (id, url, options) =>
    ipcRenderer.invoke('agent:request', id, url, options),
  agentBrowse: (id, url) => ipcRenderer.invoke('agent:browse', id, url),
  agentCancel: (id) => ipcRenderer.invoke('agent:cancel', id),
  getSecret: (key) => ipcRenderer.invoke('secret:get', key),
  setSecret: (key, value) => ipcRenderer.invoke('secret:set', key, value),
  removeSecret: (key) => ipcRenderer.invoke('secret:remove', key),
  platform:
    process.platform === 'darwin'
      ? 'macOS'
      : process.platform === 'win32'
        ? 'Windows'
        : 'Linux',
  request: (url, options) =>
    ipcRenderer.invoke('provider:request', url, options),
  download: (request) => ipcRenderer.invoke('download:start', request),
  cancelDownload: (id) => ipcRenderer.invoke('download:cancel', id),
  removeDownload: (uri) => ipcRenderer.invoke('download:remove', uri),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke('window:float', enabled),
  openExternal: (url) => ipcRenderer.invoke('window:external', url),
  fileSource: (url, headers) => ipcRenderer.invoke('media:file', url, headers),
  releaseFileSource: (uri) => ipcRenderer.invoke('media:release', uri),
  onDownloadProgress(callback) {
    const listener = (_, progress) => callback(progress);
    ipcRenderer.on('download:progress', listener);
    return () => ipcRenderer.removeListener('download:progress', listener);
  },
});
