import React from "react";

export default function ImportSettings({ draft, updateDraft, t }) {
  return (
    <section className="settings-section settings-tab-panel">
      <h3>{t("importSettings")}</h3>
      <div className="settings-table-wrapper">
        <table className="settings-table settings-table--import">
          <thead>
            <tr>
              <th scope="col">{t("settingItem")}</th>
              <th scope="col">{t("settingValue")}</th>
              <th scope="col">{t("description")}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{t("backupSourceOnImport")}</th>
              <td>
                <input
                  type="checkbox"
                  checked={draft.backupSourceOnImport}
                  onChange={(event) => updateDraft("backupSourceOnImport", event.target.checked)}
                />
              </td>
              <td>{t("backupSourceOnImportDescription")}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
