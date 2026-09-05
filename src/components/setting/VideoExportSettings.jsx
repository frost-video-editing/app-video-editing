import React from "react";

export default function VideoExportSettings({ draft, updateDraft, t }) {
  return (
    <section className="settings-section settings-tab-panel">
      <h3>{t("exportSettings")}</h3>
      <div className="settings-table-wrapper">
        <table className="settings-table settings-table--video-export">
          <thead>
            <tr>
              <th scope="col">{t("settingItem")}</th>
              <th scope="col">{t("settingValue")}</th>
              <th scope="col">{t("description")}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{t("exportProfile")}</th>
              <td>
                <select value={draft.exportProfile} onChange={(event) => updateDraft("exportProfile", event.target.value)}>
                  <option value="fast">{t("fast")}</option>
                  <option value="standard">{t("standard")}</option>
                  <option value="high">{t("highQuality")}</option>
                  <option value="gpu">{t("gpuFirst")}</option>
                </select>
              </td>
              <td>{t("exportProfileDescription")}</td>
            </tr>
            <tr>
              <th scope="row">{t("preserveResolution")}</th>
              <td>
                <input
                  type="checkbox"
                  checked={draft.preserveCropResolution}
                  onChange={(event) => updateDraft("preserveCropResolution", event.target.checked)}
                />
              </td>
              <td>{t("preserveResolutionDescription")}</td>
            </tr>
            {draft.preserveCropResolution && (
              <tr>
                <th scope="row">{t("scalingAlgorithm")}</th>
                <td>
                  <select value={draft.cropScaleAlgorithm} onChange={(event) => updateDraft("cropScaleAlgorithm", event.target.value)}>
                    <option value="lanczos">{t("highQuality")} (Lanczos)</option>
                    <option value="bilinear">{t("fast")} (Bilinear)</option>
                  </select>
                </td>
                <td>{t("scalingAlgorithmDescription")}</td>
              </tr>
            )}
            <tr>
              <th scope="row">{t("volumeLabel")}</th>
              <td className="settings-table-range-cell">
                <input
                  type="range"
                  min="0"
                  max="200"
                  step="1"
                  value={draft.audioGainPercent}
                  onChange={(event) => updateDraft("audioGainPercent", Number(event.target.value))}
                />
                <span>{draft.audioGainPercent}%</span>
              </td>
              <td>{t("volumeDescription")}</td>
            </tr>
            <tr>
              <th scope="row">{t("normalizeAudio")}</th>
              <td>
                <input
                  type="checkbox"
                  checked={draft.audioNormalize}
                  onChange={(event) => updateDraft("audioNormalize", event.target.checked)}
                />
              </td>
              <td>{t("normalizeAudioDescription")}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
