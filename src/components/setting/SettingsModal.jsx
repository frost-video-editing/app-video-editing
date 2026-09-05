// Settings UI for keyboard shortcuts, operation logs, and import/export options.
import React, { useEffect, useState } from "react";
import useLanguage from "../../hooks/useLanguage.jsx";
import { OPERATION_TYPES } from "../../hooks/useOperationLogs.jsx";
import VideoExportSettings from "./VideoExportSettings.jsx";
import DownloadSettings from "./DownloadSettings.jsx";
import ImportSettings from "./ImportSettings.jsx";
import LogSettings from "./LogSettings.jsx";
import ShortcutSettingsModal from "./ShortcutSettingsModal.jsx";
import {
  detectKeyConflicts,
  getAllShortcutNames,
  getDefaultShortcuts,
  getKeyCode,
  getKeyLabel,
  isValidKeyPress,
  loadShortcuts,
  saveShortcuts
} from "../../lib/shortcutManager.js";

import "../../styles/settings-modal.css";
import "../../styles/shortcut-settings-modal.css";

export default function SettingsModal({
  isOpen,
  onClose,
  preserveCropResolution,
  setPreserveCropResolution,
  backupSourceOnImport,
  setBackupSourceOnImport,
  cropScaleAlgorithm,
  setCropScaleAlgorithm,
  exportProfile,
  setExportProfile,
  editorApi,
  onError,
  cropPresetsExportPath,
  setCropPresetsExportPath,
  outputDirectoryPath,
  setOutputDirectoryPath,
  onChooseOutputFolder,
  isExporting,
  audioGainPercent,
  setAudioGainPercent,
  audioNormalize,
  setAudioNormalize,
  excludedOperationTypes,
  setExcludedOperationTypes
}) {
  const { t } = useLanguage();
  const operationLabels = {
    copy: t("copy"), cut: t("cut"), paste: t("paste"), delete: t("delete"),
    undo: t("undoAction"), crop: t("crop"), export: t("export"), load: t("loadVideo")
  };
  const shortcutLabels = {
    playPause: t("playPause"), cut: t("cut"), copy: t("copy"), paste: t("paste"),
    delete: t("delete"), undo: t("undoAction"), crop: t("crop"), export: t("export")
  };
  const [draft, setDraft] = useState(null);
  const [shortcuts, setShortcuts] = useState({});
  const [editingKey, setEditingKey] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [activeTab, setActiveTab] = useState("logs");

  useEffect(() => {
    if (!isOpen) return;
    setDraft({
      preserveCropResolution,
      backupSourceOnImport,
      cropScaleAlgorithm,
      exportProfile,
      cropPresetsExportPath,
      outputDirectoryPath,
      audioGainPercent,
      audioNormalize,
      excludedOperationTypes: [...excludedOperationTypes]
    });
    setShortcuts(loadShortcuts());
    setEditingKey(null);
    setSaveMessage("");
    setActiveTab("videoExport");
  }, [isOpen]);

  useEffect(() => {
    setConflicts(detectKeyConflicts(shortcuts));
  }, [shortcuts]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !draft) return null;

  const updateDraft = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const toggleOperationType = (operationType) => {
    setDraft((current) => ({
      ...current,
      excludedOperationTypes: current.excludedOperationTypes.includes(operationType)
        ? current.excludedOperationTypes.filter((type) => type !== operationType)
        : [...current.excludedOperationTypes, operationType]
    }));
  };

  const handleKeyDown = (event, shortcutName) => {
    event.preventDefault();
    if (!isValidKeyPress(event)) {
      onError(t("modifierOnly"));
      return;
    }

    setShortcuts((current) => ({
      ...current,
      [shortcutName]: {
        key: event.key,
        code: getKeyCode(event),
        label: getKeyLabel(event)
      }
    }));
    setEditingKey(null);
  };

  const handleResetShortcut = (shortcutName) => {
    setShortcuts((current) => ({
      ...current,
      [shortcutName]: getDefaultShortcuts()[shortcutName]
    }));
    setEditingKey(null);
  };

  const handleResetShortcuts = () => {
    if (!window.confirm(t("resetShortcutsConfirm"))) return;
    setShortcuts(getDefaultShortcuts());
    setEditingKey(null);
  };

  const handleSave = () => {
    if (conflicts.length > 0) {
      onError(t("resolveShortcutConflicts"));
      return;
    }

    if (!saveShortcuts(shortcuts)) {
      onError(t("shortcutSaveFailed"));
      return;
    }

    setPreserveCropResolution(draft.preserveCropResolution);
    setBackupSourceOnImport(draft.backupSourceOnImport);
    window.localStorage.setItem("videoEditor.backupSourceOnImport", String(draft.backupSourceOnImport));
    setCropScaleAlgorithm(draft.cropScaleAlgorithm);
    setExportProfile(draft.exportProfile);
    setCropPresetsExportPath(draft.cropPresetsExportPath);
    window.localStorage.setItem("videoEditor.cropPresetsExportPath", draft.cropPresetsExportPath);
    setOutputDirectoryPath(draft.outputDirectoryPath);
    window.localStorage.setItem("videoEditor.outputDirectoryPath", draft.outputDirectoryPath);
    setAudioGainPercent(draft.audioGainPercent);
    setAudioNormalize(draft.audioNormalize);
    setExcludedOperationTypes(draft.excludedOperationTypes);
    onClose();
  };

  const shortcutNames = getAllShortcutNames();

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal-content" onClick={(event) => event.stopPropagation()}>
        <header className="settings-modal-header">
          <div>
            <p className="eyebrow">{t("settings")}</p>
            <h2>{t("settings")}</h2>
          </div>
          <div className="settings-header-actions">
            <button type="button" className="ghost-button" onClick={onClose}>{t("cancel")}</button>
            <button type="button" onClick={handleSave}>{t("save")}</button>
          </div>
        </header>

        <nav className="settings-tabs" aria-label={t("settingsCategory")}>
          <button type="button" className={activeTab === "videoExport" ? "settings-tab settings-tab--active" : "settings-tab"} onClick={() => setActiveTab("videoExport")}>{t("exportSettings")}</button>
          <button type="button" className={activeTab === "download" ? "settings-tab settings-tab--active" : "settings-tab"} onClick={() => setActiveTab("download")}>{t("downloadSettings")}</button>
          <button type="button" className={activeTab === "import" ? "settings-tab settings-tab--active" : "settings-tab"} onClick={() => setActiveTab("import")}>{t("importSettings")}</button>
          <button type="button" className={activeTab === "shortcuts" ? "settings-tab settings-tab--active" : "settings-tab"} onClick={() => setActiveTab("shortcuts")}>{t("shortcut")}</button>
          <button type="button" className={activeTab === "logs" ? "settings-tab settings-tab--active" : "settings-tab"} onClick={() => setActiveTab("logs")}>{t("logSettings")}</button>
        </nav>

        <div className="settings-modal-body">

          {activeTab === "videoExport" && <VideoExportSettings draft={draft} updateDraft={updateDraft} t={t} />}
          
            {/* Download settings. */}
          {activeTab === "download" && (
            <DownloadSettings
              draft={draft}
              updateDraft={updateDraft}
              editorApi={editorApi}
              onError={onError}
              t={t}
              outputDirectoryPath={outputDirectoryPath}
              isExporting={isExporting}
              onChooseOutputFolder={onChooseOutputFolder}
            />
          )}

          {activeTab === "import" && <ImportSettings draft={draft} updateDraft={updateDraft} t={t} />}

          {/* Keyboard shortcut settings. */}
          {activeTab === "shortcuts" && (
            <ShortcutSettingsModal
              shortcuts={shortcuts}
              shortcutNames={shortcutNames}
              shortcutLabels={shortcutLabels}
              conflicts={conflicts}
              editingKey={editingKey}
              onKeyDown={handleKeyDown}
              onEdit={(name) => setEditingKey(editingKey === name ? null : name)}
              onReset={handleResetShortcut}
              onResetAll={handleResetShortcuts}
              t={t}
            />
          )}

          {activeTab === "logs" && (
            <LogSettings
              draft={draft}
              operationLabels={operationLabels}
              operationTypes={OPERATION_TYPES}
              toggleOperationType={toggleOperationType}
              t={t}
            />
          )}
        </div>        
      </div>
    </div>
  );
}