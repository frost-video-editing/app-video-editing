import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  clamp,
  segmentDuration,
  timelineDuration,
  normalizeRange,
  formatVideoTime,
  splitSegmentsAtTimelinePositions
} from "./lib/videoTimeline.js";
import TimelineEditor, { TimelinePanel } from "./components/Timeline.jsx";
import CropEditor from "./components/CropEditor.jsx";
import LoadingIndicator from "./components/LoadingIndicator.jsx";
import ExportScreen from "./components/Export.jsx";
import OperationLogPanel from "./components/log/OperationLogPanel.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import useShortcuts from "./hooks/useShortcuts";
import usePreviewBounds, {
  usePlayheadPreview,
  usePreviewPlayback
} from "./hooks/usePreviewBounds.jsx";
import useEditorHistory, { useEditorMessages } from "./hooks/useEditorHistory.jsx";
import useOperationLogs, { useOperationLogger } from "./hooks/useOperationLogs.jsx";
import useCropPresets, { useCropActions, useCropSelection } from "./hooks/useCropPresets.jsx";
import useSourceLoader, { useLoadingOverlay } from "./hooks/useSourceLoader.jsx";
import useTimelineEditingActions, {
  useTimelineActions,
  useTimelineDurationSync
} from "./hooks/useTimelineEditingActions.jsx";
import useExportDialogActions, { useExportProgress } from "./hooks/useExportDialogActions.jsx";
import useVideoExport from "./hooks/useVideoExport.jsx";
import useLanguage from "./hooks/useLanguage.jsx";
import ButtonContent from "./components/button/button-content";
import { CropControls } from "./components/button/crop.jsx";
import { editorMessages } from "./lib/editorMessages.js";
import {
  formatCrop,
  getCropBoxStyle,
  getCroppedPreviewVideoStyle,
  getDraftCropBoxStyle,
  getPreviewViewportStyle
} from "./lib/crop.js";

const emptyCrop = { left: 0, top: 0, right: 0, bottom: 0 };

