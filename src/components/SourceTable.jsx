import React from "react";
import "../styles/source-table.css";

function formatSourceDuration(totalSeconds) {
  const total = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(total / 3600);
  const remaining = total - hours * 3600;
  const minutes = Math.floor(remaining / 60);
  const seconds = Math.floor(remaining % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function SourceTable({ sources, activeSourcePath, onSelect, onRemove, onAdd, t }) {
  return (
    <section className="source-panel card" aria-labelledby="source-list-title">
      <div className="source-panel-head">
        <div>
          <h2 id="source-list-title">{t("sourceList")}</h2>

          <h4>{t("importMoreVideosHint")}</h4>
        </div>
      </div>
      <div className="source-table-wrapper">
        <table className="source-table">
          <thead>
            <tr>
              <th scope="col">{t("sourceNumber")}</th>
              <th scope="col">{t("fileName")}</th>
              <th scope="col">{t("mediaType")}</th>
              <th scope="col">{t("duration")}</th>
              <th scope="col">{t("action")}</th>
            </tr>
          </thead>
          <tbody>
            {sources.length === 0 ? (
              <tr>
                <td className="source-table-empty" colSpan="5">{t("noSources")}</td>
              </tr>
            ) : sources.map((source, index) => (
              <tr key={source.id} className={source.filePath === activeSourcePath ? "source-row--active" : ""}>
                <td>{index + 1}</td>
                <td>
                  <button type="button" className="source-name-button" onClick={() => onSelect(source)} title={source.filePath}>
                    {source.fileName}
                  </button>
                </td>
                <td>{t(source.mediaType === "audio" ? "audioFile" : source.mediaType === "image" ? "imageFile" : "videoFile")}</td>
                <td>{source.info?.duration ? formatSourceDuration(source.info.duration) : "00:00:00"}</td>
                <td>
                  <button type="button" className="ghost-button" onClick={() => onAdd(source)}>
                    {t("addToTimeline")}
                  </button>
                  <button type="button" className="ghost-button source-remove-button" onClick={() => onRemove(source)}>
                    {t("delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
