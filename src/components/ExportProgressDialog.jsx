import React, { useEffect, useState } from "react";

function formatElapsedTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export default function ExportProgressDialog({
  isVisible = false,
  message = "動画を出力中...",
  progress = 0,
  indeterminate = false,
  segments = null,
  startTime = null
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const safeProgress = Math.min(100, Math.max(0, Number(progress) || 0));

  useEffect(() => {
    if (!isVisible || !startTime) {
      setElapsedSeconds(0);
      return undefined;
    }

    const updateElapsedTime = () => setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    updateElapsedTime();
    const timer = setInterval(updateElapsedTime, 250);
    return () => clearInterval(timer);
  }, [isVisible, startTime]);

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

        {/* Timeline 1/n export is in progress */}
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
      </section>
    </div>
  );
}