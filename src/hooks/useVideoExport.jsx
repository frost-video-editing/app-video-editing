import { useCallback } from "react";
import { segmentDuration } from "../lib/videoTimeline.js";
import { normalizeCropInput } from "../lib/crop.js";
import { createExportLog } from "../lib/operationLog.js";
import { editorMessages } from "../lib/editorMessages.js";

// Owns the Electron export request, progress initialization, and export notices.
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
  return useCallback(async () => {
    if (!editorApi) {
      messages.setErrorMessage(editorMessages.runOnElectron);
      return;
    }
    if (!sourcePath || !segments.length) {
      messages.setErrorMessage(editorMessages.chooseVideoFirst);
      return;
    }

    const safeSegments = segments.filter((segment) => segmentDuration(segment) > 0);
    if (!safeSegments.length) {
      messages.setErrorMessage("出力できるセグメントがありません。");
      return;
    }

    const chosenOutput = outputPath || (await editorApi.selectOutput({ suggestedName: sourceName || "edited-video.mp4" }))?.filePath;
    if (!chosenOutput) return;

    setOutputPath(chosenOutput);
    setIsExporting(true);
    setIsExportConfirmOpen(false);
    setExportProgress(0);
    setExportMessage("出力準備中...");
    setExportIndeterminate(true);
    exportStartTimeRef.current = Date.now();
    messages.clearErrorOnly();
    messages.setStatusMessage("動画を出力中...");

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
        audioNormalize: Boolean(audioNormalize)
      });
      const outputPaths = Array.isArray(result?.outputPaths) && result.outputPaths.length ? result.outputPaths : [chosenOutput];
      messages.setStatusMessage(`${outputPaths.length} 個のファイルを出力しました。`);
      if (isOperationTypeEnabled("export")) {
        setOperationLogs((current) => [...current, createExportLog(sourceName, chosenOutput, safeSegments.length, metadata, {
          crop: normalizedCrop,
          audioGainPercent,
          audioNormalize
        })]);
      }
      await editorApi.revealInFolder(outputPaths[0]);
    } catch (error) {
      if (error?.code === "EXPORT_CANCELLED" || error?.message === "EXPORT_CANCELLED") {
        messages.setStatusMessage("動画の出力をキャンセルしました。");
      } else {
        messages.setErrorMessage(error?.message || editorMessages.exportFailed);
        messages.setStatusMessage("エラー: 動画の出力に失敗しました。");
      }
    } finally {
      setIsExporting(false);
      resetExportOverlay();
    }
  }, [audioGainPercent, audioNormalize, crop, cropScaleAlgorithm, editorApi, exportProfile, exportStartTimeRef, isOperationTypeEnabled, messages, metadata, outputPath, preserveCropResolution, resetExportOverlay, segments, setExportIndeterminate, setExportMessage, setExportProgress, setIsExportConfirmOpen, setIsExporting, setOperationLogs, setOutputPath, sourceName, sourcePath]);
}
