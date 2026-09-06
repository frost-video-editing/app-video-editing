import { useCallback } from "react";
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
  setSourceMediaType,
  setSourceName,
  registerSource,
  setMetadata,
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
  backupSourceOnImport = false,
  messages
}) {
  const { t } = useLanguage();
  const loadSource = useCallback(async (result, { skipRegister = false } = {}) => {
    if (!result?.filePath) {
      messages.setErrorMessage(editorMessages.videoNotFound);
      messages.setStatusMessage(editorMessages.loadFailed);
      return;
    }

    if (!editorApi) {
      messages.setErrorMessage(editorMessages.desktopShellRequired);
      messages.setStatusMessage(editorMessages.loadFailed);
      return;
    }

    messages.clearErrorOnly();

    try {
      const mediaType = result.mediaType || getMediaType(result.fileName || result.filePath);
      const info = result.info || (await editorApi.probeVideo(result.filePath));

      const nextSourceName = result.fileName || result.filePath.split(/[\\/]/).pop() || "video";
      if (!skipRegister) {
        const wasRegistered = registerSource?.({
          filePath: result.filePath,
          fileUrl: result.fileUrl,
          fileName: nextSourceName,
          info,
          mediaType
        });
        if (wasRegistered === false) {
          return;
        }
      }
      setSourcePath(result.filePath);
      setSourceUrl(result.fileUrl);
      setSourceMediaType(mediaType);
      setSourceName(nextSourceName);

      const sourceDuration = mediaType === "image" ? 5 : info.duration;
      setMetadata({
        ...info,
        duration: sourceDuration
      });
      
      // Loading a source prepares it for editing but does not place it on the timeline.
      setSelectionStart(0);
      setSelectionEnd(sourceDuration);
      setPlayheadWithPreview(0);
      setClipboard([]);
      setOutputPath("");
      setCrop(emptyCrop);
      clearUndoHistory();
      resetCropSelection();

      messages.setStatusMessage(t("videoLoaded"));
      if (isOperationTypeEnabled("load")) {
        setOperationLogs((current) => [...current, createLoadLog(nextSourceName, info, result.filePath)]);
      }
    } catch (error) {
      messages.setErrorMessage(error?.message || editorMessages.videoLoadingFailed);
      messages.setStatusMessage(editorMessages.loadFailed);
    }
  }, [clearUndoHistory, editorApi, emptyCrop, isOperationTypeEnabled, messages, registerSource, resetCropSelection, setClipboard, setCrop, setMetadata, setOperationLogs, setOutputPath, setPlayheadWithPreview, setSelectionEnd, setSelectionStart, setSourceMediaType, setSourceName, setSourcePath, setSourceUrl, t]);

  const handleChooseSource = useCallback(async () => {
    if (!editorApi) {
      messages.setErrorMessage(t("desktopShellRequired"));
      return;
    }

    try {
      const results = await editorApi.selectSource();
      if (!results?.length) {
        messages.setStatusMessage(t("videoSelectionCancelled"));
        return;
      }

      let activeSourceLoaded = false;
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

        if (!activeSourceLoaded) {
          await loadSource({ ...result, mediaType });
          activeSourceLoaded = true;
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
    } catch (error) {
      messages.setErrorMessage(error?.message || editorMessages.videoSelectionFailed);
      messages.setStatusMessage(editorMessages.loadFailed);
    }
  }, [backupSourceOnImport, editorApi, loadSource, messages, registerSource, t]);

  return { loadSource, handleChooseSource };
}
