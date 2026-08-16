import React, { useEffect, useState } from "react";
import { formatCrop } from "../lib/crop.js";
import { formatVideoTime } from "../lib/videoTimeline.js";

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
  if (!isVisible) {
    return null;
  }

  const cropRows = ["left", "top", "right", "bottom"];
  const outputFileNames = getOutputFileNames(outputPath, segmentsLength);

  return (
    <div className="export-confirm-overlay" role="dialog" aria-modal="true" aria-label="動画出力の確認">
      <div className="export-confirm-dialog card">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Export Confirmation</p>
            <h2>動画出力の確認</h2>
          </div>
          <div className="panel-head-meta">
            <span>確認後に出力を開始します</span>
          </div>
        </div>

        <div className="export-confirm-body">
          <div className="export-meta">
            <span>ソース: {sourceName || "未選択"}</span>
            <span>セグメント数: {segmentsLength}</span>
            <span>出力映像長: {formatVideoTime(totalDuration)}</span>
            {hasCrop ? (
              <table className="export-crop-table" style={{ borderCollapse: "collapse", marginTop: 6 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: 4 }}>項目</th>
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
              <span>現在の crop: {formatCrop(crop)}</span>
            )}
            <span>音声: {metadata.hasAudio ? "あり" : "なし"}</span>
          </div>

          <div className="export-meta">
            <span>出力先: {outputPath || "未設定"}</span>
            <div className="export-file-list">
              <h3>出力する動画</h3>
              <table className="export-file-table">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">動画名</th>
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
            {outputPath ? "出力先を変更" : "出力先を選ぶ"}
          </button>
          <button type="button" className="ghost-button" onClick={onClose} disabled={isExporting}>
            キャンセル
          </button>
          <button type="button" onClick={onExport} disabled={isExporting || !canExport}>
            {isExporting ? "出力中..." : "この内容で出力"}
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
  message = "動画を出力中...",
  progress = 0,
  indeterminate = false,
  segments = null,
  startTime = null,
  outputPath = "",
  segmentsLength = 0,
  onCancel
}) {
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
    <div className="export-progress-overlay" role="dialog" aria-modal="true" aria-label="動画を出力中">
      <section className="export-progress-dialog">
        <div className="export-progress-header">
          <div className="loading-spinner" aria-hidden="true">
            <div className="spinner" />
          </div>
          <div>
            <p className="eyebrow">Exporting Video</p>
            <h2>動画を書き出しています</h2>
          </div>
        </div>

        <p className="export-progress-message">{message}</p>

        <div className="export-progress-summary">
          <span>進捗</span>
          <strong>{indeterminate ? "処理中..." : `${safeProgress.toFixed(1)}%`}</strong>
          <span>経過時間</span>
          <strong>{formatElapsedTime(elapsedSeconds)}</strong>
        </div>

        <div className="loading-progress-bar" aria-label={indeterminate ? "処理中" : `進捗 ${safeProgress.toFixed(1)}%`}>
          <div
            className={`loading-progress-fill${indeterminate ? " loading-progress-fill--indeterminate" : ""}`}
            style={indeterminate ? undefined : { width: `${safeProgress}%` }}
          />
        </div>

        {outputFileNames.length ? (
          <div className="export-segment-progress">
            <div className="export-segment-progress__head">
              <span>ファイル別の進捗</span>
              <span>{outputFileNames.length} 件</span>
            </div>
            <table className="export-segment-table">
              <thead>
                <tr>
                  <th scope="col">ファイル</th>
                  <th scope="col">進捗</th>
                  <th scope="col">状態</th>
                </tr>
              </thead>
              <tbody>
                {outputFileNames.map((fileName, index) => {
                  const value = segmentProgress[index] || 0;
                  const segmentValue = Math.min(100, Math.max(0, Number(value) || 0));
                  const status = segmentValue >= 100 ? "完了" : segmentValue > 0 ? "出力中" : "待機中";
                  return (
                    <tr key={`export-segment-${index}`}>
                      <th scope="row" title={fileName}>{fileName}</th>
                      <td>
                        <div className="export-segment-progress__cell">
                          <div className="loading-progress-bar" aria-label={`ファイル ${index + 1} の進捗 ${segmentValue.toFixed(1)}%`}>
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
              {isCancelling ? "キャンセル中..." : "出力をキャンセル"}
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