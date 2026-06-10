import React from "react";
import { createRoot } from "react-dom/client";
import VideoEditorApp from "./VideoEditorApp.jsx";
import "./styles/video-editor.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <VideoEditorApp />
  </React.StrictMode>
);
