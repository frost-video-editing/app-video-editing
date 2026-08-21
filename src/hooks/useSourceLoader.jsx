import { useCallback, useEffect, useRef, useState } from "react";
import { createFullTimeline } from "../lib/videoTimeline.js";
import { createLoadLog } from "../lib/operationLog.js";
import { editorMessages } from "../lib/editorMessages.js";
import useLanguage from "./useLanguage.jsx";

// Owns source selection, metadata loading, and initial timeline setup.
export default function useSourceLoader({
  editorApi,
  setSourcePath,
  setSourceUrl,
  setSourceName,
  setMetadata,
  setSegments,
  setSelectionStart,
  setSelectionEnd,
  setPlayheadWithPreview,
  setClipboard,
  setOutputPath,
  setCrop,
  emptyCrop,
  clearUndoHistory,
  resetCropSelection,
  setOperationLogs,
  isOperationTypeEnabled = () => true,
  setIsLoading,
  setLoadingProgress,
  setLoadingMessage,
  setLoadingIndeterminate,
  loadStartTimeRef,
  loadCompletionTimeoutRef,
  clearLoadCompletionTimeout,
  stopLoadingOverlay,
  messages
}) {
  const { t } = useLanguage();
  const loadSource = useCallback(async (result) => {
    if (!result?.filePath) {
      stopLoadingOverlay();
      messages.setErrorMessage(editorMessages.videoNotFound);
      messages.setStatusMessage(editorMessages.loadFailed);
      return;
    }

    if (!editorApi) {
      stopLoadingOverlay();
      messages.setErrorMessage(editorMessages.runOnElectron);
      messages.setStatusMessage(editorMessages.loadFailed);
      return;
    }

    messages.clearErrorOnly();
    setIsLoading(true);
    setLoadingProgress(0);
    setLoadingMessage(t("selectingFile"));
    setLoadingIndeterminate(true);
    loadStartTimeRef.current = Date.now();

    try {
      setLoadingProgress(10);
      setLoadingMessage(t("loadingVideoInfo"));
      const info = result.info || (await editorApi.probeVideo(result.filePath));

      setLoadingProgress(40);
      setLoadingMessage(t("processingMetadata"));
      setLoadingIndeterminate(false);

      const nextSourceName = result.fileName || result.filePath.split(/[\\/]/).pop() || "video";
      setSourcePath(result.filePath);
      setSourceUrl(result.fileUrl);
      setSourceName(nextSourceName);

      setLoadingProgress(70);
      setLoadingMessage(t("buildingTimeline"));
      setMetadata(info);
      setSegments(createFullTimeline(info.duration));
      setSelectionStart(0);
      setSelectionEnd(info.duration);
      setPlayheadWithPreview(0);
      setClipboard([]);
      setOutputPath("");
      setCrop(emptyCrop);
      clearUndoHistory();
      resetCropSelection();

      setLoadingProgress(100);
      setLoadingMessage(t("complete"));
      clearLoadCompletionTimeout();
      loadCompletionTimeoutRef.current = setTimeout(() => {
        stopLoadingOverlay();
        messages.setStatusMessage(t("videoLoaded"));
        if (isOperationTypeEnabled("load")) {
          setOperationLogs((current) => [...current, createLoadLog(nextSourceName, info, result.filePath)]);
        }
      }, 500);
    } catch (error) {
      stopLoadingOverlay();
      setLoadingProgress(0);
      messages.setErrorMessage(error?.message || editorMessages.videoLoadingFailed);
      messages.setStatusMessage(editorMessages.loadFailed);
    }
  }, [clearLoadCompletionTimeout, clearUndoHistory, editorApi, emptyCrop, isOperationTypeEnabled, loadCompletionTimeoutRef, messages, resetCropSelection, setClipboard, setCrop, setIsLoading, setLoadingIndeterminate, setLoadingMessage, setLoadingProgress, setMetadata, setOperationLogs, setOutputPath, setPlayheadWithPreview, setSelectionEnd, setSelectionStart, setSegments, setSourceName, setSourcePath, setSourceUrl, stopLoadingOverlay]);

  const handleChooseSource = useCallback(async () => {
    if (!editorApi) {
      messages.setErrorMessage(t("electronRequired"));
      return;
    }

    setIsLoading(true);
    setLoadingProgress(0);
    setLoadingMessage(t("openingFileDialog"));
    setLoadingIndeterminate(true);
    loadStartTimeRef.current = Date.now();

    try {
      const result = await editorApi.selectSource();
      if (!result) {
        stopLoadingOverlay();
        messages.setStatusMessage(t("videoSelectionCancelled"));
        return;
      }

      if (editorApi.backupSource && window.confirm(t("backupImportedFile"))) {
        try {
          const backup = await editorApi.backupSource(result.filePath);
          if (backup?.filePath) messages.setStatusMessage(t("backupSaved"));
        } catch (error) {
          console.error("Failed to save source backup", error);
          messages.setErrorMessage(t("backupFailed"));
        }
      }

      await loadSource(result);
    } catch (error) {
      stopLoadingOverlay();
      setLoadingProgress(0);
      messages.setErrorMessage(error?.message || editorMessages.videoSelectionFailed);
      messages.setStatusMessage(editorMessages.loadFailed);
    }
  }, [editorApi, loadSource, loadStartTimeRef, messages, setIsLoading, setLoadingIndeterminate, setLoadingMessage, setLoadingProgress, stopLoadingOverlay]);

  return { loadSource, handleChooseSource };
}

export function useLoadingOverlay() {
  const loadStartTimeRef = useRef(null);
  const loadCompletionTimeoutRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [loadingIndeterminate, setLoadingIndeterminate] = useState(false);

  function clearLoadCompletionTimeout() {
    if (loadCompletionTimeoutRef.current) {
      clearTimeout(loadCompletionTimeoutRef.current);
      loadCompletionTimeoutRef.current = null;
    }
  }

  function stopLoadingOverlay() {
    clearLoadCompletionTimeout();
    setIsLoading(false);
    setLoadingMessage("");
    setLoadingIndeterminate(false);
    setLoadingProgress(0);
    loadStartTimeRef.current = null;
  }

  useEffect(() => () => clearLoadCompletionTimeout(), []);

  return {
    loadStartTimeRef,
    loadCompletionTimeoutRef,
    isLoading,
    setIsLoading,
    loadingProgress,
    setLoadingProgress,
    loadingMessage,
    setLoadingMessage,
    loadingIndeterminate,
    setLoadingIndeterminate,
    clearLoadCompletionTimeout,
    stopLoadingOverlay
  };
}
