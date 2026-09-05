import React from "react";

export default function LogSettings({ draft, operationLabels, operationTypes, toggleOperationType, t }) {
  return (
    <section className="settings-section settings-tab-panel">
      <h3>{t("logSettings")}</h3>
      <p className="settings-description">{t("logSettingsDescription")}</p>
      <div className="settings-log-options">
        {operationTypes.map((operationType) => (
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
    </section>
  );
}
