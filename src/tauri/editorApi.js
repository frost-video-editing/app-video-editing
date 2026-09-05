// Bridges the existing React code (which expects window.editorApi) to the
// Tauri v2 backend. When the app is not running inside Tauri this module
// does nothing and window.editorApi stays null.

const isTauriRuntime = () =>
  typeof window !== "undefined" &&
  Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);

/**
 * Install the Tauri-backed editorApi on window.
 * Safe to call more than once; subsequent calls are ignored.
 * Returns true when the adapter took over, false otherwise.
 */
export async function installTauriEditorApi() {
  if (!isTauriRuntime()) return false;
  if (typeof window !== "undefined" && window.editorApi && window.editorApi.__tauri) {
    return true;
  }

  // Dynamic import so the Tauri SDK is only pulled in when actually running
  // inside Tauri (keeps the plain web build lean).
  const [{ invoke, convertFileSrc }, { listen }] = await Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/api/event")
  ]);

  const EXPORT_PROGRESS_EVENT = "editor:export-progress";

  const editorApi = {
    __tauri: true,

    // Returns { filePath, fileUrl, fileName }; fileUrl is built with
    // convertFileSrc so the <video> element can load it via Tauri's
    // asset protocol.
    async selectSource() {
      const result = await invoke("select_source");
      if (!result) return null;
      return {
        filePath: result.filePath,
        fileName: result.fileName,
        fileUrl: convertFileSrc(result.filePath)
      };
    },

    async backupSource(payload) {
      const filePath = typeof payload === "string" ? payload : payload?.filePath;
      return invoke("backup_source", { payload: { filePath } });
    },

    async probeVideo(payload) {
      const filePath = typeof payload === "string" ? payload : payload?.filePath;
      return invoke("probe_video", { payload: { filePath } });
    },

    async selectOutput(payload = {}) {
      const suggestedName = payload?.suggestedName || "edited-video.mp4";
      return invoke("select_output", { payload: { suggestedName } });
    },

    async selectPresetOutput(payload = {}) {
      return invoke("select_preset_output");
    },

    async writePresetFile(payload) {
      return invoke("write_preset_file", { payload });
    },

    async exportVideo(payload) {
      try {
        return await invoke("export_video", { payload });
      } catch (raw) {
        const message = typeof raw === "string" ? raw : raw?.message || "";
        const error = new Error(message || "動画出力に失敗しました。");
        if (message === "EXPORT_CANCELLED") {
          error.code = "EXPORT_CANCELLED";
        }
        throw error;
      }
    },

    async cancelExport() {
      return invoke("cancel_export");
    },

    // Returns an unsubscribe function.
    onExportProgress(callback) {
      if (typeof callback !== "function") {
        return () => {};
      }
      const unlistenPromise = listen(EXPORT_PROGRESS_EVENT, (event) => {
        callback(event.payload);
      });
      return () => {
        unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
      };
    }
  };

  window.editorApi = editorApi;
  return true;
}

export { isTauriRuntime };
