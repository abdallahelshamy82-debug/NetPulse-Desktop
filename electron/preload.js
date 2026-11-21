const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("netpulseElectron", {
  isElectron: true,
  minimize: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  getAppInfo: () => ipcRenderer.invoke("app:get-info"),
  getSystemTelemetry: () => ipcRenderer.invoke("telemetry:system"),
  openExternal: (url) => ipcRenderer.invoke("app:open-external", url),
  exportPdf: (suggestedName) => ipcRenderer.invoke("window:export-pdf", suggestedName),
  onMaximizedChange: (callback) => {
    const listener = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on("window:maximized-change", listener);
    return () => {
      ipcRenderer.removeListener("window:maximized-change", listener);
    };
  },
});
