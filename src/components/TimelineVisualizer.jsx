import React, { useRef, useState, useEffect } from "react";

function formatTimeShort(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function TimelineVisualizer({
  playhead = 0,
  selectionStart = 0,
  selectionEnd = 0,
  totalDuration = 0,
  segments = [],
  onPlayheadChange = () => {},
  onSelectionStartChange = () => {},
  onSelectionEndChange = () => {}
}) {
  const containerRef = useRef(null);
  const [draggingMode, setDraggingMode] = useState(null); // null | 'playhead' | 'start' | 'end' | 'timeline'
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const pixelsPerSecond = containerWidth > 0 ? containerWidth / Math.max(totalDuration, 1) : 0;

  const timeToPixels = (time) => time * pixelsPerSecond;
  const pixelsToTime = (pixels) => {
    const time = pixels / pixelsPerSecond;
    return Math.max(0, Math.min(totalDuration, time));
  };

  const handleMouseDown = (e, mode) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingMode(mode);
  };

  const handleTrackMouseDown = (e) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      setDraggingMode("timeline");
      return;
    }

    const localX = e.clientX - rect.left;
    const newTime = pixelsToTime(localX);
    setDraggingMode("timeline");
    onPlayheadChange(newTime);
  };

  useEffect(() => {
    if (!draggingMode) return;

    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const newTime = pixelsToTime(localX);

      if (draggingMode === "playhead") {
        onPlayheadChange(newTime);
      } else if (draggingMode === "start") {
        onSelectionStartChange(Math.min(newTime, selectionEnd));
      } else if (draggingMode === "end") {
        onSelectionEndChange(Math.max(newTime, selectionStart));
      } else if (draggingMode === "timeline") {
        onPlayheadChange(newTime);
      }
    };

    const handleMouseUp = () => {
      setDraggingMode(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingMode, selectionStart, selectionEnd, pixelsPerSecond, containerWidth]);

  const playheadPx = timeToPixels(playhead);
  const safeSegments = Array.isArray(segments) ? segments : [];

  return (
    <div className="timeline-visualizer-container">
      <div className="timeline-time-display">
        <span className="time-label">{formatTimeShort(playhead)}</span>
        <span className="time-divider">/</span>
        <span className="time-total">{formatTimeShort(totalDuration)}</span>
      </div>

      <div
        ref={containerRef}
        className="timeline-track"
        onMouseDown={handleTrackMouseDown}
        style={{ cursor: draggingMode === "timeline" ? "grabbing" : "pointer" }}
      >
        {/* Background bar */}
        <div className="timeline-background" />

        {/* Segmented timeline blocks */}
        <div className="timeline-segments" aria-hidden="true">
          {safeSegments.map((segment, index) => {
            const duration = Math.max(0, Number(segment.end) - Number(segment.start));
            const widthPct = totalDuration > 0 ? (duration / totalDuration) * 100 : 0;
            return (
              <div
                key={`segment-${index}-${segment.start}-${segment.end}`}
                className="timeline-segment-block"
                style={{ width: `${Math.max(widthPct, 0)}%` }}
                title={`${formatTimeShort(segment.start)} - ${formatTimeShort(segment.end)}`}
              />
            );
          })}
        </div>

        {/* Playhead scrubber */}
        <div
          className="timeline-scrubber"
          style={{ left: `${(playheadPx / containerWidth) * 100}%` }}
          onMouseDown={(e) => handleMouseDown(e, "playhead")}
          title={`Current: ${formatTimeShort(playhead)}`}
        />
      </div>

      <div className="timeline-info-row">
        <div className="timeline-info-item">
          <span className="label">開始</span>
          <strong>{formatTimeShort(selectionStart)}</strong>
        </div>
        <div className="timeline-info-item">
          <span className="label">終了</span>
          <strong>{formatTimeShort(selectionEnd)}</strong>
        </div>
        <div className="timeline-info-item">
          <span className="label">再生位置</span>
          <strong>{formatTimeShort(playhead)}</strong>
        </div>
      </div>
    </div>
  );
}
