const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Opacity controls
  setOpacity: (opacity) => ipcRenderer.invoke('set-opacity', opacity),
  getOpacity: () => ipcRenderer.invoke('get-opacity'),
  adjustOpacity: (delta) => ipcRenderer.invoke('adjust-opacity', delta),
  
  // Window controls
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke('set-always-on-top', enabled),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('toggle-always-on-top'),
  setFrameless: (enabled) => ipcRenderer.invoke('set-frameless', enabled),
  toggleFrameless: () => ipcRenderer.invoke('toggle-frameless'),
  
  // Overlay mode
  setOverlayMode: (enabled) => ipcRenderer.invoke('set-overlay-mode', enabled),
  toggleOverlayMode: () => ipcRenderer.invoke('toggle-overlay-mode'),
  getOverlayMode: () => ipcRenderer.invoke('get-overlay-mode'),
  
  // Window management
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  unmaximizeWindow: () => ipcRenderer.invoke('unmaximize-window'),
  isMaximized: () => ipcRenderer.invoke('is-maximized'),
  
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  resetSettings: () => ipcRenderer.invoke('reset-settings'),
  
  // Event listeners
  onSettingsChanged: (callback) => {
    ipcRenderer.on('settings-changed', callback);
    return () => ipcRenderer.removeListener('settings-changed', callback);
  },
  
  // Process control
  processControl: {
    start: (serviceName) => ipcRenderer.invoke('process:start', serviceName),
    stop: (serviceName) => ipcRenderer.invoke('process:stop', serviceName),
    restart: (serviceName) => ipcRenderer.invoke('process:restart', serviceName),
    startAll: () => ipcRenderer.invoke('process:startAll'),
    stopAll: () => ipcRenderer.invoke('process:stopAll'),
    getStatus: () => ipcRenderer.invoke('process:getStatus'),
    getLogs: (options) => ipcRenderer.invoke('process:getLogs', options),
    searchLogs: (query, options) => ipcRenderer.invoke('process:searchLogs', query, options),
    getHealth: () => ipcRenderer.invoke('process:getHealth'),
    
    // Process event listeners
    onStatusChange: (callback) => {
      ipcRenderer.on('process:status-change', (event, data) => callback(data));
      return () => ipcRenderer.removeListener('process:status-change', callback);
    },
    onError: (callback) => {
      ipcRenderer.on('process:error', (event, data) => callback(data));
      return () => ipcRenderer.removeListener('process:error', callback);
    },
    onLog: (callback) => {
      ipcRenderer.on('process:log', (event, log) => callback(log));
      return () => ipcRenderer.removeListener('process:log', callback);
    },
    onHealthCheck: (callback) => {
      ipcRenderer.on('process:health-check', (event, result) => callback(result));
      return () => ipcRenderer.removeListener('process:health-check', callback);
    }
  },
  
  // Proxy settings
  proxySettings: {
    getAll: () => ipcRenderer.invoke('proxy-settings:get-all'),
    setAll: (settings) => ipcRenderer.invoke('proxy-settings:set-all', settings),
    reset: () => ipcRenderer.invoke('proxy-settings:reset'),
    restartProxy: () => ipcRenderer.invoke('proxy-settings:restart-proxy'),
    
    // Event listener for settings changes
    onChange: (callback) => {
      ipcRenderer.on('proxy-settings:changed', (event, settings) => callback(settings));
      return () => ipcRenderer.removeListener('proxy-settings:changed', callback);
    }
  },
  
  // Check if running in Electron
  isElectron: true,
  platform: process.platform
});