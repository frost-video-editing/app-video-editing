import { useCallback, useEffect, useRef, useState } from "react";
import { createLoadLog } from "../lib/operationLog.js";
import { editorMessages } from "../lib/editorMessages.js";
import useLanguage from "./useLanguage.jsx";

function getMediaType(fileName = "") {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (["mp3", "wav", "m4a", "aac", "flac", "ogg"].includes(extension)) return "audio";
  if (["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(extension)) return "image";
  return "video";
}

// Owns source selection, metadata loading, and initial timeline setup.
export default function useSourceLoader({
  editorApi,
  setSourcePath,
  setSourceUrl,
  setSourceName,
  registerSource,
  setMetadata,
  setSegments,
  setSelectionStart,
  setSelectionEnd,
  setPlayheadWithPreview,
  setClipboard,
  setTimelineParts,
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
  backupSourceOnImport = false,
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
      messages.setErrorMessage(editorMessages.desktopShellRequired);
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
      const mediaType = result.mediaType || getMediaType(result.fileName || result.filePath);
      const info = result.info || (await editorApi.probeVideo(result.filePath));

      setLoadingProgress(40);
      setLoadingMessage(t("processingMetadata"));
      setLoadingIndeterminate(false);

      const nextSourceName = result.fileName || result.filePath.split(/[\\/]/).pop() || "video";
      const wasRegistered = registerSource?.({
        filePath: result.filePath,
        fileUrl: result.fileUrl,
        fileName: nextSourceName,
        info,
        mediaType
      });
      if (wasRegistered === false) {
        stopLoadingOverlay();
        return;
      }
      if (mediaType !== "video") {
        stopLoadingOverlay();
        return;
      }
      setSourcePath(result.filePath);
      setSourceUrl(result.fileUrl);
      setSourceName(nextSourceName);

      setLoadingProgress(70);
      setLoadingMessage(t("buildingTimeline"));
      setMetadata(info);
      // Loading a source prepares it for editing but does not place it on the timeline.
      setSegments([]);
      setSelectionStart(0);
      setSelectionEnd(info.duration);
      setPlayheadWithPreview(0);
      setClipboard([]);
      setTimelineParts([]);
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
  }, [clearLoadCompletionTimeout, clearUndoHistory, editorApi, emptyCrop, isOperationTypeEnabled, loadCompletionTimeoutRef, messages, registerSource, resetCropSelection, setClipboard, setCrop, setIsLoading, setLoadingIndeterminate, setLoadingMessage, setLoadingProgress, setMetadata, setOperationLogs, setOutputPath, setPlayheadWithPreview, setSelectionEnd, setSelectionStart, setSegments, setSourceName, setSourcePath, setSourceUrl, setTimelineParts, stopLoadingOverlay]);

  const handleChooseSource = useCallback(async () => {
    if (!editorApi) {
      messages.setErrorMessage(t("desktopShellRequired"));
      return;
    }

    setIsLoading(true);
    setLoadingProgress(0);
    setLoadingMessage(t("openingFileDialog"));
    setLoadingIndeterminate(true);
    loadStartTimeRef.current = Date.now();

    try {
      const results = await editorApi.selectSource();
      if (!results?.length) {
        stopLoadingOverlay();
        messages.setStatusMessage(t("videoSelectionCancelled"));
        return;
      }

      let activeVideoLoaded = false;
      for (const result of results) {
        const mediaType = getMediaType(result.fileName || result.filePath);
        if (editorApi.backupSource && backupSourceOnImport) {
          try {
            const backup = await editorApi.backupSource(result.filePath);
            if (backup?.filePath) messages.setStatusMessage(t("backupSaved"));
          } catch (error) {
            console.error("Failed to save source backup", error);
            messages.setErrorMessage(t("backupFailed"));
          }
        }

        if (mediaType === "video" && !activeVideoLoaded) {
          await loadSource({ ...result, mediaType });
          activeVideoLoaded = true;
          continue;
        }

        try {
          const info = await editorApi.probeVideo(result.filePath);
          registerSource?.({ ...result, info, mediaType });
        } catch (error) {
          console.error("Failed to probe media source", result.filePath, error);
          messages.setErrorMessage(error?.message || t("videoLoadingFailed"));
        }
      }
      if (!activeVideoLoaded) stopLoadingOverlay();
    } catch (error) {
      stopLoadingOverlay();
      setLoadingProgress(0);
      messages.setErrorMessage(error?.message || editorMessages.videoSelectionFailed);
      messages.setStatusMessage(editorMessages.loadFailed);
    }
  }, [backupSourceOnImport, editorApi, loadSource, loadStartTimeRef, messages, registerSource, setIsLoading, setLoadingIndeterminate, setLoadingMessage, setLoadingProgress, stopLoadingOverlay, t]);

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
