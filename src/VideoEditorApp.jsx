import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  clamp,
  createFullTimeline,
  extractRange,
  insertSegmentsAt,
  removeRange,
  segmentDuration,
  timelineToSourceTime,
  sourceToTimelineTime,
  timelineDuration,
  normalizeRange
} from "./lib/videoTimeline.js";
import TimelineVisualizer from "./components/TimelineVisualizer.jsx";
import LoadingIndicator from "./components/LoadingIndicator.jsx";
import useShortcuts from "./hooks/useShortcuts";
import ButtonContent from "./components/button/button-content";
import {
  finalizeCropSelection,
  getDraftCropBoxStyle,
  CropControls,
  getPreviewPoint as getCropPreviewPoint,
  normalizeCropInput,
  updateCropDraft
  , createDraftFromCropPercent
} from "./components/button/crop.jsx";

const emptyCrop = { left: 0, top: 0, right: 0, bottom: 0 };

function formatCrop(crop) {
  const parts = [];
  if (crop.left > 0) parts.push(`左 ${crop.left}%`);
  if (crop.top > 0) parts.push(`上 ${crop.top}%`);
  if (crop.right > 0) parts.push(`右 ${crop.right}%`);
  if (crop.bottom > 0) parts.push(`下 ${crop.bottom}%`);
  return parts.length ? parts.join(" / ") : "全体をそのまま出力";
}

