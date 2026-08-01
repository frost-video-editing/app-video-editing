import React, { useState, useEffect } from "react";
import {
  loadShortcuts,
  saveShortcuts,
  getShortcutDescription,
  getAllShortcutNames,
  getKeyLabel,
  getKeyCode,
  isValidKeyPress,
  detectKeyConflicts
} from "../lib/shortcutManager.js";
import "../styles/shortcut-settings-modal.css";

export default function ShortcutSettingsModal({ isOpen, onClose }) {
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
    const newConflicts = detectKeyConflicts(shortcuts);
    setConflicts(newConflicts);
  }, [shortcuts]);

  function handleKeyDown(e, shortcutName) {
    e.preventDefault?.();

    if (!isValidKeyPress(e)) {
      setMessage("モディファイアキーのみは登録できません");
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

  function handleReset() {
    if (window.confirm("すべてのショートカットをデフォルトに戻しますか？")) {
      const defaultShortcuts = require("../lib/shortcutManager.js").getDefaultShortcuts();
      setShortcuts(defaultShortcuts);
      setEditingKey(null);
      setConflicts([]);
      setMessage("デフォルト設定に戻しました");
      setTimeout(() => setMessage(""), 3000);
    }
  }

  function handleSave() {
    if (conflicts.length > 0) {
      setMessage("ショートカットキーの重複があります。確認してください。");
      return;
    }

    const success = saveShortcuts(shortcuts);
    if (success) {
      setMessage("ショートカット設定を保存しました");
      setTimeout(() => {
        setMessage("");
        onClose();
      }, 1500);
    } else {
      setMessage("保存に失敗しました。");
    }
  }

  if (!isOpen) return null;

  const shortcutNames = getAllShortcutNames();
  const hasConflict = conflicts.length > 0;

  return (
    <div className="shortcut-modal-overlay" onClick={onClose}>
      <div className="shortcut-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="shortcut-modal-header">
          <h2>ショートカットキー設定</h2>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        <div className="shortcut-modal-body">
          {message && (
            <div className={`message ${hasConflict && message.includes("重複") ? "error" : "success"}`}>
              {message}
            </div>
          )}

          {hasConflict && (
            <div className="conflict-warning">
              <strong>⚠️ ショートカットキーの重複を検出しました：</strong>
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
                  <th>機能</th>
                  <th>現在のキー</th>
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
                        {hasThisConflict && <span className="conflict-badge">重複</span>}
                      </td>
                      <td className="shortcut-key">
                        {isEditing ? (
                          <input
                            type="text"
                            className="key-input"
                            placeholder="キーを押してください..."
                            onKeyDown={(e) => handleKeyDown(e, name)}
                            autoFocus
                          />
                        ) : (
                          <span className="key-display">{config?.label || "-"}</span>
                        )}
                      </td>
                      <td className="shortcut-actions">
                        <button
                          className={`edit-button ${isEditing ? "active" : ""}`}
                          onClick={() => setEditingKey(isEditing ? null : name)}
                        >
                          {isEditing ? "キャンセル" : "変更"}
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
          <button className="button ghost-button" onClick={handleReset}>
            デフォルトに戻す
          </button>
          <div style={{ flex: 1 }}></div>
          <button className="button ghost-button" onClick={onClose}>
            キャンセル
          </button>
          <button 
            className="button secondary-button" 
            onClick={handleSave}
            disabled={hasConflict}
            title={hasConflict ? "重複を解決してから保存してください" : ""}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