export default function VideoEditorApp() {

  const editorApi = typeof window !== "undefined" ? window.editorApi : null;
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
  const [backupSourceOnImport, setBackupSourceOnImport] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("videoEditor.backupSourceOnImport") === "true";
  });
  const [cropScaleAlgorithm, setCropScaleAlgorithm] = useState("lanczos");
  const [exportProfile, setExportProfile] = useState("standard");

  const [isExporting, setIsExporting] = useState(false);
  const [isCropPreviewLocked, setIsCropPreviewLocked] = useState(false);
  const [cropFormUnit, setCropFormUnit] = useState("%"); // "%" or "px"
  const [presetName, setPresetName] = useState("");

  const [isShowingLogViewer, setIsShowingLogViewer] = useState(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const {
    operationLogs,
    setOperationLogs,
    clearOperationLogs,
    excludedOperationTypes,
    setExcludedOperationTypes,
    isOperationTypeEnabled
  } = useOperationLogs();
  const previewBounds = usePreviewBounds({
    stageRef: previewStageRef,
    sourceUrl,
    width: metadata.width,
    height: metadata.height
  });
  const totalDuration = useMemo(() => timelineDuration(segments), [segments]);
  const selectedRange = useMemo(
    () => normalizeRange(selectionStart, selectionEnd, totalDuration),
    [selectionStart, selectionEnd, totalDuration]
  );

  const selectedDuration = Math.max(0, selectedRange.end - selectedRange.start);
  const clipboardDuration = useMemo(() => timelineDuration(clipboard), [clipboard]);
  const messages = useEditorMessages(editorMessages.initialStatus);
  const { language, setLanguage, t } = useLanguage();
  const hasCrop = crop.left > 0 || crop.top > 0 || crop.right > 0 || crop.bottom > 0;
  const addOperationLog = useOperationLogger({
    selectedDuration,
    selectionStart,
    selectionEnd,
    playhead,
    clipboardDuration,
    crop,
    hasCrop,
    sourceName,
    outputPath,
    segmentsLength: segments.length,
    metadata,
    setOperationLogs,
    isOperationTypeEnabled
  });
  useTimelineDurationSync({ totalDuration, setSelectionStart, setSelectionEnd, setPlayhead });
  const setPlayheadWithPreview = usePlayheadPreview({
    videoRef: previewVideoRef,
    totalDuration,
    segments,
    setPlayhead
  });

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

  const {
    isCropSelecting,
    cropDraft,
    resetCropSelection,
    handleStartCropSelection,
    handlePreviewPointerDown,
    handlePreviewPointerMove,
    handlePreviewPointerUp
  } = useCropSelection({
    stageRef: previewStageRef,
    sourceUrl,
    previewBounds,
    crop,
    hasCrop,
    setCrop,
    setIsCropPreviewLocked,
    messages,
    pushUndoSnapshot,
    onCropConfirmed: () => addOperationLog("crop")
  });
  const { handleToggleCropPreviewLock, handleClearCrop } = useCropActions({
    hasCrop,
    isCropPreviewLocked,
    setIsCropPreviewLocked,
    setCrop,
    emptyCrop,
    pushUndoSnapshot,
    resetCropSelection,
    messages
  });
  const { handleSplitAtPreview, handleResetTimeline } = useTimelineActions({
    segments,
    selectedDuration,
    selectedRange,
    previewVideoRef,
    previewCurrentTime,
    playhead,
    metadataDuration: metadata.duration,
    setSegments,
    setSelectionStart,
    setSelectionEnd,
    setPlayheadWithPreview,
    setClipboard,
    pushUndoSnapshot,
    messages
  });
  const {
    loadStartTimeRef,
    loadCompletionTimeoutRef,
    isLoading,
    setIsLoading,
    loadingProgress,
    setLoadingProgress,
    loadingMessage,
    setLoadingMessage,
    loadingIndeterminate,
    setLoadingIndeterminate,
    clearLoadCompletionTimeout,
    stopLoadingOverlay
  } = useLoadingOverlay();
  const { handleChooseSource } = useSourceLoader({
    editorApi,
    setSourcePath,
    setSourceUrl,
    setSourceName,
    setMetadata,
    setSegments,
    setSelectionStart,
    setSelectionEnd,
    setPlayheadWithPreview,
    setClipboard,
    setOutputPath,
    setCrop,
    emptyCrop,
    clearUndoHistory,
    resetCropSelection,
    setOperationLogs,
    isOperationTypeEnabled,
    setIsLoading,
    setLoadingProgress,
    setLoadingMessage,
    setLoadingIndeterminate,
    backupSourceOnImport,
    loadStartTimeRef,
    loadCompletionTimeoutRef,
    clearLoadCompletionTimeout,
    stopLoadingOverlay,
    messages
  });
  const { handleChooseOutput, handleOpenExportConfirm, handleCloseExportConfirm } = useExportDialogActions({
    editorApi,
    sourceName,
    sourcePath,
    segments,
    isExporting,
    setOutputPath,
    setIsExportConfirmOpen,
    messages
  });
  const {
    cropForm,
    cropPresets,
    handleCropFormChange,
    applyCropFromForm,
    handleSaveCropPreset,
    handleApplyCropPreset,
    handleDeletePreset,
    cancelDeletePreset,
    pendingDelete
  } = useCropPresets({
    crop,
    previewBounds,
    cropFormUnit,
    setCrop,
    setIsCropPreviewLocked,
    pushUndoSnapshot,
    messages,
    hasCrop,
    presetName,
    setPresetName
  });
  const {
    exportStartTimeRef,
    exportProgress,
    setExportProgress,
    exportMessage,
    setExportMessage,
    exportIndeterminate,
    setExportIndeterminate,
    exportSegments,
    resetExportOverlay
  } = useExportProgress(editorApi);
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

  const draftCropBoxStyle = useMemo(() => {
    return getDraftCropBoxStyle(cropDraft, previewBounds);
  }, [cropDraft, previewBounds]);

  useEffect(() => {
    setIsCropPreviewLocked(false);
  }, [sourceUrl]);

  const {
    handleCopy,
    handleDelete,
    handleDeleteSegment,
    handleCut,
    moveSegment,
    handlePaste,
    handleInsertClip
  } = useTimelineEditingActions({
    segments,
    selectionStart,
    selectionEnd,
    selectedRange,
    selectedDuration,
    playhead,
    totalDuration,
    clipboard,
    clipboardDuration,
    setClipboard,
    setClipBank,
    setSegments,
    setSelectionStart,
    setSelectionEnd,
    setSelectedSegmentIndex,
    setCutMarkers,
    setPlayheadWithPreview,
    pushUndoSnapshot,
    messages,
    addOperationLog
  });

  const handleExport = useVideoExport({
    editorApi,
    sourcePath,
    sourceName,
    segments,
    crop,
    metadata,
    outputPath,
    preserveCropResolution,
    cropScaleAlgorithm,
    exportProfile,
    audioGainPercent,
    audioNormalize,
    setOutputPath,
    setIsExporting,
    setIsExportConfirmOpen,
    setExportProgress,
    setExportMessage,
    setExportIndeterminate,
    exportStartTimeRef,
    resetExportOverlay,
    setOperationLogs,
    isOperationTypeEnabled,
    messages
  });

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

  if (!editorApi) {
    return (
      <main className="editor-shell editor-shell--no-api">
        <section className="hero card">
          <p className="eyebrow">Video Editing</p>
          <h1>{t("startElectron")}</h1>
          <p>{t("electronOnly")}</p>
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
          clearOperationLogs();
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
          isExporting,
          canExport: Boolean(sourcePath && segments.length),
          onChooseOutput: handleChooseOutput,
          onClose: handleCloseExportConfirm,
          onExport: handleExport
        }}
        progressProps={{
          message: exportMessage || t("exporting"),
          progress: exportProgress,
          indeterminate: exportIndeterminate,
          segments: exportSegments,
          startTime: exportStartTimeRef.current,
          outputPath,
          segmentsLength: segments.length,
          onCancel: () => editorApi?.cancelExport?.()
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
      <SettingsModal
        t={t}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        preserveCropResolution={preserveCropResolution}
        setPreserveCropResolution={setPreserveCropResolution}
        backupSourceOnImport={backupSourceOnImport}
        setBackupSourceOnImport={setBackupSourceOnImport}
        cropScaleAlgorithm={cropScaleAlgorithm}
        setCropScaleAlgorithm={setCropScaleAlgorithm}
        exportProfile={exportProfile}
        setExportProfile={setExportProfile}
        audioGainPercent={audioGainPercent}
        setAudioGainPercent={setAudioGainPercent}
        audioNormalize={audioNormalize}
        setAudioNormalize={setAudioNormalize}
        excludedOperationTypes={excludedOperationTypes}
        setExcludedOperationTypes={setExcludedOperationTypes}
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
            <div className="language-switcher" aria-label={t("language")}>
              <button
                type="button"
                className={language === "en" ? "language-button language-button--active" : "language-button"}
                onClick={() => setLanguage("en")}
                aria-pressed={language === "en"}
              >
                EN
              </button>
              <button
                type="button"
                className={language === "ja" ? "language-button language-button--active" : "language-button"}
                onClick={() => setLanguage("ja")}
                aria-pressed={language === "ja"}
              >
                JP
              </button>
            </div>
            <button type="button" onClick={handleChooseSource}>{t("chooseVideo")}</button>

            <button 
              type="button" 
              className="ghost-button" 
              onClick={() => setIsSettingsOpen(true)}
              title={t("openSettings")}
            >
              ⚙️ {t("settings")}
            </button>

            <OperationLogPanel
              logs={operationLogs}
              isOpen={false}
              onOpen={() => setIsShowingLogViewer(true)}
              onClose={() => setIsShowingLogViewer(false)}
              onClearLogs={() => setOperationLogs([])}
            />
          </div>
        </div>

        <div className="status-strip">
          <div>
            <span>{t("source")}</span>
            <strong>{sourceName || t("notSelected")}</strong>
          </div>
          <div>
            <span>{t("duration")}</span>
            <strong>{formatVideoTime(metadata.duration) || "-"}</strong>
          </div>
          <div>
            <span>{t("resolution")}</span>
            <strong>{metadata.width && metadata.height ? `${metadata.width} × ${metadata.height}` : "-"}</strong>
          </div>
        </div>
      </section>

      <section className="editor-grid">
        <article className="panel panel--preview card">
          <div className="panel-head">
            <div>
              <p className="eyebrow">
                <h2>{t("preview")}</h2>
              </p>
            </div>
          </div>

          <CropEditor
            stageRef={previewStageRef}
            videoRef={previewVideoRef}
            sourceUrl={sourceUrl}
            isCropSelecting={isCropSelecting}
            previewBounds={previewBounds}
            previewViewportStyle={previewViewportStyle}
            previewVideoStyle={previewVideoStyle}
            currentCropBoxStyle={currentCropBoxStyle}
            draftCropBoxStyle={draftCropBoxStyle}
            hasCrop={hasCrop}
            cropDraft={cropDraft}
            isCropPreviewLocked={isCropPreviewLocked}
            isPreviewReady={isPreviewReady}
            isPreviewPlaying={isPreviewPlaying}
            previewPlaybackRate={previewPlaybackRate}
            previewCurrentTime={formatVideoTime(previewCurrentTime)}
            duration={formatVideoTime(metadata.duration)}
            onPointerDown={handlePreviewPointerDown}
            onPointerMove={handlePreviewPointerMove}
            onPointerUp={handlePreviewPointerUp}
            onPointerCancel={resetCropSelection}
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
            onTogglePlayback={handleTogglePreviewPlayback}
            onToggleSpeed={handleTogglePreviewSpeed}
            showCropControls={false}
            cropControlsProps={{
              t,
              previewBounds,
              cropForm,
              cropFormUnit,
              setCropFormUnit,
              handleCropFormChange,
              applyCropFromForm,
              isExporting,
              presetName,
              setPresetName,
              handleSaveCropPreset,
              cropPresets,
              handleApplyCropPreset,
              handleDeletePreset,
              cancelDeletePreset,
              pendingDelete,
              hasCrop
            }}
          />

          <TimelineEditor
            t={t}
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
            selectedSegmentIndex={selectedSegmentIndex}
            onMoveSegment={moveSegment}
          />

      {/* Audio controls for preview/editing (moved from export dialog) */}
      {metadata.hasAudio ? (
        <div style={{ margin: '12px 0', padding: 8, border: '1px solid #eee', borderRadius: 6 }}>
          <h3 style={{ margin: '6px 0' }}>{t("audioAdjust")}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'center' }}>
            <label style={{ display: 'flex', flexDirection: 'column' }}>
              {t("volume")}
              <input type="range" min="0" max="200" step="1" value={audioGainPercent} onChange={(e) => setAudioGainPercent(Number(e.target.value || 100))} />
              <div style={{ fontSize: 12 }}>{audioGainPercent}%</div>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={audioNormalize} onChange={(e) => setAudioNormalize(Boolean(e.target.checked))} /> {t("normalize")}
            </label>
          </div>
        </div>
      ) : null}

      {/* clip chooser */}
      <div className="clipboard-strip">
        <div className="clipboard-strip-head">{t("clips")}</div>
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
                    <button type="button" className="ghost-button seek-button" onClick={() => setPlayheadWithPreview(start)}>{t("seek")}</button>
                    <button type="button" className="ghost-button" onClick={() => handleInsertClip(clip)}>{t("insert")}</button>
                    <button type="button" className="timeline-item-delete" onClick={() => setClipBank((c) => c.filter((_, i) => i !== idx))}>{t("delete")}</button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="clipboard-empty">{t("copiedRange")}</div>
          )}          
        </div>
      </div>
        
      <ButtonContent
        t={t}
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

      <CropControls {...{
        previewBounds,
        cropForm,
        cropFormUnit,
        setCropFormUnit,
        handleCropFormChange,
        applyCropFromForm,
        isExporting,
        presetName,
        setPresetName,
        handleSaveCropPreset,
        cropPresets,
        handleApplyCropPreset,
        handleDeletePreset,
        cancelDeletePreset,
        pendingDelete,
        hasCrop
      }} />

    </article>
      <aside className="panel card panel--side">
          <TimelinePanel
            t={t}
            segments={segments}
            isExporting={isExporting}
            onDeleteSegment={handleDeleteSegment}
          />

          <section className="side-section export-panel">
            <div>
              <p className="eyebrow">Export</p>
              <h2>{t("export")}</h2>
              <p className="subtle">{t("exportHint")}</p>
            </div>

            <div className="action-row export-actions">
              <button type="button" onClick={handleOpenExportConfirm} disabled={isExporting || !segments.length || !sourcePath}>
                {isExporting ? t("exporting") : t("export")}
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
