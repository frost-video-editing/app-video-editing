import React from "react";

export default function ShortcutSettingsModal({
  shortcuts,
  shortcutNames,
  shortcutLabels,
  conflicts,
  editingKey,
  onKeyDown,
  onEdit,
  onReset,
  onResetAll,
  t
}) {
  return (
    <section className="settings-section settings-tab-panel">
      <h3>{t("shortcut")}</h3>
      <p className="settings-description">{t("shortcutDescription")}</p>
      {conflicts.length > 0 && (
        <div className="conflict-warning">
          <strong>{t("shortcutConflict")}</strong>
          <ul>{conflicts.map((conflict) => <li key={conflict.key}>「{conflict.key}」: {conflict.actions.map((action) => shortcutLabels[action] || action).join(", ")}</li>)}</ul>
        </div>
      )}
      <div className="shortcut-table-wrapper">
        <table className="shortcut-table">
          <thead><tr><th>{t("function")}</th><th>{t("currentKey")}</th><th></th></tr></thead>
          <tbody>
            {shortcutNames.map((name) => {
              const isEditing = editingKey === name;
              const hasConflict = conflicts.some((conflict) => conflict.actions.includes(name));
              return (
                <tr key={name} className={`shortcut-row ${hasConflict ? "has-conflict" : ""}`}>
                  <td className="shortcut-name"><span>{shortcutLabels[name] || name}</span>{hasConflict && <span className="conflict-badge">{t("duplicate")}</span>}</td>
                  <td className="shortcut-key">{isEditing ? <input type="text" className="key-input" placeholder={t("pressKey")} onKeyDown={(event) => onKeyDown(event, name)} autoFocus /> : <span className="key-display">{shortcuts[name]?.label || "-"}</span>}</td>
                  <td className="shortcut-actions">
                    <button type="button" className={`edit-button ${isEditing ? "active" : ""}`} onClick={() => onEdit(name)}>{isEditing ? t("cancel") : t("change")}</button>
                    <button type="button" className="edit-button reset-shortcut-button" onClick={() => onReset(name)}>{t("reset")}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" className="ghost-button settings-reset-shortcuts" onClick={onResetAll}>{t("resetShortcuts")}</button>
    </section>
  );
}
