// Settings UI for keyboard shortcuts, operation logs, and import/export options.
import React, { useEffect, useState } from "react";
import useLanguage from "../hooks/useLanguage.jsx";
import { OPERATION_TYPES } from "../hooks/useOperationLogs.jsx";
import DownloadSettings from "./DownloadSettings.jsx";
import {
  detectKeyConflicts,
  getAllShortcutNames,
  getDefaultShortcuts,
  getKeyCode,
  getKeyLabel,
  isValidKeyPress,
  loadShortcuts,
  saveShortcuts
} from "../lib/shortcutManager.js";
import "../styles/settings-modal.css";
import "../styles/shortcut-settings-modal.css";

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
  outputPath,
  onChooseOutput,
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
      audioGainPercent,
      audioNormalize,
      excludedOperationTypes: [...excludedOperationTypes]
    });
    setShortcuts(loadShortcuts());
    setEditingKey(null);
    setSaveMessage("");
    setActiveTab("logs");
  }, [isOpen]);

  useEffect(() => {
    setConflicts(detectKeyConflicts(shortcuts));
  }, [shortcuts]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
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
          {/* Operation log recording settings. */}
          {activeTab === "logs" && <section className="settings-section settings-tab-panel">
            <h3>{t("logSettings")}</h3>
            <p className="settings-description">{t("logSettingsDescription")}</p>
            <div className="settings-log-options">
              {OPERATION_TYPES.map((operationType) => (
                <label className="settings-checkbox" key={operationType}>
                  <input
                    type="checkbox"
                    checked={!draft.excludedOperationTypes.includes(operationType)}
                    onChange={() => toggleOperationType(operationType)}
                  />
                  {t("recordOperation", operationLabels[operationType])}
                </label>
              ))}
            </div>
          </section>}

          {/* Keyboard shortcut settings. */}
          {activeTab === "shortcuts" && <section className="settings-section settings-tab-panel">
            <h3>{t("shortcut")}</h3>
            <p className="settings-description">{t("shortcutDescription")}</p>
            {conflicts.length > 0 && (
              <div className="conflict-warning">
                <strong>{t("shortcutConflict")}</strong>
                <ul>
                  {conflicts.map((conflict) => (
                    <li key={conflict.key}>
                      「{conflict.key}」: {conflict.actions.map((action) => shortcutLabels[action] || action).join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="shortcut-table-wrapper">
              <table className="shortcut-table">
                <thead>
                  <tr>
                    <th>{t("function")}</th>
                    <th>{t("currentKey")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {shortcutNames.map((name) => {
                    const config = shortcuts[name];
                    const isEditing = editingKey === name;
                    const hasConflict = conflicts.some((conflict) => conflict.actions.includes(name));
                    return (
                      <tr key={name} className={`shortcut-row ${hasConflict ? "has-conflict" : ""}`}>
                        <td className="shortcut-name">
                          <span>{shortcutLabels[name] || name}</span>
                          {hasConflict && <span className="conflict-badge">{t("duplicate")}</span>}
                        </td>
                        <td className="shortcut-key">
                          {isEditing ? (
                            <input
                              type="text"
                              className="key-input"
                              placeholder={t("pressKey")}
                              onKeyDown={(event) => handleKeyDown(event, name)}
                              autoFocus
                            />
                          ) : <span className="key-display">{config?.label || "-"}</span>}
                        </td>
                        <td className="shortcut-actions">
                          <button type="button" className={`edit-button ${isEditing ? "active" : ""}`} onClick={() => setEditingKey(isEditing ? null : name)}>
                            {isEditing ? t("cancel") : t("change")}
                          </button>
                          <button type="button" className="edit-button reset-shortcut-button" onClick={() => handleResetShortcut(name)}>
                            {t("reset")}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button type="button" className="ghost-button settings-reset-shortcuts" onClick={handleResetShortcuts}>
              {t("resetShortcuts")}
            </button>
          </section>}


          {activeTab === "download" && (
            <DownloadSettings
              draft={draft}
              updateDraft={updateDraft}
              editorApi={editorApi}
              onError={onError}
              t={t}
              outputPath={outputPath}
              isExporting={isExporting}
              onChooseOutput={onChooseOutput}
            />
          )}

          {/* Source import settings. */}
          {activeTab === "import" && <section className="settings-section settings-tab-panel">
            <h3>{t("importSettings")}</h3>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={draft.backupSourceOnImport}
                onChange={(event) => updateDraft("backupSourceOnImport", event.target.checked)}
              />
              {t("backupSourceOnImport")}
            </label>
          </section>}

          {/* Video export settings. */}
          {activeTab === "videoExport" && <section className="settings-section settings-tab-panel">
            <h3>{t("exportSettings")}</h3>
            <label className="settings-field">
              {t("exportProfile")}
              <select value={draft.exportProfile} onChange={(event) => updateDraft("exportProfile", event.target.value)}>
                <option value="fast">{t("fast")}</option>
                <option value="standard">{t("standard")}</option>
                <option value="high">{t("highQuality")}</option>
                <option value="gpu">{t("gpuFirst")}</option>
              </select>
            </label>

            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={draft.preserveCropResolution}
                onChange={(event) => updateDraft("preserveCropResolution", event.target.checked)}
              />
              {t("preserveResolution")}
            </label>

            {draft.preserveCropResolution && (
              <label className="settings-field">
                {t("scalingAlgorithm")}
                <select value={draft.cropScaleAlgorithm} onChange={(event) => updateDraft("cropScaleAlgorithm", event.target.value)}>
                  <option value="lanczos">{t("highQuality")} (Lanczos)</option>
                  <option value="bilinear">{t("fast")} (Bilinear)</option>
                </select>
              </label>
            )}

            <label className="settings-field">
              {t("volumeLabel")}
              <input
                type="range"
                min="0"
                max="200"
                step="1"
                value={draft.audioGainPercent}
                onChange={(event) => updateDraft("audioGainPercent", Number(event.target.value))}
              />
              <span>{draft.audioGainPercent}%</span>
            </label>

            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={draft.audioNormalize}
                onChange={(event) => updateDraft("audioNormalize", event.target.checked)}
              />
              {t("normalizeAudio")}
            </label>
          </section>}
        </div>
        
      </div>
    </div>
  );
}