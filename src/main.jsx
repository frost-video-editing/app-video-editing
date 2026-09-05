import React from "react";
import { createRoot } from "react-dom/client";
import VideoEditorApp from "./VideoEditorApp.jsx";
import { installTauriEditorApi, isTauriRuntime } from "./tauri/editorApi.js";
import "./styles/video-editor.css";

// Under Tauri, install the invoke/listen-based editorApi before React renders
// so VideoEditorApp reads a populated window.editorApi. In a plain browser
// context there is no bridge and the UI shows the desktop-shell notice.
async function bootstrap() {
  try {
    if (isTauriRuntime()) {
      await installTauriEditorApi();
    }
  } catch (error) {
    // If the adapter fails to load we still want to render the UI so the user
    // can see the error message rather than a blank window.
    console.error("Failed to initialise the Tauri editor bridge.", error);
  }

  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <VideoEditorApp />
    </React.StrictMode>
  );
}

bootstrap();
