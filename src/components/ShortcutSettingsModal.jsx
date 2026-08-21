import React, { useState, useEffect } from "react";
import useLanguage from "../hooks/useLanguage.jsx";
import {
  loadShortcuts,
  saveShortcuts,
  getShortcutDescription,
  getAllShortcutNames,
  getDefaultShortcuts,
  getKeyLabel,
  getKeyCode,
  isValidKeyPress,
  detectKeyConflicts
} from "../lib/shortcutManager.js";
import "../styles/shortcut-settings-modal.css";

export default function ShortcutSettingsModal({ isOpen, onClose }) {
  const { t } = useLanguage();
  const [shortcuts, setShortcuts] = useState({});
  const [editingKey, setEditingKey] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (isOpen) {
      const loaded = loadShortcuts();
      setShortcuts(loaded);
      setEditingKey(null);
      setConflicts([]);
      setMessage("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handleEscape(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    const newConflicts = detectKeyConflicts(shortcuts);
    setConflicts(newConflicts);
  }, [shortcuts]);

  function handleKeyDown(e, shortcutName) {
    e.preventDefault?.();

    if (!isValidKeyPress(e)) {
      setMessage(t("modifierOnly"));
      return;
    }

    const label = getKeyLabel(e);
    const code = getKeyCode(e);

    const updated = {
      ...shortcuts,
      [shortcutName]: { key: e.key, code, label }
    };

    setShortcuts(updated);
    setEditingKey(null);
    setMessage(`${getShortcutDescription(shortcutName)} を "${label}" に設定しました`);

    setTimeout(() => setMessage(""), 3000);
  }

  function handleResetShortcut(shortcutName) {
    const defaultShortcut = getDefaultShortcuts()[shortcutName];
    setShortcuts((current) => ({ ...current, [shortcutName]: defaultShortcut }));
    setEditingKey(null);
    setMessage(`${getShortcutDescription(shortcutName)} をデフォルトに戻しました`);
  }

  function handleReset() {
    if (window.confirm(t("resetShortcutsConfirm"))) {
      setShortcuts(getDefaultShortcuts());
      setEditingKey(null);
      setConflicts([]);
      setMessage(t("defaultsRestored"));
      setTimeout(() => setMessage(""), 3000);
    }
  }

  function handleSave() {
    if (conflicts.length > 0) {
      setMessage(t("shortcutConflictCheck"));
      return;
    }

    const success = saveShortcuts(shortcuts);
    if (success) {
      setMessage(t("shortcutSaved"));
      setTimeout(() => {
        setMessage("");
        onClose();
      }, 1500);
    } else {
      setMessage(t("saveFailed"));
    }
  }

  if (!isOpen) return null;

  const shortcutNames = getAllShortcutNames();
  const hasConflict = conflicts.length > 0;

  return (
    <div className="shortcut-modal-overlay" onClick={onClose}>
      <div className="shortcut-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="shortcut-modal-header">
          <h2>{t("shortcutSettings")}</h2>
          <button type="button" className="close-button" onClick={onClose} aria-label={t("closeSettings")}>✕</button>
        </div>

        <div className="shortcut-modal-body">
          {message && (
            <div className={`message ${hasConflict && message.includes("重複") ? "error" : "success"}`}>
              {message}
            </div>
          )}

          {hasConflict && (
            <div className="conflict-warning">
              <strong>⚠️ {t("shortcutConflictDetected")}</strong>
              <ul>
                {conflicts.map((conflict, idx) => (
                  <li key={idx}>
                    「<strong>{conflict.key}</strong>」 が <strong>{conflict.actions.map((a) => getShortcutDescription(a)).join(", ")}</strong> に重複しています
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
                  const hasThisConflict = conflicts.some(c => c.actions.includes(name));

                  return (
                    <tr key={name} className={`shortcut-row ${hasThisConflict ? "has-conflict" : ""}`}>
                      <td className="shortcut-name">
                        <span>{getShortcutDescription(name)}</span>
                        {hasThisConflict && <span className="conflict-badge">{t("duplicate")}</span>}
                      </td>
                      <td className="shortcut-key">
                        {isEditing ? (
                          <input
                            type="text"
                            className="key-input"
                            placeholder={t("pressKey")}
                            onKeyDown={(e) => handleKeyDown(e, name)}
                            autoFocus
                          />
                        ) : (
                          <span className="key-display">{config?.label || "-"}</span>
                        )}
                      </td>
                      <td className="shortcut-actions">
                        <button
                          type="button"
                          className={`edit-button ${isEditing ? "active" : ""}`}
                          onClick={() => setEditingKey(isEditing ? null : name)}
                        >
                          {isEditing ? t("cancel") : t("change")}
                        </button>
                        <button
                          type="button"
                          className="edit-button reset-shortcut-button"
                          onClick={() => handleResetShortcut(name)}
                          title={t("resetThisKey")}
                        >
                          {t("reset")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="shortcut-modal-footer">
          <button type="button" className="button ghost-button" onClick={handleReset}>
            {t("restoreDefaults")}
          </button>
          <div style={{ flex: 1 }}></div>
          <button type="button" className="button ghost-button" onClick={onClose}>
            {t("cancel")}
          </button>
          <button 
            type="button"
            className="button secondary-button" 
            onClick={handleSave}
            disabled={hasConflict}
            title={hasConflict ? t("resolveShortcutConflicts") : ""}
          >
            {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
