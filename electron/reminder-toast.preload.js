const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toastAPI', {
  onInit: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('reminder-toast:init', listener);
    return () => ipcRenderer.removeListener('reminder-toast:init', listener);
  },
  respond: (payload) => ipcRenderer.send('reminder-toast:response', payload),
});
