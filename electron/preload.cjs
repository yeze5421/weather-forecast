const { contextBridge, ipcRenderer } = require('electron');

const listen = (channel, callback) => {
  if (typeof callback !== 'function') throw new TypeError('A callback is required');
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('weatherStation', Object.freeze({
  getSnapshot: () => ipcRenderer.invoke('weather:snapshot'),
  onSnapshot: callback => listen('weather:snapshot-changed', callback),
  getPreferences: () => ipcRenderer.invoke('weather:preferences'),
  savePreferences: patch => ipcRenderer.invoke('weather:save-preferences', patch),
  onPreferences: callback => listen('weather:preferences-changed', callback),
  setExpanded: expanded => ipcRenderer.invoke('weather:expanded', expanded),
  setPinned: pinned => ipcRenderer.invoke('weather:pinned', pinned),
  hide: () => ipcRenderer.invoke('weather:hide'),
  quit: () => ipcRenderer.invoke('weather:quit'),
}));
