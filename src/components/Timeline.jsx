import React, { useEffect, useRef, useState } from "react";
import { formatVideoTime, segmentDuration, timelineDuration } from "../lib/videoTimeline.js";
import useLanguage from "../hooks/useLanguage.jsx";

let segmentNumbers = new WeakMap();
let nextSegmentNumber = 1;

function resetSegmentNumbersIfNewTimeline(segments) {
  if (segments.length > 0 && !segments.some((segment) => segmentNumbers.has(segment))) {
    segmentNumbers = new WeakMap();
    nextSegmentNumber = 1;
  }
}

function getSegmentNumber(segment) {
  if (!segmentNumbers.has(segment)) {
    segmentNumbers.set(segment, nextSegmentNumber);
    nextSegmentNumber += 1;
  }
  return segmentNumbers.get(segment);
}

function formatTimeShort(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function parseTimeInput(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const parts = text.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return (parts[0] * 60) + parts[1];
  if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  return null;
}

function TimelineVisualizer({
  playhead = 0,
  selectionStart = 0,
  selectionEnd = 0,
  totalDuration = 0,
  segments = [],
  onPlayheadChange = () => {},
  onSelectionStartChange = () => {},
  onSelectionEndChange = () => {},
  onSegmentClick = () => {},
  onSegmentDrop = () => {}
}) {
  const { t } = useLanguage();
  const containerRef = useRef(null);
  const [draggingMode, setDraggingMode] = useState(null); // null | playhead | start | end | timeline | segment drag
  const [containerWidth, setContainerWidth] = useState(0);
  const [timeInput, setTimeInput] = useState(formatTimeShort(playhead));
  const [isTimeInputFocused, setIsTimeInputFocused] = useState(false);
  const [isTimeInputInvalid, setIsTimeInputInvalid] = useState(false);

  useEffect(() => {
    if (!isTimeInputFocused) setTimeInput(formatTimeShort(playhead));
  }, [playhead, isTimeInputFocused]);

  const commitTimeInput = () => {
    const nextTime = parseTimeInput(timeInput);
    if (nextTime === null) {
      setIsTimeInputInvalid(true);
      setTimeInput(formatTimeShort(playhead));
      return;
    }
    setIsTimeInputInvalid(false);
    onPlayheadChange(nextTime);
  };

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

  const handleMouseDown = (event, mode) => {
    event.preventDefault();
    event.stopPropagation();
    setDraggingMode(mode);
  };

  const handleTrackMouseDown = (event) => {
    event.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      setDraggingMode("timeline");
      return;
    }

    const localX = event.clientX - rect.left;
    const newTime = pixelsToTime(localX);
    setDraggingMode("timeline");
    onPlayheadChange(newTime);
  };

  useEffect(() => {
    if (!draggingMode) return undefined;

    const handleMouseMove = (event) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const newTime = pixelsToTime(localX);

      if (draggingMode === "playhead") {
        onPlayheadChange(newTime);
      } else if (draggingMode === "start") {
        onSelectionStartChange(Math.min(newTime, selectionEnd));
      } else if (draggingMode === "end") {
        onSelectionEndChange(Math.max(newTime, selectionStart));
      } else if (draggingMode === "timeline") {
        onPlayheadChange(newTime);
      } else if (draggingMode !== null && typeof draggingMode === "object" && draggingMode.type === "segment") {
        setDraggingMode((current) => ({ ...current, moved: true }));
      }
    };

    const handleMouseUp = (event) => {
      if (draggingMode !== null && typeof draggingMode === "object" && draggingMode.type === "segment" && draggingMode.moved) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          onSegmentDrop(draggingMode.index, pixelsToTime(event.clientX - rect.left));
        }
      }
      setDraggingMode(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingMode, selectionStart, selectionEnd, pixelsPerSecond, containerWidth, onSegmentDrop]);

  const playheadPx = timeToPixels(playhead);
  const safeSegments = Array.isArray(segments) ? segments : [];
  resetSegmentNumbersIfNewTimeline(safeSegments);

  return (
    <div className="timeline-visualizer-container">
      <div className="timeline-time-display">
        <label className="timeline-time-input-label">
          <span className="sr-only">{t("playhead")}</span>
          <input
            className={`timeline-time-input ${isTimeInputInvalid ? "timeline-time-input--invalid" : ""}`}
            value={timeInput}
            onFocus={() => { setIsTimeInputFocused(true); setIsTimeInputInvalid(false); }}
            onChange={(event) => setTimeInput(event.target.value)}
            onBlur={() => { commitTimeInput(); setIsTimeInputFocused(false); }}
            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
            aria-label={t("playheadMinutes")}
            title={t("playheadExample")}
          />
        </label>
        <span className="time-divider">/</span>
        <span className="time-total">{formatTimeShort(totalDuration)}</span>
      </div>

      <div
        ref={containerRef}
        className="timeline-track"
        onMouseDown={handleTrackMouseDown}
        style={{ cursor: draggingMode === "timeline" ? "grabbing" : "pointer" }}
      >
        <div className="timeline-adjustment-lane" aria-label={t("timelineAdjustments")}>
          <div
            className="timeline-adjustment-handle"
            style={{ left: `${(playheadPx / Math.max(containerWidth, 1)) * 100}%` }}
            onMouseDown={(event) => handleMouseDown(event, "playhead")}
            title={`${t("playhead")}: ${formatTimeShort(playhead)}`}
          />
        </div>
        <div className="timeline-background" />

        <div className="timeline-segments">
          {safeSegments.map((segment, index) => {
            const duration = Math.max(0, Number(segment.end) - Number(segment.start));
            const widthPct = totalDuration > 0 ? (duration / totalDuration) * 100 : 0;
            const segmentNumber = getSegmentNumber(segment);
            const timelineStart = safeSegments.slice(0, index).reduce((total, item) => total + Math.max(0, Number(item.end) - Number(item.start)), 0);
            const timelineEnd = timelineStart + duration;
            const isSelected = Number(selectionStart) === timelineStart && Number(selectionEnd) === timelineEnd;
            const isDragging = draggingMode !== null && typeof draggingMode === "object" && draggingMode.type === "segment" && draggingMode.index === index;

            const handleSegmentMouseDown = (event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelectionStartChange(timelineStart);
              onSelectionEndChange(timelineEnd);
              onPlayheadChange(timelineStart);
              onSegmentClick(segment, index);
              setDraggingMode({ type: "segment", index, moved: false });
            };

            return (
              <React.Fragment key={`segment-${index}-${segment.start}-${segment.end}`}>
                <div
                  className={`timeline-segment-block${isSelected ? " timeline-segment-block--selected" : ""}${isDragging ? " timeline-segment-block--dragging" : ""}`}
                  style={{ width: `${Math.max(widthPct, 0)}%`, cursor: isDragging ? "grabbing" : "pointer" }}
                  title={`Segment ${segmentNumber}: ${formatTimeShort(segment.start)} - ${formatTimeShort(segment.end)}`}
                  aria-label={`Segment ${segmentNumber}: ${formatTimeShort(segment.start)} - ${formatTimeShort(segment.end)}`}
                  onMouseDown={handleSegmentMouseDown}
                >
                  <span className="timeline-segment-number">{segmentNumber}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        <div
          className="timeline-scrubber"
          style={{ left: `${(playheadPx / containerWidth) * 100}%` }}
          title={`Current: ${formatTimeShort(playhead)}`}
        />
      </div>

      <div className="timeline-info-row">
        <div className="timeline-info-item">
          <span className="label">{t("start")}</span>
          <strong>{formatTimeShort(selectionStart)}</strong>
        </div>
        <div className="timeline-info-item">
          <span className="label">{t("end")}</span>
          <strong>{formatTimeShort(selectionEnd)}</strong>
        </div>
        <div className="timeline-info-item">
          <span className="label">{t("playhead")}</span>
          <strong>{formatTimeShort(playhead)}</strong>
        </div>
      </div>
    </div>
  );
}

function TimelineEditor({
  playhead,
  selectionStart,
  selectionEnd,
  totalDuration,
  segments,
  markers,
  onPlayheadChange,
  onSelectionStartChange,
  onSelectionEndChange,
  selectedSegmentIndex,
  onSegmentClick,
  onMoveSegment,
  onSegmentDrop
}) {
  const { t } = useLanguage();
  const selectedSegment = selectedSegmentIndex === null ? null : segments[selectedSegmentIndex];

  return (
    <>
      <TimelineVisualizer
        playhead={playhead}
        selectionStart={selectionStart}
        selectionEnd={selectionEnd}
        totalDuration={totalDuration}
        segments={segments}
        markers={markers}
        onPlayheadChange={onPlayheadChange}
        onSelectionStartChange={onSelectionStartChange}
        onSelectionEndChange={onSelectionEndChange}
        onSegmentClick={onSegmentClick}
        onSegmentDrop={onSegmentDrop}
      />
    </>
  );
}

export function TimelinePanel({
  segments,
  clipBank = [],
  selectedSegmentIndex = null,
  isExporting,
  onDeleteSegment,
  onMoveSegmentToIndex,
  onInsertClip,
  onSelectSegment
}) {
  const { t } = useLanguage();
  const [draggedIndex, setDraggedIndex] = useState(null);
  resetSegmentNumbersIfNewTimeline(segments);

  const handleDrop = (event, targetIndex) => {
    event.preventDefault();
    if (draggedIndex !== null) onMoveSegmentToIndex(draggedIndex, targetIndex);
    setDraggedIndex(null);
  };

  return (
    <section className="side-section timeline-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Composition</p>
          <h2>{t("timeline")}</h2>
        </div>
        <div className="panel-head-meta">
          <span>{t("exportOrder")}</span>
        </div>
      </div>

      <div className="timeline-list">
        {segments.length ? (
          segments.map((segment, index) => {
            const duration = segmentDuration(segment);
            return (
              <div
                className={`timeline-item${selectedSegmentIndex === index ? " timeline-item--selected" : ""}`}
                key={`${segment.start}-${segment.end}-${index}`}
                draggable={!isExporting}
                onClick={() => onSelectSegment(index)}
                onDragStart={() => setDraggedIndex(index)}
                onDragEnd={() => setDraggedIndex(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleDrop(event, index)}
              >
                <span className="timeline-index">{String(getSegmentNumber(segment)).padStart(2, "0")}</span>
                <div>
                  <strong>{formatVideoTime(segment.start)} - {formatVideoTime(segment.end)}</strong>
                  <p>{t("length")} {formatVideoTime(duration)}</p>
                </div>
                <div className="timeline-badge">{duration.toFixed(2)}s</div>
                <button type="button" className="ghost-button timeline-item-delete" onClick={(event) => { event.stopPropagation(); onDeleteSegment(index); }} disabled={isExporting}>{t("delete")}</button>
              </div>
            );
          })
        ) : (
          <div className="timeline-empty">{t("noSegments")}</div>
        )}
      </div>

      <div className="clip-bank-panel">
        <div className="panel-head-meta">{t("clips")}</div>
        {clipBank.length ? (
          <div className="clip-bank-list">
            {clipBank.map((clip, index) => (
              <div className="clip-bank-item" key={`side-clip-${index}`}>
                <div>
                  <strong>{t("clipNumber", index + 1)}</strong>
                  <span>{formatVideoTime(timelineDuration(clip))}</span>
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => onInsertClip(clip)}
                  disabled={isExporting}
                >
                  {t("insert")}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="timeline-empty">{t("copiedRange")}</div>
        )}
      </div>
    </section>
  );
}

export default TimelineEditor;