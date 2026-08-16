import { useState } from "react";
import { createEditorSnapshot, restoreEditorSnapshot } from "../lib/editorHistory.js";

const MAX_UNDO_ENTRIES = 30;

// Manages immutable editor snapshots and delegates UI-specific restoration to its caller.
export default function useEditorHistory({ editorState, onRestore, onEmpty, onUndo }) {
  const [undoStack, setUndoStack] = useState([]);

  function pushUndoSnapshot() {
    const snapshot = createEditorSnapshot(editorState);
    setUndoStack((current) => [...current.slice(-(MAX_UNDO_ENTRIES - 1)), snapshot]);
  }

  function clearUndoHistory() {
    setUndoStack([]);
  }

  function handleUndo() {
    setUndoStack((current) => {
      if (!current.length) {
        onEmpty();
        return current;
      }

      const next = [...current];
      const snapshot = next.pop();
      onRestore(restoreEditorSnapshot(snapshot));
      onUndo();
      return next;
    });
  }

  return { undoStack, pushUndoSnapshot, clearUndoHistory, handleUndo };
}

// Manages status and error messages with a unified API.
export function useEditorMessages(initialStatus) {
  const [status, setStatus] = useState(initialStatus);
  const [errorText, setErrorText] = useState("");

  function setStatusMessage(message) {
    setStatus(message);
  }

  function setErrorMessage(message) {
    setErrorText(message);
  }

  function clearMessages() {
    setErrorText("");
  }

  function clearErrorOnly() {
    setErrorText("");
  }

  function clearStatusOnly() {
    setStatus("");
  }

  return {
    status,
    errorText,
    setStatusMessage,
    setErrorMessage,
    clearMessages,
    clearErrorOnly,
    clearStatusOnly
  };
}
