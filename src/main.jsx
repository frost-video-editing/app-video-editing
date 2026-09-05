import React from "react";
import { createRoot } from "react-dom/client";
import VideoEditorApp from "./VideoEditorApp.jsx";
import { installTauriEditorApi, isTauriRuntime } from "./tauri/editorApi.js";
import ja from "./locales/ja.json";
import en from "./locales/en.json";
import "./styles/video-editor.css";

class AppErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Video editor failed to render.", error, errorInfo);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const language = typeof window !== "undefined" && window.localStorage.getItem("videoEditor.language") === "en" ? en : ja;
    return (
      <main className="app-error-screen">
        <h1>{language.appErrorTitle}</h1>
        <p>{language.appErrorDetails}</p>
        <pre>{this.state.error.message}</pre>
      </main>
    );
  }
}

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

  try {
    createRoot(document.getElementById("root")).render(
      <React.StrictMode>
        <AppErrorBoundary>
          <VideoEditorApp />
        </AppErrorBoundary>
      </React.StrictMode>
    );
  } catch (error) {
    console.error("Failed to render the React application.", error);
  }
}

bootstrap();
