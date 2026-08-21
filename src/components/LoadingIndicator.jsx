import React, { useEffect, useState } from "react";
import useLanguage from "../hooks/useLanguage.jsx";

export default function LoadingIndicator({
  isVisible = false,
  message = "",
  progress = 0,
  indeterminate = false,
  segments = null,
  startTime = null
}) {
  const { t } = useLanguage();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const safeProgress = Math.min(100, Math.max(0, Number(progress) || 0));
  const hasSegments = Array.isArray(segments) && segments.length > 0;
  const combinedProgress = hasSegments
    ? (() => {
        const sum = segments.reduce((s, v) => s + (Number(v) || 0), 0);
        return Math.min(100, sum / segments.length);
      })()
    : safeProgress;

  useEffect(() => {
    if (!isVisible || !startTime) {
      setElapsedSeconds(0);
      return;
    }

    const updateInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - startTime) / 1000;
      setElapsedSeconds(Math.floor(elapsed));
    }, 100);

    return () => clearInterval(updateInterval);
  }, [isVisible, startTime]);

  if (!isVisible) return null;

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="loading-overlay">
      <div className="loading-card">
        <div className="loading-spinner">
          <div className="spinner" />
        </div>
        <div className="loading-text">{message || t("loading")}</div>

        {Array.isArray(segments) && segments.length > 0 && (
          <div className="segments-table">
            <div className="segments-table-row segments-table-header">
              <div className="col idx">#</div>
              <div className="col pct">{t("progress")}</div>
            </div>
            {segments.map((pct, i) => (
              <div key={i} className="segments-table-row">
                <div className="col idx">{i + 1}</div>
                <div className="col pct">{Number(pct).toFixed(1)}%</div>
              </div>
            ))}
          </div>
        )}

        <div className="loading-progress-container">
          <div className="loading-progress-bar">
            <div
              className={`loading-progress-fill${indeterminate ? " loading-progress-fill--indeterminate" : ""}`}
              style={indeterminate ? undefined : { width: `${combinedProgress}%` }}
            />
          </div>
          <div className="loading-progress-label">
            <span>{indeterminate ? t("processing") : `${combinedProgress.toFixed(1)}%`}</span>
          </div>
        </div>

        <div className="loading-timer">
          <span className="timer-label">{t("elapsedTime")}</span>
          <span className="timer-value">{formatTime(elapsedSeconds)}</span>
        </div>
      </div>
    </div>
  );
}
