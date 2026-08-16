import React, { useEffect, useState } from "react";
import { OPERATION_TYPES } from "../hooks/useOperationLogs.jsx";
import {
  detectKeyConflicts,
  getAllShortcutNames,
  getDefaultShortcuts,
  getKeyCode,
  getKeyLabel,
  getShortcutDescription,
  isValidKeyPress,
  loadShortcuts,
  saveShortcuts
} from "../lib/shortcutManager.js";
import "../styles/settings-modal.css";
import "../styles/shortcut-settings-modal.css";

const OPERATION_LABELS = {
  copy: "コピー",
  cut: "カット",
  paste: "貼り付け",
  delete: "削除",
  undo: "元に戻す",
  crop: "Crop",
  export: "動画出力",
  load: "動画読み込み"
};

export default function SettingsModal({
  isOpen,
  onClose,
  preserveCropResolution,
  setPreserveCropResolution,
  cropScaleAlgorithm,
  setCropScaleAlgorithm,
  exportProfile,
  setExportProfile,
  audioGainPercent,
  setAudioGainPercent,
  audioNormalize,
  setAudioNormalize,
  excludedOperationTypes,
  setExcludedOperationTypes
}) {
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
      cropScaleAlgorithm,
      exportProfile,
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
      setSaveMessage("モディファイアキーのみは登録できません");
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
    if (!window.confirm("すべてのショートカットをデフォルトに戻しますか？")) return;
    setShortcuts(getDefaultShortcuts());
    setEditingKey(null);
  };

  const handleSave = () => {
    if (conflicts.length > 0) {
      setSaveMessage("ショートカットキーの重複を解決してから保存してください。");
      return;
    }

    if (!saveShortcuts(shortcuts)) {
      setSaveMessage("ショートカット設定の保存に失敗しました。");
      return;
    }

    setPreserveCropResolution(draft.preserveCropResolution);
    setCropScaleAlgorithm(draft.cropScaleAlgorithm);
    setExportProfile(draft.exportProfile);
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
            <p className="eyebrow">Application Settings</p>
            <h2>設定</h2>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="設定を閉じる">✕</button>
        </header>

        <nav className="settings-tabs" aria-label="設定カテゴリー">
          <button type="button" className={activeTab === "logs" ? "settings-tab settings-tab--active" : "settings-tab"} onClick={() => setActiveTab("logs")}>記録ログ設定</button>
          <button type="button" className={activeTab === "shortcuts" ? "settings-tab settings-tab--active" : "settings-tab"} onClick={() => setActiveTab("shortcuts")}>ショートカットキー</button>
          <button type="button" className={activeTab === "export" ? "settings-tab settings-tab--active" : "settings-tab"} onClick={() => setActiveTab("export")}>動画出力設定</button>
        </nav>

        <div className="settings-modal-body">
          {saveMessage && <div className={`message ${conflicts.length ? "error" : "success"}`}>{saveMessage}</div>}

          {activeTab === "export" && <section className="settings-section settings-tab-panel">
            <h3>動画出力設定</h3>
            <label className="settings-field">
              出力プロファイル
              <select value={draft.exportProfile} onChange={(event) => updateDraft("exportProfile", event.target.value)}>
                <option value="fast">高速</option>
                <option value="standard">標準</option>
                <option value="high">高品質</option>
                <option value="gpu">GPU優先</option>
              </select>
            </label>

            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={draft.preserveCropResolution}
                onChange={(event) => updateDraft("preserveCropResolution", event.target.checked)}
              />
              Crop後も元の解像度を維持する
            </label>

            {draft.preserveCropResolution && (
              <label className="settings-field">
                拡大補間
                <select value={draft.cropScaleAlgorithm} onChange={(event) => updateDraft("cropScaleAlgorithm", event.target.value)}>
                  <option value="lanczos">高品質 (Lanczos)</option>
                  <option value="bilinear">高速 (Bilinear)</option>
                </select>
              </label>
            )}

            <label className="settings-field">
              音量
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
              音声を正規化する
            </label>
          </section>}

          {activeTab === "logs" && <section className="settings-section settings-tab-panel">
            <h3>記録ログ設定</h3>
            <p className="settings-description">チェックを外した操作は新しく記録されません。</p>
            <div className="settings-log-options">
              {OPERATION_TYPES.map((operationType) => (
                <label className="settings-checkbox" key={operationType}>
                  <input
                    type="checkbox"
                    checked={!draft.excludedOperationTypes.includes(operationType)}
                    onChange={() => toggleOperationType(operationType)}
                  />
                  {OPERATION_LABELS[operationType]}を記録する
                </label>
              ))}
            </div>
          </section>}

          {activeTab === "shortcuts" && <section className="settings-section settings-tab-panel">
            <h3>ショートカットキー</h3>
            <p className="settings-description">変更を選択してから、割り当てたいキーを押してください。</p>
            {conflicts.length > 0 && (
              <div className="conflict-warning">
                <strong>ショートカットキーの重複があります。</strong>
                <ul>
                  {conflicts.map((conflict) => (
                    <li key={conflict.key}>
                      「{conflict.key}」: {conflict.actions.map((action) => getShortcutDescription(action)).join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="shortcut-table-wrapper">
              <table className="shortcut-table">
                <thead>
                  <tr>
                    <th>機能</th>
                    <th>現在のキー</th>
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
                          <span>{getShortcutDescription(name)}</span>
                          {hasConflict && <span className="conflict-badge">重複</span>}
                        </td>
                        <td className="shortcut-key">
                          {isEditing ? (
                            <input
                              type="text"
                              className="key-input"
                              placeholder="キーを押してください..."
                              onKeyDown={(event) => handleKeyDown(event, name)}
                              autoFocus
                            />
                          ) : <span className="key-display">{config?.label || "-"}</span>}
                        </td>
                        <td className="shortcut-actions">
                          <button type="button" className={`edit-button ${isEditing ? "active" : ""}`} onClick={() => setEditingKey(isEditing ? null : name)}>
                            {isEditing ? "キャンセル" : "変更"}
                          </button>
                          <button type="button" className="edit-button reset-shortcut-button" onClick={() => handleResetShortcut(name)}>
                            初期化
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button type="button" className="ghost-button settings-reset-shortcuts" onClick={handleResetShortcuts}>
              ショートカットを初期化
            </button>
          </section>}
        </div>

        <footer className="settings-modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>キャンセル</button>
          <button type="button" onClick={handleSave}>保存</button>
        </footer>
      </div>
    </div>
  );
}