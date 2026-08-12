import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  clamp,
  createFullTimeline,
  extractRange,
  insertSegmentsAt,
  removeRange,
  segmentDuration,
  timelineToSourceTime,
  timelineDuration,
  normalizeRange,
  formatVideoTime,
  splitSegmentsAtPreviewTime,
  splitSegmentsAtTimelinePositions
} from "./lib/videoTimeline.js";
import TimelineVisualizer from "./components/TimelineVisualizer.jsx";
import LoadingIndicator from "./components/LoadingIndicator.jsx";
import ExportScreen from "./components/export/ExportScreen.jsx";
import OperationLogPanel from "./components/log/OperationLogPanel.jsx";
import ShortcutSettingsModal from "./components/ShortcutSettingsModal.jsx";
import useShortcuts from "./hooks/useShortcuts";
import usePreviewPlayback from "./hooks/usePreviewPlayback.jsx";
import useEditorHistory from "./hooks/useEditorHistory.jsx";
import useEditorMessages from "./hooks/useEditorMessages.jsx";
import ButtonContent from "./components/button/button-content";
import { editorMessages } from "./lib/editorMessages.js";
import {
  createCopyLog,
  createCutLog,
  createPasteLog,
  createDeleteLog,
  createUndoLog,
  createCropLog,
  createExportLog,
  createLoadLog
} from "./lib/operationLog.js";
import {
  formatCrop,
  getCropBoxStyle,
  getCroppedPreviewVideoStyle,
  getPreviewViewportStyle
} from "./lib/crop.js";
import {
  createHandleCopySelection,
  createHandleDeleteSelection,
  createHandleDeleteSegment,
  createHandleCut,
  createHandlePaste,
  createHandleInsertClip,
  createHandleResetTimeline,
  createHandleSplitAtPreviewTime,
} from "./lib/timelineOperations.js";
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
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState(null);
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
  const [preserveCropResolution, setPreserveCropResolution] = useState(true);
  const [cropScaleAlgorithm, setCropScaleAlgorithm] = useState("lanczos");
  const [exportProfile, setExportProfile] = useState("standard");

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
  const [isCropPreviewLocked, setIsCropPreviewLocked] = useState(false);
  const [cropForm, setCropForm] = useState({ left: 0, top: 0, width: 100, height: 100 });
  const [cropFormUnit, setCropFormUnit] = useState("%"); // "%" or "px"
  const [cropPresets, setCropPresets] = useState([]);
  const [presetName, setPresetName] = useState("");

  // Operation log state
  const [operationLogs, setOperationLogs] = useState(() => {
    try {
      const savedLogs = typeof window !== "undefined"
        ? window.localStorage.getItem("videoEditor.operationLogs")
        : null;
      const parsedLogs = savedLogs ? JSON.parse(savedLogs) : [];
      return Array.isArray(parsedLogs) ? parsedLogs : [];
    } catch (error) {
      console.error("Failed to restore operation logs", error);
      return [];
    }
  });
  const [isShowingLogViewer, setIsShowingLogViewer] = useState(false);

  // Shortcut settings state
  const [isShortcutSettingsOpen, setIsShortcutSettingsOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem("videoEditor.operationLogs", JSON.stringify(operationLogs.slice(-500)));
    } catch (error) {
      console.error("Failed to persist operation logs", error);
    }
  }, [operationLogs]);

  const totalDuration = useMemo(() => timelineDuration(segments), [segments]);
  const selectedRange = useMemo(
    () => normalizeRange(selectionStart, selectionEnd, totalDuration),
    [selectionStart, selectionEnd, totalDuration]
  );

  const selectedDuration = Math.max(0, selectedRange.end - selectedRange.start);
  const clipboardDuration = useMemo(() => timelineDuration(clipboard), [clipboard]);
  const messages = useEditorMessages(editorMessages.initialStatus);

  const {
    isPreviewReady,
    previewCurrentTime,
    setPreviewCurrentTime,
    isPreviewPlaying,
    previewPlaybackRate,
    audioGainPercent,
    setAudioGainPercent,
    audioNormalize,
    setAudioNormalize,
    handlePreviewVideoLoadStart,
    handlePreviewVideoProgress,
    handlePreviewVideoReady,
    handlePreviewVideoWaiting,
    handlePreviewVideoError,
    handlePreviewTimeUpdate,
    handleTogglePreviewPlayback,
    handleTogglePreviewSpeed,
    handlePreviewPlay,
    handlePreviewPause
  } = usePreviewPlayback({
    videoRef: previewVideoRef,
    sourceUrl,
    duration: metadata.duration,
    segments,
    onPlayheadChange: setPlayhead,
    setErrorText: messages.setErrorMessage,
    setStatus: messages.setStatusMessage
  });

  const { undoStack, pushUndoSnapshot, clearUndoHistory, handleUndo } = useEditorHistory({
    editorState: {
      segments,
      selectionStart,
      selectionEnd,
      playhead,
      clipboard,
      clipBank,
      cutMarkers,
      crop,
      audioGainPercent,
      audioNormalize,
      isCropPreviewLocked,
      outputPath,
      previewCurrentTime
    },
    onRestore: (snapshot) => {
      setSegments(snapshot.segments);
      setSelectionStart(snapshot.selectionStart);
      setSelectionEnd(snapshot.selectionEnd);
      setPlayheadWithPreview(snapshot.playhead);
      setClipboard(snapshot.clipboard);
      setClipBank(snapshot.clipBank);
      setCutMarkers(snapshot.cutMarkers);
      setCrop(snapshot.crop);
      setAudioGainPercent(snapshot.audioGainPercent);
      setAudioNormalize(snapshot.audioNormalize);
      setIsCropPreviewLocked(snapshot.isCropPreviewLocked);
      setOutputPath(snapshot.outputPath);
      setPreviewCurrentTime(snapshot.previewCurrentTime);
      resetCropSelection();
      messages.clearErrorOnly();
    },
    onEmpty: () => messages.setErrorMessage(editorMessages.noUndo),
    onUndo: () => {
      messages.setStatusMessage(editorMessages.undoComplete);
      addOperationLog("undo");
    }
  });

  const hasCrop = crop.left > 0 || crop.top > 0 || crop.right > 0 || crop.bottom > 0;
  const currentCropBoxStyle = useMemo(() => {
    if (!previewBounds) {
      return null;
    }

    return getCropBoxStyle(crop);
  }, [crop, previewBounds]);

  const previewVideoStyle = useMemo(() => {
    if (!hasCrop || !isCropPreviewLocked) {
      return undefined;
    }

    return getCroppedPreviewVideoStyle(crop);
  }, [crop, hasCrop, isCropPreviewLocked]);

  const previewViewportStyle = useMemo(() => {
    if (!isCropPreviewLocked || !hasCrop || !previewBounds) {
      return undefined;
    }

    return getPreviewViewportStyle(previewBounds);
  }, [hasCrop, isCropPreviewLocked, previewBounds]);

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
      messages.setErrorMessage(editorMessages.cropRequired);
      return;
    }
    const name = (presetName || `preset-${new Date().toISOString()}`).trim();
    const preset = { id: Date.now(), name, crop: normalizeCropInput(crop) };
    setCropPresets((cur) => [preset, ...cur].slice(0, 50));
    setPresetName("");
    messages.setStatusMessage(editorMessages.cropSaved(name));
    messages.clearErrorOnly();
  }

  function handleApplyCropPreset(preset) {
    if (!preset || !preset.crop) return;
    pushUndoSnapshot();
    setCrop({ ...preset.crop });
    setIsCropPreviewLocked(true);
    messages.setStatusMessage(editorMessages.cropPresetApplied(preset.name));
  }

  function handleDeletePreset(id) {
    setCropPresets((cur) => cur.filter((p) => p.id !== id));
    messages.setStatusMessage(editorMessages.cropPresetDeleted);
  }

  function handleCropFormChange(field, value) {
    const num = Number(value);
    if (Number.isNaN(num)) return;
    setCropForm((c) => ({ ...c, [field]: num }));
  }

  function applyCropFromForm() {
    if (!previewBounds) {
      messages.setErrorMessage(editorMessages.previewNotReady);
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
    messages.setStatusMessage(editorMessages.cropApplied);
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
      const scale = Math.min(stageRect.width / metadata.width, stageRect.height / metadata.height);
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
      ? new ResizeObserver(updatePreviewBounds)
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

  function setPlayheadWithPreview(nextPlayhead, timelineSegments = segments) {
    const safeTime = clamp(Number(nextPlayhead) || 0, 0, totalDuration);
    setPlayhead(safeTime);
    const video = previewVideoRef.current;
    if (video) {
      const sourceTime = timelineToSourceTime(timelineSegments, safeTime);
      if (Math.abs((Number(video.currentTime) || 0) - sourceTime) > 0.05) {
        video.currentTime = sourceTime;
      }
    }
  }

  // Centralized shortcut handling
  useShortcuts({
    onTogglePreviewPlayback: handleTogglePreviewPlayback,
    onCut: handleCut,
    onReturn: handleUndo,
    onCopy: (...args) => handleCopy(...args),
    onPaste: handlePaste,
    onDelete: handleDelete,
    onCrop: handleStartCropSelection,
    onExport: () => setIsExportConfirmOpen(true),
    segmentsLength: segments.length,
    isExporting,
    setErrorMessage: messages.setErrorMessage
  });

  function handleSplitAtPreview() {
    if (!segments.length) {
      messages.setErrorMessage(editorMessages.chooseVideoFirst);
      return;
    }

    // If a timeline range is selected, split at both boundaries.
    if (selectedDuration > 0) {
      const splitTimes = [selectedRange.start, selectedRange.end];
      const next = splitSegmentsAtTimelinePositions(segments, splitTimes);
      if (!next) {
        messages.setErrorMessage("選択範囲で分割できる場所がありません。");
        return;
      }
      // if no change
      if (next.length === segments.length && next.every((s, i) => s.start === segments[i]?.start && s.end === segments[i]?.end)) {
        messages.setErrorMessage("選択範囲は既にセグメント境界に分かれています。");
        return;
      }
      pushUndoSnapshot();
      setSegments(next);
      setSelectionStart(selectedRange.start);
      setSelectionEnd(selectedRange.end);
      setPlayheadWithPreview(selectedRange.start);
      messages.setStatusMessage(`選択範囲 ${formatVideoTime(selectedRange.start)} - ${formatVideoTime(selectedRange.end)} で分割しました。`);
      messages.clearErrorOnly();
      return;
    }

    // Otherwise fall back to splitting at the current preview playhead
    const sourceTime = Number(previewVideoRef.current?.currentTime) || previewCurrentTime;
    const result = splitSegmentsAtPreviewTime(segments, sourceTime, playhead);

    if (!result) {
      messages.setErrorMessage("現在の画面位置では分割できません。セグメントの内側で停止してください。");
      return;
    }

    pushUndoSnapshot();
    setSegments(result.nextSegments);
    setSelectionStart(result.timelineSplitTime);
    setSelectionEnd(result.timelineSplitTime);
    setPlayheadWithPreview(result.timelineSplitTime);
    messages.setStatusMessage(`画面の位置 ${formatVideoTime(sourceTime)} で分割しました。`);
    messages.clearErrorOnly();
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
    messages.setStatusMessage(editorMessages.cropInstruction);
  }

  function handleToggleCropPreviewLock() {
    if (!hasCrop) {
      messages.setErrorMessage("先に crop 範囲を指定してください。");
      return;
    }

    const nextLocked = !isCropPreviewLocked;
    setIsCropPreviewLocked(nextLocked);
    messages.clearErrorOnly();
    messages.setStatusMessage(nextLocked ? "crop 範囲だけをプレビューに固定しました。" : "プレビュー全体の表示に戻しました。");
  }

  function handleClearCrop() {
    pushUndoSnapshot();
    setCrop(emptyCrop);
    setIsCropPreviewLocked(false);
    resetCropSelection();
    messages.clearErrorOnly();
    messages.setStatusMessage("crop を解除しました。");
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
      messages.setStatusMessage(editorMessages.cropSelectAgain);
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
    messages.clearErrorOnly();
    messages.setStatusMessage(editorMessages.cropUpdated);
    
    // Add crop log
    setOperationLogs((current) => [...current, createCropLog(nextCrop, true)]);
  }

  async function loadSource(result) {
    if (!result?.filePath) {
      stopLoadingOverlay();
      messages.setErrorMessage(editorMessages.videoNotFound);
      messages.setStatusMessage(editorMessages.loadFailed);
      return;
    }

    if (!editorApi) {
      stopLoadingOverlay();
      messages.setErrorMessage(editorMessages.runOnElectron);
      messages.setStatusMessage(editorMessages.loadFailed);
      return;
    }

    messages.clearErrorOnly();
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
      clearUndoHistory();
      resetCropSelection();
      
      setLoadingProgress(100);
      setLoadingMessage("完了！");

      clearLoadCompletionTimeout();
      loadCompletionTimeoutRef.current = setTimeout(() => {
        stopLoadingOverlay();
        messages.setStatusMessage("動画を読み込みました。切り取り範囲と crop を調整してください。");
        // Add load log after metadata is set
        setTimeout(() => {
          setOperationLogs((current) => [...current, createLoadLog(result.fileName || result.filePath.split(/[\\/]/).pop(), info, result.filePath)]);
        }, 0);
      }, 500);
    } catch (error) {
      stopLoadingOverlay();
      setLoadingProgress(0);
      messages.setErrorMessage(error?.message || editorMessages.videoLoadingFailed);
      messages.setStatusMessage(editorMessages.loadFailed);
    }
  }

  async function handleChooseSource() {
    if (!editorApi) {
      messages.setErrorMessage("⊠Electron 上で起動してください。");
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
        messages.setStatusMessage("動画の選択をキャンセルしました。");
        return;
      }

      if (editorApi.backupSource && window.confirm("インポートした元ファイルのバックアップを保存しますか？")) {
        try {
          const backup = await editorApi.backupSource(result.filePath);
          if (backup?.filePath) messages.setStatusMessage("バックアップを保存しました。");
        } catch (error) {
          console.error("Failed to save source backup", error);
          messages.setErrorMessage("バックアップを保存できませんでした。動画の読み込みは続行します。");
        }
      }

      await loadSource(result);
    } catch (error) {
      stopLoadingOverlay();
      setLoadingProgress(0);
      messages.setErrorMessage(error?.message || editorMessages.videoSelectionFailed);
      messages.setStatusMessage(editorMessages.loadFailed);
    }
  }

  async function handleChooseOutput() {
    if (!editorApi) {
      messages.setErrorMessage(editorMessages.runOnElectron);
      return;
    }
    const result = await editorApi.selectOutput({ suggestedName: sourceName || "edited-video.mp4" });
    if (!result) {
      return;
    }
    setOutputPath(result.filePath);
    messages.setStatusMessage(`出力先を設定しました: ${result.filePath}`);
  }

  function handleOpenExportConfirm() {
    if (!sourcePath || !segments.length) {
      messages.setErrorMessage(editorMessages.chooseVideoFirst);
      return;
    }

    messages.clearErrorOnly();
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
    messages.setStatusMessage("タイムラインを初期状態に戻しました。");
    messages.clearErrorOnly();
  }

  function addOperationLog(operationType, details = {}) {
    const log = 
      operationType === "copy" ? createCopyLog(selectedDuration, selectionStart, selectionEnd) :
      operationType === "cut" ? createCutLog(playhead) :
      operationType === "paste" ? createPasteLog(playhead, timelineDuration(clipboard), clipboardDuration) :
      operationType === "delete" ? createDeleteLog(selectedRange.start, selectedRange.end, selectedDuration) :
      operationType === "undo" ? createUndoLog() :
      operationType === "crop" ? createCropLog(crop, hasCrop) :
      operationType === "export" ? createExportLog(sourceName, outputPath, segments.length, metadata) :
      operationType === "load" ? createLoadLog(sourceName, metadata) :
      null;

    if (log) {
      setOperationLogs((current) => [...current, log]);
    }
  }

  const handleCopy = useMemo(
    () => {
      const fn = createHandleCopySelection({
        segments,
        selectionStart,
        selectionEnd,
        setClipboard,
        setClipBank,
        setPlayheadWithPreview,
        messages,
      });
      return () => {
        fn();
        addOperationLog("copy");
      };
    },
    [segments, selectionStart, selectionEnd, setClipboard, setClipBank, setPlayheadWithPreview, messages]
  );

  function handleDelete() {
    if (selectedDuration === 0) {
      messages.setErrorMessage(editorMessages.noSelection);
      return;
    }
    pushUndoSnapshot();
    setSegments(removeRange(segments, selectedRange.start, selectedRange.end));
    setSelectionEnd(selectedRange.start);
    setPlayheadWithPreview(selectedRange.start);
    messages.setStatusMessage(editorMessages.rangeDeleted);
    messages.clearErrorOnly();
    addOperationLog("delete");
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
    messages.setStatusMessage(`パーツ ${index + 1} を削除しました。`);
    messages.clearErrorOnly();
    addOperationLog("delete");
  }

  function handleCut() {
    const splitTime = clamp(Number(playhead) || 0, 0, totalDuration);
    if (splitTime <= 0 || splitTime >= totalDuration) {
      messages.setErrorMessage("先頭または末尾では切り取りできません。中間の位置で押してください。");
      return;
    }

    const next = splitSegmentsAtTimelinePositions(segments, [splitTime]);
    if (!next) {
      messages.setErrorMessage(editorMessages.cantCutHere);
      return;
    }

    if (next.length === segments.length && next.every((segment, index) => segment.start === segments[index]?.start && segment.end === segments[index]?.end)) {
      messages.setErrorMessage(editorMessages.alreadyCutHere);
      return;
    }

    pushUndoSnapshot();
    setSegments(next);
    setCutMarkers((current) => [...current.slice(-99), splitTime]);

    setSelectionStart(splitTime);
    setSelectionEnd(splitTime);
    setPlayheadWithPreview(splitTime);
    messages.setStatusMessage(`${formatVideoTime(splitTime)} でタイムラインを分割しました。`);
    messages.clearErrorOnly();
    addOperationLog("cut");
  }

  function moveSegment(index, direction) {
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= segments.length) return;

    pushUndoSnapshot();
    const nextSegments = [...segments];
    [nextSegments[index], nextSegments[targetIndex]] = [nextSegments[targetIndex], nextSegments[index]];
    let nextStart = 0;
    for (let segmentIndex = 0; segmentIndex < targetIndex; segmentIndex += 1) {
      nextStart += segmentDuration(nextSegments[segmentIndex]);
    }
    const nextEnd = nextStart + segmentDuration(nextSegments[targetIndex]);
    setSegments(nextSegments);
    setSelectedSegmentIndex(targetIndex);
    setSelectionStart(nextStart);
    setSelectionEnd(nextEnd);
    setPlayheadWithPreview(nextStart, nextSegments);
    messages.setStatusMessage(`パーツ ${targetIndex + 1} に移動しました。`);
    messages.clearErrorOnly();
  }

  function handlePaste() {
    if (!clipboard.length) {
      messages.setErrorMessage(editorMessages.nothingToPaste);
      return;
    }

    pushUndoSnapshot();
    const nextSegments = insertSegmentsAt(segments, playhead, clipboard);
    setSegments(nextSegments);
    const insertedDuration = timelineDuration(clipboard);
    setSelectionStart(playhead);
    setSelectionEnd(playhead + insertedDuration);
    setPlayheadWithPreview(playhead + insertedDuration);
    messages.setStatusMessage(`貼り付けました。長さ ${formatVideoTime(insertedDuration)} を挿入しました。`);
    messages.clearErrorOnly();
    addOperationLog("paste");
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
    messages.setStatusMessage(`クリップを挿入しました。長さ ${formatVideoTime(insertedDuration)}`);
    messages.clearErrorOnly();
  }

  async function handleExport() {
    if (!editorApi) {
      messages.setErrorMessage(editorMessages.runOnElectron);
      return;
    }

    if (!sourcePath || !segments.length) {
      messages.setErrorMessage(editorMessages.chooseVideoFirst);
      return;
    }

    const safeSegments = segments.filter((segment) => segmentDuration(segment) > 0);
    if (!safeSegments.length) {
      messages.setErrorMessage("出力できるセグメントがありません。");
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
    messages.clearErrorOnly();
    messages.setStatusMessage("動画を出力中...");

    try {
      const result = await editorApi.exportVideo({
        sourcePath,
        outputPath: chosenOutput,
        segments: safeSegments,
        crop: normalizeCropInput(crop),
        preserveCropResolution,
        cropScaleAlgorithm,
        exportProfile,
        audioGainPercent: Number(audioGainPercent || 100),
        audioNormalize: Boolean(audioNormalize)
      });
      const outputPaths = Array.isArray(result?.outputPaths) && result.outputPaths.length
        ? result.outputPaths
        : [chosenOutput];
      messages.setStatusMessage(`${outputPaths.length} 個のファイルを出力しました。`);
      
      // Add export log
      setOperationLogs((current) => [...current, createExportLog(sourceName, chosenOutput, safeSegments.length, metadata, {
        crop: normalizeCropInput(crop),
        audioGainPercent,
        audioNormalize
      })]);

      await editorApi.revealInFolder(outputPaths[0]);
    } catch (error) {
      messages.setErrorMessage(error?.message || editorMessages.exportFailed);
      messages.setStatusMessage("エラー: 動画の出力に失敗しました。");
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

  // Show log viewer if requested
  if (isShowingLogViewer) {
    return (
      <OperationLogPanel
        logs={operationLogs}
        isOpen={isShowingLogViewer}
        onClose={() => setIsShowingLogViewer(false)}
        onClearLogs={() => {
          setOperationLogs([]);
          window.localStorage.removeItem("videoEditor.operationLogs");
        }}
      />
    );
  }

  // Show export screen if export is in progress or confirmation is open
  if (isExportConfirmOpen || isExporting) {
    return (
      <ExportScreen
        isExporting={isExporting}
        confirmProps={{
          sourceName,
          segmentsLength: segments.length,
          totalDuration,
          hasCrop,
          crop,
          metadata,
          outputPath,
          preserveCropResolution,
          setPreserveCropResolution,
          cropScaleAlgorithm,
          setCropScaleAlgorithm,
          exportProfile,
          setExportProfile,
          isExporting,
          canExport: Boolean(sourcePath && segments.length),
          onChooseOutput: handleChooseOutput,
          onClose: handleCloseExportConfirm,
          onExport: handleExport
        }}
        progressProps={{
          message: exportMessage || "動画を出力中...",
          progress: exportProgress,
          indeterminate: exportIndeterminate,
          segments: exportSegments,
          startTime: exportStartTimeRef.current
        }}
      />
    );
  }

  return (
    <>
      <LoadingIndicator
        isVisible={isLoading}
        message={loadingMessage}
        progress={loadingProgress}
        indeterminate={loadingIndeterminate}
        startTime={loadStartTimeRef.current}
      />
      <ShortcutSettingsModal 
        isOpen={isShortcutSettingsOpen}
        onClose={() => setIsShortcutSettingsOpen(false)}
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
            <OperationLogPanel
              logs={operationLogs}
              isOpen={false}
              onOpen={() => setIsShowingLogViewer(true)}
              onClose={() => setIsShowingLogViewer(false)}
              onClearLogs={() => setOperationLogs([])}
            />
            <button 
              type="button" 
              className="ghost-button" 
              onClick={() => setIsShortcutSettingsOpen(true)}
              title="ショートカットキーの設定"
            >
              ⌨️ ショートカット
            </button>
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
                    onPlay={handlePreviewPlay}
                    onPause={handlePreviewPause}
                    onEnded={handlePreviewPause}
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
            onSegmentClick={(_segment, index) => setSelectedSegmentIndex(index)}
          />

          {selectedSegmentIndex !== null && segments[selectedSegmentIndex] && (
            <div className="segment-reorder-actions">
              <span>選択パーツ: {selectedSegmentIndex + 1} / {segments.length}</span>
              <button type="button" className="ghost-button" onClick={() => moveSegment(selectedSegmentIndex, -1)} disabled={selectedSegmentIndex === 0}>前へ</button>
              <button type="button" className="ghost-button" onClick={() => moveSegment(selectedSegmentIndex, 1)} disabled={selectedSegmentIndex === segments.length - 1}>後へ</button>
            </div>
          )}

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

            {messages.errorText ? <p className="error-message">{messages.errorText}</p> : null}
          </section>
        </aside>
      </section>

    </main>
    </>
  );
}
