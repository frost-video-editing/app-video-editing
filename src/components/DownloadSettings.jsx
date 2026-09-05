import React from "react";

export function OutputPathButton({ outputPath, isExporting, onChooseOutput, t }) {
  return (
    <button type="button" className="secondary-button" onClick={onChooseOutput} disabled={isExporting}>
      {outputPath ? t("changeOutput") : t("chooseOutput")}
    </button>
  );
}

export default function DownloadSettings({
  draft,
  updateDraft,
  editorApi,
  onError,
  t,
  outputDirectoryPath,
  isExporting,
  onChooseOutputFolder
}) {
  const handleChoosePath = async () => {
    if (!editorApi?.selectPresetOutput) {
      onError(t("desktopShellRequired"));
      return;
    }

    try {
      const result = await editorApi.selectPresetOutput();
      if (result?.filePath) updateDraft("cropPresetsExportPath", result.filePath);
    } catch (error) {
      console.error("Failed to choose crop preset download path", error);
      onError(t("cropPresetsExportPathFailed"));
    }
  };

  return (
    <section className="settings-section settings-tab-panel">
      <h3>{t("downloadSettings")}</h3>
      <div className="settings-table-wrapper">
        <table className="settings-table">
          <thead>
            <tr>
              <th scope="col">{t("settingItem")}</th>
              <th scope="col">{t("saveLocation")}</th>
              <th scope="col">{t("action")}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{t("cropPresetsDownloadLabel")}</th>
              <td>
                <input type="text" value={draft.cropPresetsExportPath} readOnly placeholder={t("cropPresetsExportPathDefault")} />
              </td>
              <td>
                <button type="button" className="ghost-button" onClick={handleChoosePath}>{t("choosePath")}</button>
              </td>
            </tr>
            <tr>
              <th scope="row">{t("videoOutputPathLabel")}</th>
              <td>{outputDirectoryPath || t("notSet")}</td>
              <td>
                <OutputPathButton
                  outputPath={outputDirectoryPath}
                  isExporting={isExporting}
                  onChooseOutput={onChooseOutputFolder}
                  t={t}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}