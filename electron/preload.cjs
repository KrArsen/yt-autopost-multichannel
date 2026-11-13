const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronDesktop', {
  isDesktop: true,
  getFilePath: (file) => {
    try {
      return webUtils.getPathForFile(file) || '';
    } catch {
      return '';
    }
  },
  pickVideoFile: () => ipcRenderer.invoke('desktop:pick-video'),
  pickThumbnailFile: () => ipcRenderer.invoke('desktop:pick-thumbnail'),
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
  openDataDir: () => ipcRenderer.invoke('desktop:open-data-dir'),
  getDesktopSettings: () => ipcRenderer.invoke('desktop:get-settings'),
  setMinimizeToTray: (enabled) => ipcRenderer.invoke('desktop:set-minimize-to-tray', enabled),
  onOAuthCompleted: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('desktop:oauth-completed', listener);
    return () => ipcRenderer.removeListener('desktop:oauth-completed', listener);
  },
});
