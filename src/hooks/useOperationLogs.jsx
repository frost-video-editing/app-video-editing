import { useCallback, useEffect, useState } from "react";
import {
  createCopyLog,
  createCutLog,
  createPasteLog,
  createDeleteLog,
  createUndoLog,
  createCropLog,
  createExportLog,
  createLoadLog
} from "../lib/operationLog.js";
import useLanguage from "./useLanguage.jsx";

const STORAGE_KEY = "videoEditor.operationLogs";
const LOG_SETTINGS_STORAGE_KEY = "videoEditor.operationLogSettings";
const MAX_LOGS = 500;
export const OPERATION_TYPES = ["copy", "cut", "paste", "delete", "undo", "crop", "export", "load"];

// Owns operation log persistence so the editor only manages log events.
export default function useOperationLogs() {
  const { t } = useLanguage();
  const [operationLogs, setOperationLogs] = useState(() => {
    try {
      const savedLogs = typeof window !== "undefined"
        ? window.localStorage.getItem(STORAGE_KEY)
        : null;
      const parsedLogs = savedLogs ? JSON.parse(savedLogs) : [];
      return Array.isArray(parsedLogs) ? parsedLogs : [];
    } catch (error) {
      console.error(t("restoreOperationLogsFailed"), error);
      return [];
    }
  });
  const [excludedOperationTypes, setExcludedOperationTypes] = useState(() => {
    try {
      const savedSettings = typeof window !== "undefined"
        ? window.localStorage.getItem(LOG_SETTINGS_STORAGE_KEY)
        : null;
      const parsedSettings = savedSettings ? JSON.parse(savedSettings) : {};
      return Array.isArray(parsedSettings.excludedOperationTypes)
        ? parsedSettings.excludedOperationTypes.filter((type) => OPERATION_TYPES.includes(type))
        : [];
    } catch (error) {
      console.error(t("restoreOperationLogSettingsFailed"), error);
      return [];
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(operationLogs.slice(-MAX_LOGS)));
    } catch (error) {
      console.error(t("persistOperationLogsFailed"), error);
    }
  }, [operationLogs]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        LOG_SETTINGS_STORAGE_KEY,
        JSON.stringify({ excludedOperationTypes })
      );
    } catch (error) {
      console.error(t("persistOperationLogSettingsFailed"), error);
    }
  }, [excludedOperationTypes]);

  const clearOperationLogs = useCallback(() => {
    setOperationLogs([]);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error(t("clearOperationLogsFailed"), error);
    }
  }, [t]);

  const isOperationTypeEnabled = useCallback(
    (operationType) => !excludedOperationTypes.includes(operationType),
    [excludedOperationTypes]
  );

  return {
    operationLogs,
    setOperationLogs,
    clearOperationLogs,
    excludedOperationTypes,
    setExcludedOperationTypes,
    isOperationTypeEnabled
  };
}

// Creates and appends structured operation logs from the current editor state.
export function useOperationLogger({
  selectedDuration,
  selectionStart,
  selectionEnd,
  playhead,
  clipboardDuration,
  crop,
  hasCrop,
  sourceName,
  outputPath,
  segmentsLength,
  metadata,
  setOperationLogs,
  isOperationTypeEnabled = () => true
}) {
  return useCallback((operationType) => {
    if (!isOperationTypeEnabled(operationType)) return;

    const log =
      operationType === "copy" ? createCopyLog(selectedDuration, selectionStart, selectionEnd) :
      operationType === "cut" ? createCutLog(playhead) :
      operationType === "paste" ? createPasteLog(playhead, clipboardDuration, clipboardDuration) :
      operationType === "delete" ? createDeleteLog(selectionStart, selectionEnd, selectedDuration) :
      operationType === "undo" ? createUndoLog() :
      operationType === "crop" ? createCropLog(crop, hasCrop) :
      operationType === "export" ? createExportLog(sourceName, outputPath, segmentsLength, metadata) :
      operationType === "load" ? createLoadLog(sourceName, metadata) :
      null;

    if (log) setOperationLogs((current) => [...current, log]);
  }, [clipboardDuration, crop, hasCrop, isOperationTypeEnabled, metadata, outputPath, playhead, segmentsLength, selectedDuration, selectionEnd, selectionStart, setOperationLogs, sourceName]);
}
