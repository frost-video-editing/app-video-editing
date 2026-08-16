import { useCallback, useEffect, useRef, useState } from "react";
import { editorMessages } from "../lib/editorMessages.js";

// Owns output selection and export confirmation dialog actions.
export default function useExportDialogActions({
  editorApi,
  sourceName,
  sourcePath,
  segments,
  isExporting,
  setOutputPath,
  setIsExportConfirmOpen,
  messages
}) {
  const handleChooseOutput = useCallback(async () => {
    if (!editorApi) {
      messages.setErrorMessage(editorMessages.runOnElectron);
      return;
    }
    const result = await editorApi.selectOutput({ suggestedName: sourceName || "edited-video.mp4" });
    if (!result) return;
    setOutputPath(result.filePath);
    messages.setStatusMessage(`出力先を設定しました: ${result.filePath}`);
  }, [editorApi, messages, setOutputPath, sourceName]);

  const handleOpenExportConfirm = useCallback(() => {
    if (!sourcePath || !segments.length) {
      messages.setErrorMessage(editorMessages.chooseVideoFirst);
      return;
    }
    messages.clearErrorOnly();
    setIsExportConfirmOpen(true);
  }, [messages, segments.length, setIsExportConfirmOpen, sourcePath]);

  const handleCloseExportConfirm = useCallback(() => {
    if (!isExporting) setIsExportConfirmOpen(false);
  }, [isExporting, setIsExportConfirmOpen]);

  return { handleChooseOutput, handleOpenExportConfirm, handleCloseExportConfirm };
}

// Subscribes to Electron export progress events and owns their display state.
export function useExportProgress(editorApi) {
  const exportStartTimeRef = useRef(null);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState("");
  const [exportIndeterminate, setExportIndeterminate] = useState(false);
  const [exportSegments, setExportSegments] = useState(null);

  useEffect(() => {
    if (!editorApi?.onExportProgress) return undefined;
    return editorApi.onExportProgress((payload = {}) => {
      setExportMessage(payload.message || "動画を出力中...");
      setExportProgress(Number(payload.progress) || 0);
      setExportIndeterminate(Boolean(payload.indeterminate));
      setExportSegments(Array.isArray(payload.segments) ? payload.segments : null);
    });
  }, [editorApi]);

  function resetExportOverlay() {
    setExportProgress(0);
    setExportMessage("");
    setExportIndeterminate(false);
    exportStartTimeRef.current = null;
  }

  return {
    exportStartTimeRef,
    exportProgress,
    setExportProgress,
    exportMessage,
    setExportMessage,
    exportIndeterminate,
    setExportIndeterminate,
    exportSegments,
    resetExportOverlay
  };
}
