import { useCallback, useEffect, useRef, useState } from "react";
import { editorMessages } from "../lib/editorMessages.js";
import useLanguage from "./useLanguage.jsx";

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
  const { t } = useLanguage();
  const handleChooseOutput = useCallback(async () => {
    if (!editorApi) {
      messages.setErrorMessage(editorMessages.desktopShellRequired);
      return;
    }
    const result = await editorApi.selectOutput({ suggestedName: sourceName || "edited-video.mp4" });
    if (!result) return;
    setOutputPath(result.filePath);
    messages.setStatusMessage(t("outputSet", result.filePath));
  }, [editorApi, messages, setOutputPath, sourceName]);

  const handleChooseOutputFolder = useCallback(async (setOutputDirectoryPath) => {
    if (!editorApi?.selectOutputFolder) {
      messages.setErrorMessage(editorMessages.desktopShellRequired);
      return;
    }
    const result = await editorApi.selectOutputFolder();
    if (!result) return;
    setOutputPath("");
    setOutputDirectoryPath(result.filePath);
    messages.setStatusMessage(t("outputFolderSet", result.filePath));
  }, [editorApi, messages, t]);

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

  return { handleChooseOutput, handleChooseOutputFolder, handleOpenExportConfirm, handleCloseExportConfirm };
}

// Subscribes to export progress events and owns their display state.
export function useExportProgress(editorApi) {
  const { t } = useLanguage();
  const exportStartTimeRef = useRef(null);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState("");
  const [exportIndeterminate, setExportIndeterminate] = useState(false);
  const [exportSegments, setExportSegments] = useState(null);

  useEffect(() => {
    if (!editorApi?.onExportProgress) return undefined;
    return editorApi.onExportProgress((payload = {}) => {
      const currentSegment = Number(payload.currentSegment) - 1;
      const currentSegmentProgress = Number(payload.currentSegmentProgress);
      setExportMessage(payload.message || t("exporting"));
      setExportProgress(Number(payload.progress) || 0);
      setExportIndeterminate(Boolean(payload.indeterminate));
      setExportSegments((previous) => {
        if (Array.isArray(payload.segments)) return payload.segments;
        if (!Number.isInteger(currentSegment) || currentSegment < 0 || !Number.isFinite(currentSegmentProgress)) {
          return previous;
        }
        const next = Array.isArray(previous) ? [...previous] : [];
        next[currentSegment] = currentSegmentProgress;
        return next;
      });
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
