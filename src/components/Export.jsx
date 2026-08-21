import React, { useEffect, useState } from "react";
import { formatCrop } from "../lib/crop.js";
import { formatVideoTime } from "../lib/videoTimeline.js";
import useLanguage from "../hooks/useLanguage.jsx";

function getOutputFileNames(outputPath, fileCount) {
  const count = Math.max(0, Number(fileCount) || 0);
  if (!count) return [];

  const rawPath = String(outputPath || "");
  const lastSeparator = Math.max(rawPath.lastIndexOf("/"), rawPath.lastIndexOf("\\"));
  const fileName = lastSeparator >= 0 ? rawPath.slice(lastSeparator + 1) : rawPath;
  const extensionIndex = fileName.lastIndexOf(".");
  const stem = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName || "edited-video";
  const extension = extensionIndex > 0 ? fileName.slice(extensionIndex) : ".mp4";

  if (count === 1) return [fileName || `${stem}${extension}`];

  const digits = Math.max(2, String(count).length);
  return Array.from({ length: count }, (_, index) => `${stem}-part-${String(index + 1).padStart(digits, "0")}${extension}`);
}

export function ExportConfirmDialog({
  isVisible,
  sourceName,
  segmentsLength,
  totalDuration,
  hasCrop,
  crop,
  metadata,
  outputPath,
  isExporting,
  canExport,
  onChooseOutput,
  onClose,
  onExport
}) {
  const { t } = useLanguage();

  if (!isVisible) {
    return null;
  }

  const cropRows = ["left", "top", "right", "bottom"];
  const outputFileNames = getOutputFileNames(outputPath, segmentsLength);

  return (
    <div className="export-confirm-overlay" role="dialog" aria-modal="true" aria-label={t("outputConfirm")}>
      <div className="export-confirm-dialog card">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Export Confirmation</p>
            <h2>{t("outputConfirm")}</h2>
          </div>
          <div className="panel-head-meta">
            <span>{t("confirmBeforeExport")}</span>
          </div>
        </div>

        <div className="export-confirm-body">
          <div className="export-meta">
            <span>{t("source")}: {sourceName || t("notSelected")}</span>
            <span>{t("segmentCount")}: {segmentsLength}</span>
            <span>{t("outputDuration")}: {formatVideoTime(totalDuration)}</span>
            {hasCrop ? (
              <table className="export-crop-table" style={{ borderCollapse: "collapse", marginTop: 6 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: 4 }}>{t("item")}</th>
                    <th style={{ textAlign: "left", padding: 4 }}>%</th>
                    <th style={{ textAlign: "left", padding: 4 }}>px</th>
                  </tr>
                </thead>
                <tbody>
                  {cropRows.map((edge) => {
                    const dimension = edge === "left" || edge === "right" ? metadata.width : metadata.height;
                    const value = Number(crop[edge]) || 0;
                    return (
                      <tr key={edge}>
                        <td style={{ padding: 4 }}>{edge}</td>
                        <td style={{ padding: 4 }}>{value.toFixed(2)}%</td>
                        <td style={{ padding: 4 }}>{dimension ? `${Math.round(value / 100 * dimension)}px` : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <span>{t("currentCropLabel")}: {formatCrop(crop)}</span>
            )}
            <span>{t("audio")}: {metadata.hasAudio ? t("yes") : t("no")}</span>
          </div>

          <div className="export-meta">
            <span>{t("outputLocation")}: {outputPath || t("notSet")}</span>
            <div className="export-file-list">
              <h3>{t("videosToExport")}</h3>
              <table className="export-file-table">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">{t("videoName")}</th>
                  </tr>
                </thead>
                <tbody>
                  {outputFileNames.map((fileName, index) => (
                    <tr key={fileName}>
                      <th scope="row">{index + 1}</th>
                      <td title={fileName}>{fileName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="action-row export-confirm-actions">
          <button type="button" className="secondary-button" onClick={onChooseOutput} disabled={isExporting}>
            {outputPath ? t("changeOutput") : t("chooseOutput")}
          </button>
          <button type="button" className="ghost-button" onClick={onClose} disabled={isExporting}>
            {t("cancel")}
          </button>
          <button type="button" onClick={onExport} disabled={isExporting || !canExport}>
            {isExporting ? t("exporting") : t("exportWithThis")}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatElapsedTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function ExportProgressDialog({
  isVisible = false,
  message = "",
  progress = 0,
  indeterminate = false,
  segments = null,
  startTime = null,
  outputPath = "",
  segmentsLength = 0,
  onCancel
}) {
  const { t } = useLanguage();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);
  const safeProgress = Math.min(100, Math.max(0, Number(progress) || 0));
  const segmentProgress = Array.isArray(segments) ? segments : [];
  const outputFileNames = getOutputFileNames(outputPath, Math.max(segmentsLength, segmentProgress.length));

  useEffect(() => {
    if (!isVisible || !startTime) {
      setElapsedSeconds(0);
      setIsCancelling(false);
      return undefined;
    }

    const updateElapsedTime = () => setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    updateElapsedTime();
    const timer = setInterval(updateElapsedTime, 250);
    return () => clearInterval(timer);
  }, [isVisible, startTime]);

  const handleCancel = async () => {
    if (!onCancel || isCancelling) return;
    setIsCancelling(true);
    await onCancel();
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="export-progress-overlay" role="dialog" aria-modal="true" aria-label={t("exporting")}>
      <section className="export-progress-dialog">
        <div className="export-progress-header">
          <div className="loading-spinner" aria-hidden="true">
            <div className="spinner" />
          </div>
          <div>
            <p className="eyebrow">Exporting Video</p>
            <h2>{t("exportingVideo")}</h2>
          </div>
        </div>

        <p className="export-progress-message">{message || t("exporting")}</p>

        <div className="export-progress-summary">
          <span>{t("progress")}</span>
          <strong>{indeterminate ? t("processing") : `${safeProgress.toFixed(1)}%`}</strong>
          <span>{t("elapsedTime")}</span>
          <strong>{formatElapsedTime(elapsedSeconds)}</strong>
        </div>

        <div className="loading-progress-bar" aria-label={indeterminate ? t("processing") : `${t("progress")} ${safeProgress.toFixed(1)}%`}>
          <div
            className={`loading-progress-fill${indeterminate ? " loading-progress-fill--indeterminate" : ""}`}
            style={indeterminate ? undefined : { width: `${safeProgress}%` }}
          />
        </div>

        {outputFileNames.length ? (
          <div className="export-segment-progress">
            <div className="export-segment-progress__head">
              <span>{t("fileProgress")}</span>
              <span>{outputFileNames.length} {t("items")}</span>
            </div>
            <table className="export-segment-table">
              <thead>
                <tr>
                  <th scope="col">{t("file")}</th>
                  <th scope="col">{t("progress")}</th>
                  <th scope="col">{t("state")}</th>
                </tr>
              </thead>
              <tbody>
                {outputFileNames.map((fileName, index) => {
                  const value = segmentProgress[index] || 0;
                  const segmentValue = Math.min(100, Math.max(0, Number(value) || 0));
                  const status = segmentValue >= 100 ? t("completed") : segmentValue > 0 ? t("exporting") : t("waiting");
                  return (
                    <tr key={`export-segment-${index}`}>
                      <th scope="row" title={fileName}>{fileName}</th>
                      <td>
                        <div className="export-segment-progress__cell">
                          <div className="loading-progress-bar" aria-label={`${t("file")} ${index + 1} ${t("progress")} ${segmentValue.toFixed(1)}%`}>
                            <div className="loading-progress-fill" style={{ width: `${segmentValue}%` }} />
                          </div>
                          <span>{segmentValue.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td>{status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {onCancel && (
          <div className="export-progress-actions">
            <button type="button" className="danger-button" onClick={handleCancel} disabled={isCancelling}>
              {isCancelling ? t("canceling") : t("cancelExport")}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export default function ExportScreen({ isExporting, confirmProps, progressProps }) {
  if (isExporting) {
    return <ExportProgressDialog isVisible {...progressProps} />;
  }

  return <ExportConfirmDialog isVisible {...confirmProps} />;
}