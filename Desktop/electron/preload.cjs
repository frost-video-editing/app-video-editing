const { contextBridge, ipcRenderer } = require("electron");

const EXPORT_PROGRESS_CHANNEL = "editor:export-progress";

contextBridge.exposeInMainWorld("editorApi", {
  selectSource: () => ipcRenderer.invoke("editor:select-source"),
  backupSource: (payload) => ipcRenderer.invoke("editor:backup-source", payload),
  probeVideo: (payload) => ipcRenderer.invoke("editor:probe-video", payload),
  selectOutput: (payload) => ipcRenderer.invoke("editor:select-output", payload),
  exportVideo: (payload) => ipcRenderer.invoke("editor:export-video", payload),
  cancelExport: () => ipcRenderer.invoke("editor:cancel-export"),
  revealInFolder: (payload) => ipcRenderer.invoke("editor:reveal-in-folder", payload),
  onExportProgress: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(EXPORT_PROGRESS_CHANNEL, listener);
    return () => ipcRenderer.removeListener(EXPORT_PROGRESS_CHANNEL, listener);
  }
});