function formatVideoTime(totalSeconds) {
  const total = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total % 60);
  const fraction = Math.round((total - Math.floor(total)) * 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(fraction).padStart(3, "0")}`;
}

export default function VideoEditorApp() {

  const editorApi = typeof window !== "undefined" ? window.editorApi : null;
  const loadStartTimeRef = useRef(null);
  const loadCompletionTimeoutRef = useRef(null);
  const exportStartTimeRef = useRef(null);
  const previewStageRef = useRef(null);
  const previewVideoRef = useRef(null);

  const [sourcePath, setSourcePath] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");

  const [metadata, setMetadata] = useState({ duration: 0, width: 0, height: 0, hasAudio: false });
  const [segments, setSegments] = useState([]);
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [crop, setCrop] = useState(emptyCrop);
  const [clipboard, setClipboard] = useState([]);
  const [clipBank, setClipBank] = useState([]); // saved clip buttons
  const [selectedClipIndex, setSelectedClipIndex] = useState(null);
  const [cutMarkers, setCutMarkers] = useState([]); // array of { start, end }
  const [outputPath, setOutputPath] = useState("");
  const [isExportConfirmOpen, setIsExportConfirmOpen] = useState(false);
  const [status, setStatus] = useState("動画を選択してください。");
  const [errorText, setErrorText] = useState("");

  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [loadingIndeterminate, setLoadingIndeterminate] = useState(false);

  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState("");
  const [exportIndeterminate, setExportIndeterminate] = useState(false);
  const [exportSegments, setExportSegments] = useState(null);

  const [previewBounds, setPreviewBounds] = useState(null);
  const [isCropSelecting, setIsCropSelecting] = useState(false);
  const [cropDraft, setCropDraft] = useState(null);
  const [cropInteraction, setCropInteraction] = useState(null); // { mode, originDraft, pointerStart }
  const [previewLoadProgress, setPreviewLoadProgress] = useState(0);
  const [previewLoadedUntil, setPreviewLoadedUntil] = useState(0);
  const [previewLoadMessage, setPreviewLoadMessage] = useState("未読み込み");
  const [isPreviewReady, setIsPreviewReady] = useState(false);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewPlaybackRate, setPreviewPlaybackRate] = useState(1);
  const [isCropPreviewLocked, setIsCropPreviewLocked] = useState(false);
  const [audioGainPercent, setAudioGainPercent] = useState(100);
  const [audioNormalize, setAudioNormalize] = useState(false);
  const audioContextRef = useRef(null);
  const audioSourceRef = useRef(null);
  const audioGainNodeRef = useRef(null);
  const audioCompressorRef = useRef(null);
  const [undoStack, setUndoStack] = useState([]);
  const [cropForm, setCropForm] = useState({ left: 0, top: 0, width: 100, height: 100 });
  const [cropFormUnit, setCropFormUnit] = useState("%"); // "%" or "px"
  const [cropPresets, setCropPresets] = useState([]);
  const [presetName, setPresetName] = useState("");

  const totalDuration = useMemo(() => timelineDuration(segments), [segments]);
  const selectedRange = useMemo(
    () => normalizeRange(selectionStart, selectionEnd, totalDuration),
    [selectionStart, selectionEnd, totalDuration]
  );

  const selectedDuration = Math.max(0, selectedRange.end - selectedRange.start);
  const clipboardDuration = useMemo(() => timelineDuration(clipboard), [clipboard]);

  const hasCrop = crop.left > 0 || crop.top > 0 || crop.right > 0 || crop.bottom > 0;
  const currentCropBoxStyle = useMemo(() => {
    if (!previewBounds) {
      return null;
    }

    return {
      left: `${crop.left}%`,
      top: `${crop.top}%`,
      width: `${Math.max(0, 100 - crop.left - crop.right)}%`,
      height: `${Math.max(0, 100 - crop.top - crop.bottom)}%`
    };
  }, [crop, previewBounds]);

  const previewVideoStyle = useMemo(() => {
    if (!hasCrop || !isCropPreviewLocked) {
      return undefined;
    }

    const keptWidth = Math.max(1, 100 - crop.left - crop.right);
    const keptHeight = Math.max(1, 100 - crop.top - crop.bottom);

    // Use uniform scaling to avoid non-uniform stretching.
    const scale = 100 / Math.max(keptWidth, keptHeight);

    // Center the cropped region: compute the crop center and offset
    // so the crop's center aligns with the viewport center after scaling.
    const centerX = crop.left + keptWidth / 2;
    const centerY = crop.top + keptHeight / 2;
    const offsetX = centerX - 50; // percent offset relative to center
    const offsetY = centerY - 50;

    return {
      position: "absolute",
      left: "50%",
      top: "50%",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      transformOrigin: "center center",
      transform: `translate(calc(-50% - ${offsetX}%), calc(-50% - ${offsetY}%)) scale(${scale})`
    };
  }, [crop, hasCrop, isCropPreviewLocked]);

  const previewViewportStyle = useMemo(() => {
    if (!isCropPreviewLocked || !hasCrop || !previewBounds) {
      return undefined;
    }

    return {
      left: `${previewBounds.left}px`,
      top: `${previewBounds.top}px`,
      width: `${previewBounds.width}px`,
      height: `${previewBounds.height}px`
    };
  }, [hasCrop, isCropPreviewLocked, previewBounds]);

  // Helper to format crop values for display (pixels + percent)
  function formatCropDisplayFromPercent(cropPercent) {
    if (!previewBounds || !cropPercent) return null;
    const leftPx = (Number(cropPercent.left) || 0) / 100 * previewBounds.width;
    const topPx = (Number(cropPercent.top) || 0) / 100 * previewBounds.height;
    const rightPx = (Number(cropPercent.right) || 0) / 100 * previewBounds.width;
    const bottomPx = (Number(cropPercent.bottom) || 0) / 100 * previewBounds.height;
    const widthPx = Math.max(0, previewBounds.width - leftPx - rightPx);
    const heightPx = Math.max(0, previewBounds.height - topPx - bottomPx);
    return {
      leftPx: Math.round(leftPx),
      topPx: Math.round(topPx),
      widthPx: Math.round(widthPx),
      heightPx: Math.round(heightPx),
      leftPct: Number(cropPercent.left) || 0,
      topPct: Number(cropPercent.top) || 0,
      rightPct: Number(cropPercent.right) || 0,
      bottomPct: Number(cropPercent.bottom) || 0
    };
  }

  function formatDraftDisplay(draft) {
    if (!draft || !previewBounds) return null;
    const left = Math.min(draft.startX, draft.endX);
    const top = Math.min(draft.startY, draft.endY);
    const width = Math.abs(draft.endX - draft.startX);
    const height = Math.abs(draft.endY - draft.startY);
    return {
      leftPx: Math.round(left),
      topPx: Math.round(top),
      widthPx: Math.round(width),
      heightPx: Math.round(height),
      leftPct: (left / previewBounds.width) * 100,
      topPct: (top / previewBounds.height) * 100,
      widthPct: (width / previewBounds.width) * 100,
      heightPct: (height / previewBounds.height) * 100
    };
  }

  // Sync cropForm when confirmed crop changes. Respect current unit.
  useEffect(() => {
    if (!previewBounds) return;
    const left = Number(crop.left) || 0;
    const top = Number(crop.top) || 0;
    const right = Number(crop.right) || 0;
    const bottom = Number(crop.bottom) || 0;
    const widthPct = Math.max(0, 100 - left - right);
    const heightPct = Math.max(0, 100 - top - bottom);
    if (cropFormUnit === "%") {
      setCropForm({ left: Number(left.toFixed(2)), top: Number(top.toFixed(2)), width: Number(widthPct.toFixed(2)), height: Number(heightPct.toFixed(2)) });
    } else {
      const leftPx = (left / 100) * previewBounds.width;
      const topPx = (top / 100) * previewBounds.height;
      const widthPx = (widthPct / 100) * previewBounds.width;
      const heightPx = (heightPct / 100) * previewBounds.height;
      setCropForm({ left: Math.round(leftPx), top: Math.round(topPx), width: Math.round(widthPx), height: Math.round(heightPx) });
    }
  }, [crop, previewBounds, cropFormUnit]);

  // Load presets from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("videoEditor.cropPresets");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setCropPresets(parsed);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Persist presets
  useEffect(() => {
    try {
      localStorage.setItem("videoEditor.cropPresets", JSON.stringify(cropPresets));
    } catch (e) {
      // ignore
    }
  }, [cropPresets]);

  function handleSaveCropPreset() {
    if (!hasCrop) {
      setErrorText("先に crop を指定してください。");
      return;
    }
    const name = (presetName || `preset-${new Date().toISOString()}`).trim();
    const preset = { id: Date.now(), name, crop: normalizeCropInput(crop) };
    setCropPresets((cur) => [preset, ...cur].slice(0, 50));
    setPresetName("");
    setStatus(`crop を保存しました: ${name}`);
    setErrorText("");
  }

  function handleApplyCropPreset(preset) {
    if (!preset || !preset.crop) return;
    pushUndoSnapshot();
    setCrop({ ...preset.crop });
    setIsCropPreviewLocked(true);
    setStatus(`保存済み preset を適用しました: ${preset.name}`);
  }

  function handleDeletePreset(id) {
    setCropPresets((cur) => cur.filter((p) => p.id !== id));
    setStatus("preset を削除しました。");
  }

  function handleCropFormChange(field, value) {
    const num = Number(value);
    if (Number.isNaN(num)) return;
    setCropForm((c) => ({ ...c, [field]: num }));
  }

  function applyCropFromForm() {
    if (!previewBounds) {
      setErrorText("プレビュー領域が準備できていません。");
      return;
    }
    let leftPct, topPct, widthPct, heightPct;
    if (cropFormUnit === "%") {
      leftPct = clamp(Number(cropForm.left) || 0, 0, 99);
      topPct = clamp(Number(cropForm.top) || 0, 0, 99);
      widthPct = clamp(Number(cropForm.width) || 0, 1, 100 - leftPct);
      heightPct = clamp(Number(cropForm.height) || 0, 1, 100 - topPct);
    } else {
      const leftPx = clamp(Math.round(Number(cropForm.left) || 0), 0, Math.max(0, previewBounds.width - 1));
      const topPx = clamp(Math.round(Number(cropForm.top) || 0), 0, Math.max(0, previewBounds.height - 1));
      const widthPx = clamp(Math.round(Number(cropForm.width) || 0), 1, Math.max(1, previewBounds.width - leftPx));
      const heightPx = clamp(Math.round(Number(cropForm.height) || 0), 1, Math.max(1, previewBounds.height - topPx));
      leftPct = (leftPx / previewBounds.width) * 100;
      topPct = (topPx / previewBounds.height) * 100;
      widthPct = (widthPx / previewBounds.width) * 100;
      heightPct = (heightPx / previewBounds.height) * 100;
    }

    const right = Math.max(0, 100 - leftPct - widthPct);
    const bottom = Math.max(0, 100 - topPct - heightPct);

    const next = normalizeCropInput({ left: leftPct, top: topPct, right, bottom });
    pushUndoSnapshot();
    setCrop(next);
    setIsCropPreviewLocked(true);
    setStatus("数値で指定した crop を適用しました。");
  }


  const draftCropBoxStyle = useMemo(() => {
    return getDraftCropBoxStyle(cropDraft, previewBounds);
  }, [cropDraft, previewBounds]);

  useEffect(() => {
    if (totalDuration <= 0) {
      setSelectionStart(0);
      setSelectionEnd(0);
      setPlayhead(0);
      return;
    }

    setSelectionStart((value) => clamp(value, 0, totalDuration));
    setSelectionEnd((value) => clamp(value, 0, totalDuration));
    setPlayhead((value) => clamp(value, 0, totalDuration));
  }, [totalDuration]);

  useEffect(() => {
    setPreviewLoadProgress(0);
    setPreviewLoadedUntil(0);
    setPreviewLoadMessage(sourceUrl ? "プレビューを読み込み中..." : "未読み込み");
    setIsPreviewReady(false);
    setPreviewCurrentTime(0);
    setIsPreviewPlaying(false);
    setIsCropPreviewLocked(false);
  }, [sourceUrl]);

  useEffect(() => {
    return () => {
      if (loadCompletionTimeoutRef.current) {
        clearTimeout(loadCompletionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!editorApi?.onExportProgress) {
      return undefined;
    }

    return editorApi.onExportProgress((payload = {}) => {
      setExportMessage(payload.message || "動画を出力中...");
      setExportProgress(Number(payload.progress) || 0);
      setExportIndeterminate(Boolean(payload.indeterminate));
      setExportSegments(Array.isArray(payload.segments) ? payload.segments : null);
    });
  }, [editorApi]);

  useEffect(() => {
    if (!sourceUrl || !metadata.width || !metadata.height) {
      setPreviewBounds(null);
      return undefined;
    }

    function updatePreviewBounds() {
      const stage = previewStageRef.current;
      if (!stage) {
        return;
      }

      const stageRect = stage.getBoundingClientRect();
      if (!stageRect.width || !stageRect.height) {
        return;
      }

      const widthScale = stageRect.width / metadata.width;
      const heightScale = stageRect.height / metadata.height;
      const scale = Math.min(widthScale, heightScale);
      const width = metadata.width * scale;
      const height = metadata.height * scale;

      setPreviewBounds({
        left: (stageRect.width - width) / 2,
        top: (stageRect.height - height) / 2,
        width,
        height
      });
    }

    updatePreviewBounds();

    const stage = previewStageRef.current;
    const resizeObserver = typeof ResizeObserver !== "undefined" && stage
      ? new ResizeObserver(() => updatePreviewBounds())
      : null;

    resizeObserver?.observe(stage);
    window.addEventListener("resize", updatePreviewBounds);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePreviewBounds);
    };
  }, [sourceUrl, metadata.width, metadata.height]);

  function clearLoadCompletionTimeout() {
    if (loadCompletionTimeoutRef.current) {
      clearTimeout(loadCompletionTimeoutRef.current);
      loadCompletionTimeoutRef.current = null;
    }
  }

  function stopLoadingOverlay() {
    clearLoadCompletionTimeout();
    setIsLoading(false);
    setLoadingMessage("");
    setLoadingIndeterminate(false);
    setLoadingProgress(0);
    loadStartTimeRef.current = null;
  }

  function resetExportOverlay() {
    setExportProgress(0);
    setExportMessage("");
    setExportIndeterminate(false);
    exportStartTimeRef.current = null;
  }

  function resetCropSelection() {
    setCropDraft(null);
    setIsCropSelecting(false);
    setCropInteraction(null);
  }

  function setPlayheadWithPreview(nextPlayhead) {
    const safeTime = clamp(Number(nextPlayhead) || 0, 0, totalDuration);
    setPlayhead(safeTime);

    const video = previewVideoRef.current;
    if (video) {
      const mappedSourceTime = timelineToSourceTime(segments, safeTime);
      const delta = Math.abs((Number(video.currentTime) || 0) - mappedSourceTime);
      if (delta > 0.05) {
        video.currentTime = mappedSourceTime;
      }
    }
  }

  function cloneSegments(items) {
    return items.map((segment) => ({ ...segment }));
  }

  function createUndoSnapshot() {
    return {
      segments: cloneSegments(segments),
      selectionStart,
      selectionEnd,
      playhead,
      clipboard: cloneSegments(clipboard),
      clipBank: Array.isArray(clipBank) ? clipBank.map((c) => cloneSegments(c)) : [],
      cutMarkers: Array.isArray(cutMarkers) ? cutMarkers.map((m) => (m && typeof m === 'object' ? { start: m.start, end: m.end } : { start: Number(m) || 0, end: Number(m) || 0 })) : [],
      crop: { ...crop },
      audioGainPercent: Number(audioGainPercent || 100),
      audioNormalize: Boolean(audioNormalize),
      isCropPreviewLocked,
      outputPath,
      previewCurrentTime
    };
  }

  function pushUndoSnapshot() {
    setUndoStack((current) => [...current.slice(-29), createUndoSnapshot()]);
  }

  function restoreUndoSnapshot(snapshot) {
    if (!snapshot) {
      return;
    }
    const snapSegments = cloneSegments(snapshot.segments || []);
    setSegments(snapSegments);
    setSelectionStart(snapshot.selectionStart);
    setSelectionEnd(snapshot.selectionEnd);
    setPlayheadWithPreview(snapshot.playhead);
    setClipboard(cloneSegments(snapshot.clipboard));
    setClipBank(Array.isArray(snapshot.clipBank) ? snapshot.clipBank.map((c) => cloneSegments(c)) : []);

    // Restore cut markers. Markers may be stored as source times or timeline times.
    // If a marker's start maps to a timeline position within the composed timeline,
    // convert it. Otherwise, keep numeric values as-is (assume already timeline-based).
    const composedDuration = timelineDuration(snapSegments);
    const restoredMarkers = Array.isArray(snapshot.cutMarkers)
      ? snapshot.cutMarkers.map((m) => {
          const raw = m && typeof m === 'object' ? { start: Number(m.start) || 0, end: Number(m.end) || 0 } : { start: Number(m) || 0, end: Number(m) || 0 };
          const maybeStart = sourceToTimelineTime(snapSegments, raw.start);
          const maybeEnd = sourceToTimelineTime(snapSegments, raw.end);
          const start = (maybeStart !== null && maybeStart <= composedDuration) ? maybeStart : raw.start;
          const end = (maybeEnd !== null && maybeEnd <= composedDuration) ? maybeEnd : raw.end;
          return { start, end };
        })
      : [];
    setCutMarkers(restoredMarkers);
    setCrop({ ...snapshot.crop });
    // restore audio settings if present
    if (snapshot && typeof snapshot.audioGainPercent !== 'undefined') setAudioGainPercent(Number(snapshot.audioGainPercent || 100));
    if (snapshot && typeof snapshot.audioNormalize !== 'undefined') setAudioNormalize(Boolean(snapshot.audioNormalize));
    setIsCropPreviewLocked(Boolean(snapshot.isCropPreviewLocked));
    setOutputPath(snapshot.outputPath);
    setPreviewCurrentTime(snapshot.previewCurrentTime || 0);
    resetCropSelection();
    setErrorText("");
  }

  function handleUndo() {
    setUndoStack((current) => {
      if (!current.length) {
        setErrorText("これ以上戻せる操作がありません。");
        return current;
      }

      const next = [...current];
      const snapshot = next.pop();
      restoreUndoSnapshot(snapshot);
      setStatus("ひとつ前の状態に戻しました。");
      return next;
    });
    }
 
  function splitSegmentsAtPreviewTime(currentSegments, sourceTime, preferredTimelineTime) {
    const targetTime = Math.max(0, Number(sourceTime) || 0);
    const preferredTime = Math.max(0, Number(preferredTimelineTime) || 0);
    let cursor = 0;
    let preferredIndex = -1;

    for (let index = 0; index < currentSegments.length; index += 1) {
      const duration = segmentDuration(currentSegments[index]);
      const start = cursor;
      const end = cursor + duration;
      if (preferredTime >= start && preferredTime <= end) {
        preferredIndex = index;
        break;
      }
      cursor = end;
    }

    const candidateIndexes = [];
    if (preferredIndex >= 0) {
      candidateIndexes.push(preferredIndex);
    }
    for (let index = 0; index < currentSegments.length; index += 1) {
      if (index !== preferredIndex) {
        candidateIndexes.push(index);
      }
    }

    let timelineCursor = 0;
    const timelineStarts = currentSegments.map((segment) => {
      const start = timelineCursor;
      timelineCursor += segmentDuration(segment);
      return start;
    });

    for (const index of candidateIndexes) {
      const segment = currentSegments[index];
      const splitOffset = targetTime - Number(segment.start || 0);
      const duration = segmentDuration(segment);
      if (!(splitOffset > 0 && splitOffset < duration)) {
        continue;
      }

      const splitPoint = Number(segment.start) + splitOffset;
      const nextSegments = [];
      currentSegments.forEach((item, itemIndex) => {
        if (itemIndex !== index) {
          nextSegments.push({ ...item });
          return;
        }

        nextSegments.push({ start: item.start, end: splitPoint });
        nextSegments.push({ start: splitPoint, end: item.end });
      });

      return {
        nextSegments,
        timelineSplitTime: timelineStarts[index] + splitOffset
      };
    }

    return null;
  }

  function splitSegmentsAtTimelinePositions(currentSegments, splitTimes) {
    const total = timelineDuration(currentSegments);
    const times = Array.from(new Set((splitTimes || []).map((t) => Number(t) || 0))).sort((a, b) => a - b).filter((t) => t > 0 && t < total);
    if (!times.length) return null;

    let timelineCursor = 0;
    const nextSegments = [];

    for (const segment of currentSegments) {
      const segDuration = segmentDuration(segment);
      const segStartTime = timelineCursor;
      const segEndTime = timelineCursor + segDuration;

      const innerSplits = times.filter((t) => t > segStartTime && t < segEndTime).map((t) => segment.start + (t - segStartTime));

      if (!innerSplits.length) {
        nextSegments.push({ ...segment });
      } else {
        const boundaries = [segment.start, ...innerSplits, segment.end];
        for (let i = 0; i < boundaries.length - 1; i += 1) {
          const a = boundaries[i];
          const b = boundaries[i + 1];
          if (b - a > 1e-9) {
            nextSegments.push({ start: a, end: b });
          }
        }
      }

      timelineCursor = segEndTime;
    }

    return nextSegments;
  }

  function updatePreviewLoadState(video) {
    if (!video) {
      return;
    }

    const duration = Math.max(0, Number(video.duration) || Number(metadata.duration) || 0);
    let bufferedUntil = 0;

    if (video.buffered?.length) {
      for (let index = 0; index < video.buffered.length; index += 1) {
        bufferedUntil = Math.max(bufferedUntil, Number(video.buffered.end(index)) || 0);
      }
    }

    const loadedUntil = duration > 0 ? clamp(bufferedUntil, 0, duration) : 0;
    const complete = (duration > 0 && loadedUntil >= Math.max(duration - 0.25, duration * 0.98)) || video.readyState >= 4;
    const progress = complete ? 100 : duration > 0 ? (loadedUntil / duration) * 100 : video.readyState >= 1 ? 15 : 0;

    setPreviewLoadedUntil(complete ? duration : loadedUntil);
    setPreviewLoadProgress(progress);
    setIsPreviewReady(complete);

    if (complete) {
      setPreviewLoadMessage("プレビューの再生準備が完了しました。");
      return;
    }

    if (progress > 0) {
      setPreviewLoadMessage(`プレビューを読み込み中... ${Math.round(progress)}%`);
      return;
    }

    setPreviewLoadMessage("プレビューを読み込み中...");
  }

  function handlePreviewVideoLoadStart(event) {
    setPreviewLoadProgress(0);
    setPreviewLoadedUntil(0);
    setPreviewLoadMessage("プレビューを読み込み中...");
    setIsPreviewReady(false);
    updatePreviewLoadState(event.currentTarget);
  }

  function handlePreviewVideoProgress(event) {
    updatePreviewLoadState(event.currentTarget);
  }

  function handlePreviewVideoReady(event) {
    setPreviewCurrentTime(Number(event.currentTarget.currentTime) || 0);
    updatePreviewLoadState(event.currentTarget);
  }

  function handlePreviewVideoWaiting(event) {
    updatePreviewLoadState(event.currentTarget);
    setPreviewLoadMessage("プレビューを追加で読み込み中...");
  }

  function handlePreviewVideoError() {
    setPreviewLoadProgress(0);
    setPreviewLoadedUntil(0);
    setPreviewLoadMessage("プレビューの読み込みに失敗しました。");
    setIsPreviewReady(false);
  }

  function handlePreviewTimeUpdate(event) {
    const currentTime = Number(event.currentTarget.currentTime) || 0;
    setPreviewCurrentTime(currentTime);
    const timelineTime = sourceToTimelineTime(segments, currentTime);
    if (timelineTime !== null) {
      setPlayhead((current) => Math.abs(current - timelineTime) > 0.15 ? timelineTime : current);
    }
  }

  async function handleTogglePreviewPlayback() {
    const video = previewVideoRef.current;
    if (!video) {
      return;
    }

    try {
      if (video.paused) {
        await video.play();
        setIsPreviewPlaying(true);
      } else {
        video.pause();
        setIsPreviewPlaying(false);
      }
    } catch (error) {
      console.error("Failed to toggle preview playback", error);
      setErrorText("プレビューの再生操作に失敗しました。");
    }
  }

  useEffect(() => {
    const v = previewVideoRef.current;
    if (v) {
      v.playbackRate = previewPlaybackRate;
    }
    // initialize WebAudio graph for preview audio
    try {
      if (audioContextRef.current == null && typeof window !== 'undefined' && window.AudioContext) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx && v) {
        // reconnect source if needed
        if (audioSourceRef.current) {
          try { audioSourceRef.current.disconnect(); } catch (e) {}
          audioSourceRef.current = null;
        }
        const src = ctx.createMediaElementSource(v);
        audioSourceRef.current = src;

        // create gain node
        if (!audioGainNodeRef.current) audioGainNodeRef.current = ctx.createGain();
        const gainNode = audioGainNodeRef.current;

        // compressor for normalize-like behavior
        if (!audioCompressorRef.current) audioCompressorRef.current = ctx.createDynamicsCompressor();
        const comp = audioCompressorRef.current;

        // connect chain: source -> (compressor?) -> gain -> destination
        try { src.disconnect(); } catch (e) {}
        if (audioNormalize) {
          src.connect(comp);
          comp.connect(gainNode);
        } else {
          src.connect(gainNode);
        }
        gainNode.connect(ctx.destination);
      }
      } catch (e) {
      // ignore WebAudio init failures
      console.warn('WebAudio init failed', e);
    }
    }, [previewPlaybackRate, sourceUrl, audioNormalize]);

  // update audio parameters when options change
  useEffect(() => {
    const ctx = audioContextRef.current;
    const gainNode = audioGainNodeRef.current;
    if (!ctx || !gainNode) return;
    const linear = Math.max(0, (Number(audioGainPercent) || 100) / 100);
    try {
      gainNode.gain.cancelScheduledValues(ctx.currentTime);
      gainNode.gain.setValueAtTime(linear, ctx.currentTime);
    } catch (e) {}
    // enable/disable compressor connection
    const src = audioSourceRef.current;
    const comp = audioCompressorRef.current;
    if (src && comp && gainNode) {
      try {
        src.disconnect();
      } catch (e) {}
      if (audioNormalize) {
        src.connect(comp);
        comp.disconnect();
        comp.connect(gainNode);
      } else {
        try { comp.disconnect(); } catch (e) {}
        src.connect(gainNode);
      }
    }
  }, [audioGainPercent, audioNormalize]);

  // apply gain changes to preview when percent or normalize changes
  useEffect(() => {
    const v = previewVideoRef.current;
    const ctx = audioContextRef.current;
    const gainNode = audioGainNodeRef.current;
    if (!v || !ctx || !gainNode) return;
    const linear = Math.max(0, (Number(audioGainPercent) || 100) / 100);
    try {
      gainNode.gain.cancelScheduledValues(ctx.currentTime);
      gainNode.gain.setValueAtTime(linear, ctx.currentTime);
    } catch (e) {}
  }, [audioGainPercent, audioNormalize]);

  function handleTogglePreviewSpeed() {
    const next = previewPlaybackRate === 1 ? 0.5 : 1;
    setPreviewPlaybackRate(next);
    const v = previewVideoRef.current;
    if (v) v.playbackRate = next;
    setStatus(next === 1 ? "プレビュー速度を通常に戻しました。" : "プレビュー速度を低速（0.5×）にしました。");
  }

  // Centralized shortcut handling
  useShortcuts({
    onTogglePreviewPlayback: handleTogglePreviewPlayback,
    onCut: handleCut,
    onReturn: handleUndo,
    segmentsLength: segments.length,
    isExporting,
    setErrorText
  });

  function handleSplitAtPreview() {
    if (!segments.length) {
      setErrorText("先に動画を読み込んでください。");
      return;
    }

    // If a timeline range is selected, split at both boundaries.
    if (selectedDuration > 0) {
      const splitTimes = [selectedRange.start, selectedRange.end];
      const next = splitSegmentsAtTimelinePositions(segments, splitTimes);
      if (!next) {
        setErrorText("選択範囲で分割できる場所がありません。");
        return;
      }
      // if no change
      if (next.length === segments.length && next.every((s, i) => s.start === segments[i]?.start && s.end === segments[i]?.end)) {
        setErrorText("選択範囲は既にセグメント境界に分かれています。");
        return;
      }
      pushUndoSnapshot();
      setSegments(next);
      setSelectionStart(selectedRange.start);
      setSelectionEnd(selectedRange.end);
      setPlayheadWithPreview(selectedRange.start);
      setStatus(`選択範囲 ${formatVideoTime(selectedRange.start)} - ${formatVideoTime(selectedRange.end)} で分割しました。`);
      setErrorText("");
      return;
    }

    // Otherwise fall back to splitting at the current preview playhead
    const sourceTime = Number(previewVideoRef.current?.currentTime) || previewCurrentTime;
    const result = splitSegmentsAtPreviewTime(segments, sourceTime, playhead);

    if (!result) {
      setErrorText("現在の画面位置では分割できません。セグメントの内側で停止してください。");
      return;
    }

    pushUndoSnapshot();
    setSegments(result.nextSegments);
    setSelectionStart(result.timelineSplitTime);
    setSelectionEnd(result.timelineSplitTime);
    setPlayheadWithPreview(result.timelineSplitTime);
    setStatus(`画面の位置 ${formatVideoTime(sourceTime)} で分割しました。`);
    setErrorText("");
  }

  function getPreviewPoint(clientX, clientY) {
    const stage = previewStageRef.current;
    if (!stage || !previewBounds) {
      return null;
    }

    return getCropPreviewPoint(clientX, clientY, stage.getBoundingClientRect(), previewBounds);
  }


  function handlePreviewPointerDown(event) {
    const point = getPreviewPoint(event.clientX, event.clientY);
    if (!point) return;

    // If not currently in crop selection mode, do nothing.
    if (!isCropSelecting) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    // If there's an existing draft...
    if (cropDraft) {
      // If the draft covers the full locked viewport (we initialized it to full),
      // start a new inner selection when dragging inside, instead of moving the draft.
      const isFullViewportDraft = previewBounds &&
        cropDraft.startX === 0 && cropDraft.startY === 0 &&
        cropDraft.endX === previewBounds.width && cropDraft.endY === previewBounds.height;

      if (isFullViewportDraft && hasCrop) {
        // begin a fresh inner selection anchored at pointer
        setCropDraft({ startX: point.x, startY: point.y, endX: point.x, endY: point.y });
        return;
      }

      // Otherwise if pointer is inside the current draft, start a move interaction.
      const left = Math.min(cropDraft.startX, cropDraft.endX);
      const top = Math.min(cropDraft.startY, cropDraft.endY);
      const right = Math.max(cropDraft.startX, cropDraft.endX);
      const bottom = Math.max(cropDraft.startY, cropDraft.endY);

      if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) {
        setCropInteraction({ mode: "move", originDraft: { ...cropDraft }, pointerStart: { x: point.x, y: point.y } });
        return;
      }
    }

    // Otherwise begin/resume a new selection from the pointer location.
    setCropDraft({ startX: point.x, startY: point.y, endX: point.x, endY: point.y });
    // mark this as a fresh freeform selection so finalization won't compose
    // it inside the previous crop (if any).
    setCropInteraction({ mode: "new", pointerStart: { x: point.x, y: point.y } });
  }

  function handleStartCropSelection() {
    if (!sourceUrl || !previewBounds) {
      return;
    }
    // If there's an existing crop, lock preview to that crop and initialize the draft
    // to the current crop area so the user can micro-adjust (move/resize).
    if (hasCrop) {
      setIsCropPreviewLocked(true);
      // Initialize draft from the existing normalized crop so edges are editable.
      const draft = createDraftFromCropPercent(crop, previewBounds);
      setCropDraft(draft);
    } else {
      setIsCropPreviewLocked(false);
      setCropDraft(null);
    }
    setIsCropSelecting(true);
    setStatus("プレビュー上をドラッグして、残したい範囲を指定してください。");
  }

  function handleToggleCropPreviewLock() {
    if (!hasCrop) {
      setErrorText("先に crop 範囲を指定してください。");
      return;
    }

    const nextLocked = !isCropPreviewLocked;
    setIsCropPreviewLocked(nextLocked);
    setErrorText("");
    setStatus(nextLocked ? "crop 範囲だけをプレビューに固定しました。" : "プレビュー全体の表示に戻しました。");
  }

  function handleClearCrop() {
    pushUndoSnapshot();
    setCrop(emptyCrop);
    setIsCropPreviewLocked(false);
    resetCropSelection();
    setErrorText("");
    setStatus("crop を解除しました。");
  }

  function handlePreviewPointerMove(event) {
    if (!cropDraft) return;
    const point = getPreviewPoint(event.clientX, event.clientY);
    if (!point) return;

    if (cropInteraction && cropInteraction.mode === "move") {
      const dx = point.x - cropInteraction.pointerStart.x;
      const dy = point.y - cropInteraction.pointerStart.y;
      const origin = cropInteraction.originDraft;

      const newStartX = clamp(origin.startX + dx, 0, previewBounds.width);
      const newEndX = clamp(origin.endX + dx, 0, previewBounds.width);
      const newStartY = clamp(origin.startY + dy, 0, previewBounds.height);
      const newEndY = clamp(origin.endY + dy, 0, previewBounds.height);

      // Ensure we don't invert the rectangle accidentally by clamping both sides.
      setCropDraft({ startX: newStartX, startY: newStartY, endX: newEndX, endY: newEndY });
      return;
    }

    setCropDraft((current) => updateCropDraft(current, point, previewBounds));
  }

  function handlePreviewPointerUp(event) {
    if (!cropDraft) return;

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    // If we were moving, clear the interaction and then finalize the moved draft.
    if (cropInteraction && cropInteraction.mode === "move") {
      setCropInteraction(null);
    }

    // If this selection was started as a fresh freeform (`mode: 'new'`), do not
    // compose it with the previous crop; otherwise pass the prev crop so
    // the selection can be refined inside the existing kept region.
    const usePrev = !(cropInteraction && cropInteraction.mode === "new");
    const nextCrop = finalizeCropSelection(cropDraft, previewBounds, usePrev && hasCrop ? crop : null);
    if (!nextCrop) {
      setStatus("ドラッグして残したい範囲を選択してください。");
      setCropDraft(null);
      setCropInteraction(null);
      return;
    }

    pushUndoSnapshot();
    setCrop(nextCrop);
    setCropDraft(null);
    setIsCropSelecting(false);
    // Lock preview to the newly confirmed crop so the preview shows only the
    // selected area (prevents reverting to the previous visual state).
    setIsCropPreviewLocked(true);
    setCropInteraction(null);
    setErrorText("");
    setStatus("プレビューで crop 範囲を更新しました。");
  }

  async function loadSource(result) {
    if (!result?.filePath) {
      stopLoadingOverlay();
      setErrorText("読み込み対象の動画ファイルが見つかりません。");
      setStatus("読み込みに失敗しました。");
      return;
    }

    if (!editorApi) {
      stopLoadingOverlay();
      setErrorText("Electron 上で起動してください。");
      setStatus("読み込みに失敗しました。");
      return;
    }

    setErrorText("");
    setIsLoading(true);
    setLoadingProgress(0);
    setLoadingMessage("ファイル選択中...");
    setLoadingIndeterminate(true);
    loadStartTimeRef.current = Date.now();

    try {
      setLoadingProgress(10);
      setLoadingMessage("動画情報を読み込み中...");
      setLoadingIndeterminate(true);
      const info = result.info || (await editorApi.probeVideo(result.filePath));
      
      setLoadingProgress(40);
      setLoadingMessage("メタデータを処理中...");
      setLoadingIndeterminate(false);
      
      setSourcePath(result.filePath);
      setSourceUrl(result.fileUrl);
      setSourceName(result.fileName || result.filePath.split(/[\\/]/).pop() || "video");
      
      setLoadingProgress(70);
      setLoadingMessage("タイムラインを構築中...");
      
      setMetadata(info);
      setSegments(createFullTimeline(info.duration));
      setSelectionStart(0);
      setSelectionEnd(info.duration);
      setPlayheadWithPreview(0);
      setClipboard([]);
      setOutputPath("");
      setCrop(emptyCrop);
      setUndoStack([]);
      resetCropSelection();
      
      setLoadingProgress(100);
      setLoadingMessage("完了！");

      clearLoadCompletionTimeout();
      loadCompletionTimeoutRef.current = setTimeout(() => {
        stopLoadingOverlay();
        setStatus("動画を読み込みました。切り取り範囲と crop を調整してください。");
      }, 500);
    } catch (error) {
      stopLoadingOverlay();
      setLoadingProgress(0);
      setErrorText(error?.message || "動画の読み込みに失敗しました。");
      setStatus("読み込みに失敗しました。");
    }
  }

  async function handleChooseSource() {
    if (!editorApi) {
      setErrorText("Electron 上で起動してください。");
      return;
    }
    setIsLoading(true);
    setLoadingProgress(0);
    setLoadingMessage("ファイルダイアログを開いています...");
    setLoadingIndeterminate(true);
    loadStartTimeRef.current = Date.now();

    try {
      const result = await editorApi.selectSource();
      if (!result) {
        stopLoadingOverlay();
        setStatus("動画の選択をキャンセルしました。");
        return;
      }

      await loadSource(result);
    } catch (error) {
      stopLoadingOverlay();
      setLoadingProgress(0);
      setErrorText(error?.message || "動画ファイルの選択に失敗しました。");
      setStatus("読み込みを開始できませんでした。");
    }
  }

  async function handleChooseOutput() {
    if (!editorApi) {
      setErrorText("Electron 上で起動してください。");
      return;
    }
    const result = await editorApi.selectOutput({ suggestedName: sourceName || "edited-video.mp4" });
    if (!result) {
      return;
    }
    setOutputPath(result.filePath);
    setStatus(`出力先を設定しました: ${result.filePath}`);
  }

  function handleOpenExportConfirm() {
    if (!sourcePath || !segments.length) {
      setErrorText("出力する動画を先に読み込んでください。");
      return;
    }

    setErrorText("");
    setIsExportConfirmOpen(true);
  }

  function handleCloseExportConfirm() {
    if (isExporting) {
      return;
    }

    setIsExportConfirmOpen(false);
  }

  function handleResetTimeline() {
    if (!metadata.duration) {
      return;
    }
    pushUndoSnapshot();
    setSegments(createFullTimeline(metadata.duration));
    setSelectionStart(0);
    setSelectionEnd(metadata.duration);
    setPlayheadWithPreview(0);
    setClipboard([]);
    setStatus("タイムラインを初期状態に戻しました。");
    setErrorText("");
  }

  function handleCopy() {
    const copied = extractRange(segments, selectedRange.start, selectedRange.end);
    if (!copied.length) {
      setErrorText("コピーする範囲がありません。");
      return;
    }
    setClipboard(copied);
    setClipBank((current) => [copied, ...current].slice(0, 20));
    setPlayheadWithPreview(selectedRange.end);
    setStatus(`範囲をコピーしました。長さ ${formatVideoTime(timelineDuration(copied))}`);
    setErrorText("");
  }

  function handleDelete() {
    if (selectedDuration === 0) {
      setErrorText("削除する範囲を指定してください。");
      return;
    }
    pushUndoSnapshot();
    setSegments(removeRange(segments, selectedRange.start, selectedRange.end));
    setSelectionEnd(selectedRange.start);
    setPlayheadWithPreview(selectedRange.start);
    setStatus("選択範囲を削除しました。");
    setErrorText("");
  }

  function handleDeleteSegment(index) {
    if (index < 0 || index >= segments.length) {
      return;
    }

    pushUndoSnapshot();
    const nextSegments = segments.filter((_, segmentIndex) => segmentIndex !== index);
    const nextDuration = timelineDuration(nextSegments);
    setSegments(nextSegments);
    setSelectionStart((current) => clamp(current, 0, nextDuration));
    setSelectionEnd((current) => clamp(current, 0, nextDuration));
    setPlayheadWithPreview(clamp(playhead, 0, nextDuration));
    setStatus(`パーツ ${index + 1} を削除しました。`);
    setErrorText("");
  }

  function handleCut() {
    const splitTime = clamp(Number(playhead) || 0, 0, totalDuration);
    if (splitTime <= 0 || splitTime >= totalDuration) {
      setErrorText("先頭または末尾では切り取りできません。中間の位置で押してください。");
      return;
    }

    const next = splitSegmentsAtTimelinePositions(segments, [splitTime]);
    if (!next) {
      setErrorText("現在の位置では切り取りできません。");
      return;
    }

    if (next.length === segments.length && next.every((segment, index) => segment.start === segments[index]?.start && segment.end === segments[index]?.end)) {
      setErrorText("この位置はすでに切り取り済みです。別の位置で押してください。");
      return;
    }

    pushUndoSnapshot();
    setSegments(next);
    setCutMarkers((current) => [...current.slice(-99), splitTime]);

    setSelectionStart(splitTime);
    setSelectionEnd(splitTime);
    setPlayheadWithPreview(splitTime);
    setStatus(`${formatVideoTime(splitTime)} でタイムラインを分割しました。`);
    setErrorText("");
  }

  function handlePaste() {
    if (!clipboard.length) {
      setErrorText("貼り付けるクリップがありません。先にコピーまたは切り取りを行ってください。");
      return;
    }

    pushUndoSnapshot();
    const nextSegments = insertSegmentsAt(segments, playhead, clipboard);
    setSegments(nextSegments);
    const insertedDuration = timelineDuration(clipboard);
    setSelectionStart(playhead);
    setSelectionEnd(playhead + insertedDuration);
    setPlayheadWithPreview(playhead + insertedDuration);
    setStatus(`貼り付けました。長さ ${formatVideoTime(insertedDuration)} を挿入しました。`);
    setErrorText("");
  }

  function handleInsertClip(clip) {
    if (!clip) return;
    pushUndoSnapshot();
    const nextSegments = insertSegmentsAt(segments, playhead, Array.isArray(clip) ? clip : [clip]);
    setSegments(nextSegments);
    const insertedDuration = timelineDuration(Array.isArray(clip) ? clip : [clip]);
    setSelectionStart(playhead);
    setSelectionEnd(playhead + insertedDuration);
    setPlayheadWithPreview(playhead + insertedDuration);
    setStatus(`クリップを挿入しました。長さ ${formatVideoTime(insertedDuration)}`);
    setErrorText("");
  }

  async function handleExport() {
    if (!editorApi) {
      setErrorText("Electron 上で起動してください。");
      return;
    }

    if (!sourcePath || !segments.length) {
      setErrorText("出力する動画を先に読み込んでください。");
      return;
    }

    const safeSegments = segments.filter((segment) => segmentDuration(segment) > 0);
    if (!safeSegments.length) {
      setErrorText("出力できるセグメントがありません。");
      return;
    }

    const chosenOutput = outputPath || (await editorApi.selectOutput({ suggestedName: sourceName || "edited-video.mp4" }))?.filePath;
    if (!chosenOutput) {
      return;
    }

    setOutputPath(chosenOutput);
    setIsExporting(true);
    setIsExportConfirmOpen(false);
    setExportProgress(0);
    setExportMessage("出力準備中...");
    setExportIndeterminate(true);
    exportStartTimeRef.current = Date.now();
    setErrorText("");
    setStatus("動画を出力中...");

    try {
      const result = await editorApi.exportVideo({
        sourcePath,
        outputPath: chosenOutput,
        segments: safeSegments,
        crop: normalizeCropInput(crop),
        audioGainPercent: Number(audioGainPercent || 100),
        audioNormalize: Boolean(audioNormalize)
      });
      const outputPaths = Array.isArray(result?.outputPaths) && result.outputPaths.length
        ? result.outputPaths
        : [chosenOutput];
      setStatus(`${outputPaths.length} 個のファイルを出力しました。`);

      await editorApi.revealInFolder(outputPaths[0]);
    } catch (error) {
      setErrorText(error?.message || "動画の出力に失敗しました。");

      setStatus("エラー: 動画の出力に失敗しました。");
    } finally {
      setIsExporting(false);
      resetExportOverlay();
    }
  }

  if (!editorApi) {
    return (
      <main className="editor-shell editor-shell--no-api">
        <section className="hero card">
          <p className="eyebrow">Video Editing</p>
          <h1>Electron で起動してください</h1>
          <p>このアプリはローカルの FFmpeg 実行を使うため、ブラウザ単体では動きません。</p>
        </section>
      </main>
    );
  }
  return (
    <>
      <LoadingIndicator
        isVisible={isLoading || isExporting}
        message={isExporting ? exportMessage || "動画を出力中..." : loadingMessage}
        progress={isExporting ? exportProgress : loadingProgress}
        indeterminate={isExporting ? exportIndeterminate : loadingIndeterminate}
        segments={isExporting ? exportSegments : null}
        startTime={isExporting ? exportStartTimeRef.current : loadStartTimeRef.current}
      />
    <main className="editor-shell">
      <section className="hero card">
        <div className="hero-head">
          <div>
            <p className="eyebrow">Video Editing Studio</p>
            <h1>Video Editor</h1>
            <p>{status}</p>
          </div>

          <div className="hero-actions" style={{ marginRight: 12 }}>
            <button type="button" onClick={handleChooseSource}>動画を選択</button>
          </div>
        </div>

        <div className="status-strip">
          <div>
            <span>ソース</span>
            <strong>{sourceName || "未選択"}</strong>
          </div>
          <div>
            <span>動画時間</span>
            <strong>{formatVideoTime(metadata.duration) || "-"}</strong>
          </div>
          <div>
            <span>解像度</span>
            <strong>{metadata.width && metadata.height ? `${metadata.width} × ${metadata.height}` : "-"}</strong>
          </div>
        </div>
      </section>

      <section className="editor-grid">
        <article className="panel panel--preview card">
          <div className="panel-head">
            <div>
              <p className="eyebrow">
                <h2>Preview</h2>
              </p>
            </div>
          </div>

          <div
            ref={previewStageRef}
            className={`preview-stage${isCropSelecting ? " preview-stage--crop-mode" : ""}`}
            onPointerDown={handlePreviewPointerDown}
            onPointerMove={handlePreviewPointerMove}
            onPointerUp={handlePreviewPointerUp}
            onPointerCancel={() => setCropDraft(null)}
          >
            {sourceUrl ? (
              <>
                <div
                  className={`preview-video-viewport${isCropPreviewLocked && hasCrop ? " preview-video-viewport--cropped" : ""}`}
                  style={previewViewportStyle}
                >
                  <video
                    key={sourceUrl}
                    ref={previewVideoRef}
                    className="preview-video"
                    src={sourceUrl}
                    style={previewVideoStyle}
                    playsInline
                    onTimeUpdate={handlePreviewTimeUpdate}
                    onSeeked={handlePreviewTimeUpdate}
                    onPlay={() => setIsPreviewPlaying(true)}
                    onPause={() => setIsPreviewPlaying(false)}
                    onEnded={() => setIsPreviewPlaying(false)}
                    onLoadStart={handlePreviewVideoLoadStart}
                    onLoadedMetadata={handlePreviewVideoReady}
                    onLoadedData={handlePreviewVideoReady}
                    onCanPlay={handlePreviewVideoReady}
                    onCanPlayThrough={handlePreviewVideoReady}
                    onProgress={handlePreviewVideoProgress}
                    onWaiting={handlePreviewVideoWaiting}
                    onError={handlePreviewVideoError}
                  />
                </div>
                {previewBounds && (!isCropPreviewLocked || isCropSelecting) ? (
                  <div
                    className={`preview-crop-overlay${isCropSelecting ? " preview-crop-overlay--interactive" : ""}`}
                    style={{
                      left: `${previewBounds.left}px`,
                      top: `${previewBounds.top}px`,
                      width: `${previewBounds.width}px`,
                      height: `${previewBounds.height}px`
                    }}
                  >
                    {hasCrop && !cropDraft && currentCropBoxStyle ? (
                      <div className="preview-crop-selection" style={currentCropBoxStyle}>
                        <span className="preview-crop-selection__label">現在の crop</span>
                      </div>
                    ) : null}
                    {cropDraft && draftCropBoxStyle ? (
                      <div className="preview-crop-selection preview-crop-selection--draft" style={draftCropBoxStyle}>
                        <span className="preview-crop-selection__label">選択中</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="preview-empty">動画を読み込むとここにプレビューが表示されます。</div>
            )}
          </div>

          {sourceUrl ? (
            <div className="preview-transport">
              <button type="button" className="secondary-button" onClick={handleTogglePreviewPlayback} disabled={!isPreviewReady}>
                {isPreviewPlaying ? "停止" : "再生"}
              </button>
              <button
                type="button"
                className={previewPlaybackRate === 1 ? "ghost-button" : "secondary-button"}
                onClick={handleTogglePreviewSpeed}
                disabled={!isPreviewReady}
              >
                {previewPlaybackRate === 1 ? "低速" : "通常"}
              </button>
              <span className="preview-transport__time">{formatVideoTime(previewCurrentTime)} / {formatVideoTime(metadata.duration)}</span>
              <span className="preview-transport__hint">再生位置の変更は下のタイムラインで行います。</span>
            </div>
          ) : null}
          
          <TimelineVisualizer
            playhead={playhead}
            selectionStart={selectedRange.start}
            selectionEnd={selectedRange.end}
            totalDuration={totalDuration}
            segments={segments}
            markers={cutMarkers}
            onPlayheadChange={setPlayheadWithPreview}
            onSelectionStartChange={setSelectionStart}
            onSelectionEndChange={setSelectionEnd}
          />

      {/* Audio controls for preview/editing (moved from export dialog) */}
      {metadata.hasAudio ? (
        <div style={{ margin: '12px 0', padding: 8, border: '1px solid #eee', borderRadius: 6 }}>
          <h3 style={{ margin: '6px 0' }}>音声調整</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'center' }}>
            <label style={{ display: 'flex', flexDirection: 'column' }}>
              ボリューム (%)
              <input type="range" min="0" max="200" step="1" value={audioGainPercent} onChange={(e) => setAudioGainPercent(Number(e.target.value || 100))} />
              <div style={{ fontSize: 12 }}>{audioGainPercent}%</div>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={audioNormalize} onChange={(e) => setAudioNormalize(Boolean(e.target.checked))} /> 正規化（簡易）
            </label>
          </div>
        </div>
      ) : null}

      {/* clip chooser */}
      <div className="clipboard-strip">
        <div className="clipboard-strip-head">クリップ</div>
        <div className="clipboard-items">
          {clipBank.length ? (
            clipBank.map((clip, idx) => {
              const dur = timelineDuration(clip);
              const start = clip[0]?.start || 0;
              const end = clip[clip.length - 1]?.end || 0;
              return (
                <div className="clip-item" key={`clip-${idx}-${start}-${end}`}>
                  <button
                    type="button"
                    className={`clip-button${selectedClipIndex === idx ? " clip-button--selected" : ""}`}
                    onClick={() => { setClipboard(clip); setSelectionStart(start); setSelectionEnd(end); setSelectedClipIndex(idx); }}
                  >
                    {formatVideoTime(start)} - {formatVideoTime(end)} ({formatVideoTime(dur)})
                  </button>
                  <div className="clip-actions">
                    <button type="button" className="ghost-button seek-button" onClick={() => setPlayheadWithPreview(start)}>再生位置へ</button>
                    <button type="button" className="ghost-button" onClick={() => handleInsertClip(clip)}>挿入</button>
                    <button type="button" className="timeline-item-delete" onClick={() => setClipBank((c) => c.filter((_, i) => i !== idx))}>削除</button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="clipboard-empty">コピーした範囲はここに表示されます。</div>
          )}          
        </div>
      </div>

      {/* Crop coordinates display */}
      <CropControls
        previewBounds={previewBounds}
        cropForm={cropForm}
        cropFormUnit={cropFormUnit}
        setCropFormUnit={setCropFormUnit}
        handleCropFormChange={handleCropFormChange}
        applyCropFromForm={applyCropFromForm}
        isExporting={isExporting}
        presetName={presetName}
        setPresetName={setPresetName}
        handleSaveCropPreset={handleSaveCropPreset}
        cropPresets={cropPresets}
        handleApplyCropPreset={handleApplyCropPreset}
        handleDeletePreset={handleDeletePreset}
        hasCrop={hasCrop}
      />

      <ButtonContent
        handleCopy={handleCopy}
        handleCut={handleCut}
        handleDelete={handleDelete}
        handlePaste={handlePaste}
        segments={segments}
        isExporting={isExporting}
        clipboard={clipboard}
        undoStack={undoStack}
        handleUndo={handleUndo}
        isCropSelecting={isCropSelecting}
        handleStartCropSelection={handleStartCropSelection}
        sourceUrl={sourceUrl}
        previewBounds={previewBounds}
        isCropPreviewLocked={isCropPreviewLocked}
        handleToggleCropPreviewLock={handleToggleCropPreviewLock}
        hasCrop={hasCrop}
        handleClearCrop={handleClearCrop}
      />

    </article>
      <aside className="panel card panel--side">
          <section className="side-section timeline-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Composition</p>
                <h2>現在のタイムライン</h2>
              </div>
              <div className="panel-head-meta">
                <span>順序どおりに export されます</span>
              </div>
            </div>

            <div className="timeline-list">
              {segments.length ? (
                segments.map((segment, index) => {
                  const duration = segmentDuration(segment);
                  return (
                    <div className="timeline-item" key={`${segment.start}-${segment.end}-${index}`}>
                      <span className="timeline-index">{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <strong>{formatVideoTime(segment.start)} - {formatVideoTime(segment.end)}</strong>
                        <p>長さ {formatVideoTime(duration)}</p>
                      </div>
                      <div className="timeline-badge">{duration.toFixed(2)}s</div>
                      <button type="button" className="ghost-button timeline-item-delete" onClick={() => handleDeleteSegment(index)} disabled={isExporting}>削除</button>
                    </div>
                  );
                })
              ) : (
                <div className="timeline-empty">まだセグメントがありません。</div>
              )}
            </div>
          </section>

          <section className="side-section export-panel">
            <div>
              <p className="eyebrow">Export</p>
              <h2>動画出力</h2>
              <p className="subtle">右側のボタンから出力確認を開きます。</p>
            </div>

            <div className="action-row export-actions">
              <button type="button" onClick={handleOpenExportConfirm} disabled={isExporting || !segments.length || !sourcePath}>
                {isExporting ? "出力中..." : "動画出力"}
              </button>
            </div>

            {errorText ? <p className="error-message">{errorText}</p> : null}
          </section>
        </aside>
      </section>

      {isExportConfirmOpen ? (
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
                <span>セグメント数: {segments.length}</span>
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
                      <tr>
                        <td style={{ padding: 4 }}>left</td>
                        <td style={{ padding: 4 }}>{(crop.left || 0).toFixed(2)}%</td>
                        <td style={{ padding: 4 }}>{metadata.width ? Math.round((crop.left || 0) / 100 * metadata.width) + 'px' : '-'}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: 4 }}>top</td>
                        <td style={{ padding: 4 }}>{(crop.top || 0).toFixed(2)}%</td>
                        <td style={{ padding: 4 }}>{metadata.height ? Math.round((crop.top || 0) / 100 * metadata.height) + 'px' : '-'}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: 4 }}>right</td>
                        <td style={{ padding: 4 }}>{(crop.right || 0).toFixed(2)}%</td>
                        <td style={{ padding: 4 }}>{metadata.width ? Math.round((crop.right || 0) / 100 * metadata.width) + 'px' : '-'}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: 4 }}>bottom</td>
                        <td style={{ padding: 4 }}>{(crop.bottom || 0).toFixed(2)}%</td>
                        <td style={{ padding: 4 }}>{metadata.height ? Math.round((crop.bottom || 0) / 100 * metadata.height) + 'px' : '-'}</td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <span>現在の crop: {formatCrop(crop)}</span>
                )}
                <span>音声: {metadata.hasAudio ? "あり" : "なし"}</span>
              </div>

              <div className="export-meta">
                <span>出力先: {outputPath || "未設定"}</span>
              </div>
            </div>

            <div className="action-row export-confirm-actions">
              <button type="button" className="secondary-button" onClick={handleChooseOutput} disabled={isExporting}>
                {outputPath ? "出力先を変更" : "出力先を選ぶ"}
              </button>
              <button type="button" className="ghost-button" onClick={handleCloseExportConfirm} disabled={isExporting}>
                キャンセル
              </button>
              <button type="button" onClick={handleExport} disabled={isExporting || !sourcePath || !segments.length}>
                {isExporting ? "出力中..." : "この内容で出力"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
    </>
  );
}
