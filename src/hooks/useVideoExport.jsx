import { useCallback } from "react";
import { segmentDuration } from "../lib/videoTimeline.js";
import { normalizeCropInput } from "../lib/crop.js";
import { createExportLog } from "../lib/operationLog.js";
import { editorMessages } from "../lib/editorMessages.js";
import useLanguage from "./useLanguage.jsx";

function joinOutputPath(folderPath, fileName) {
  const separator = folderPath.includes("\\") ? "\\" : "/";
  return `${folderPath.replace(/[\\/]$/, "")}${separator}${fileName}`;
}

// Owns the export request, progress initialization, and export notices.
export default function useVideoExport({
  editorApi,
  sourcePath,
  sourceName,
  segments,
  crop,
  metadata,
  outputPath,
  preserveCropResolution,
  cropScaleAlgorithm,
  exportProfile,
  audioGainPercent,
  audioNormalize,
  audioOnly,
  outputDirectoryPath,
  setOutputPath,
  setIsExporting,
  setIsExportConfirmOpen,
  setExportProgress,
  setExportMessage,
  setExportIndeterminate,
  exportStartTimeRef,
  resetExportOverlay,
  setOperationLogs,
  isOperationTypeEnabled = () => true,
  messages
}) {
  const { t } = useLanguage();
  return useCallback(async () => {
    if (!editorApi) {
      messages.setErrorMessage(editorMessages.desktopShellRequired);
      return;
    }
    if (!sourcePath || !segments.length) {
      messages.setErrorMessage(editorMessages.chooseVideoFirst);
      return;
    }

    const safeSegments = segments.filter((segment) => segmentDuration(segment) > 0);
    if (!safeSegments.length) {
      messages.setErrorMessage(t("noExportSegments"));
      return;
    }

    const suggestedName = audioOnly
      ? (sourceName || "edited-video.mp4").replace(/\.[^.]+$/, "-audio.mp4")
      : (sourceName || "edited-video.mp4");
    const chosenOutput = outputPath || (outputDirectoryPath
      ? joinOutputPath(outputDirectoryPath, suggestedName)
      : (await editorApi.selectOutput({ suggestedName }))?.filePath);
    if (!chosenOutput) return;

    setOutputPath(chosenOutput);
    setIsExporting(true);
    setIsExportConfirmOpen(false);
    setExportProgress(0);
    setExportMessage(t("exportPreparing"));
    setExportIndeterminate(true);
    exportStartTimeRef.current = Date.now();
    messages.clearErrorOnly();
    messages.setStatusMessage(t("exporting"));

    try {
      const normalizedCrop = normalizeCropInput(crop);
      const result = await editorApi.exportVideo({
        sourcePath,
        outputPath: chosenOutput,
        segments: safeSegments,
        crop: normalizedCrop,
        preserveCropResolution,
        cropScaleAlgorithm,
        exportProfile,
        audioGainPercent: Number(audioGainPercent || 100),
        audioNormalize: Boolean(audioNormalize),
        audioOnly: Boolean(audioOnly)
      });
      const outputPaths = Array.isArray(result?.outputPaths) && result.outputPaths.length ? result.outputPaths : [chosenOutput];
      messages.setStatusMessage(t("exportComplete", outputPaths.length));
      if (isOperationTypeEnabled("export")) {
        setOperationLogs((current) => [...current, createExportLog(sourceName, chosenOutput, safeSegments.length, metadata, {
          crop: normalizedCrop,
          audioGainPercent,
          audioNormalize
        })]);
      }
    } catch (error) {
      if (error?.code === "EXPORT_CANCELLED" || error?.message === "EXPORT_CANCELLED") {
        messages.setStatusMessage(t("exportCancelled"));
      } else {
        messages.setErrorMessage(error?.message || editorMessages.exportFailed);
        messages.setStatusMessage(t("exportFailedStatus"));
      }
    } finally {
      setIsExporting(false);
      resetExportOverlay();
    }
  }, [audioGainPercent, audioNormalize, audioOnly, crop, cropScaleAlgorithm, editorApi, exportProfile, exportStartTimeRef, isOperationTypeEnabled, messages, metadata, outputDirectoryPath, outputPath, preserveCropResolution, resetExportOverlay, segments, setExportIndeterminate, setExportMessage, setExportProgress, setIsExportConfirmOpen, setIsExporting, setOperationLogs, setOutputPath, sourceName, sourcePath]);
}
