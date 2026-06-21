import React from "react";

export default function ButtonContent({
  handleCopy,
  handleCut,
  handleDelete,
  handlePaste,
  segments,
  isExporting,
  clipboard,
  undoStack,
  handleUndo,
  isCropSelecting,
  handleStartCropSelection,
  sourceUrl,
  previewBounds,
  isCropPreviewLocked,
  handleToggleCropPreviewLock,
  hasCrop,
  handleClearCrop
}) {
  return (
    <div className="action-row action-row--secondary preview-crop-actions">
      <div className="action-row action-row--tools">
        <button type="button" className="secondary-button" onClick={handleCopy} disabled={!segments.length || isExporting}>
          <span className="button-content"><span className="button-icon" aria-hidden="true">⧉</span><span>コピー</span></span>
        </button>
        <button type="button" onClick={handleCut} disabled={!segments.length || isExporting}>
          <span className="button-content"><span className="button-icon" aria-hidden="true">✂</span><span>カット(S)</span></span>
        </button>
        <button type="button" className="danger-button" onClick={handleDelete} disabled={!segments.length || isExporting}>
          <span className="button-content"><span className="button-icon" aria-hidden="true">⌦</span><span>削除</span></span>
        </button>
        <button type="button" className="secondary-button" onClick={handlePaste} disabled={!clipboard.length || isExporting}>
          <span className="button-content"><span className="button-icon" aria-hidden="true">↳</span><span>貼る</span></span>
        </button>
      </div>

      <div className="action-row" style={{ marginTop: 8 }}>
        <button type="button" className="ghost-button" onClick={handleUndo} disabled={!undoStack.length || isExporting}>
          <span className="button-content"><span className="button-icon" aria-hidden="true">↶</span><span>戻す(R)</span></span>
        </button>
      </div>

      <div className="action-row" style={{ marginTop: 8 }}>
        <button type="button" className={isCropSelecting ? "secondary-button" : "ghost-button"} onClick={handleStartCropSelection} disabled={!sourceUrl || !previewBounds}>
          <span className="button-content"><span className="button-icon" aria-hidden="true">▣</span><span>{isCropSelecting ? "選択中" : "crop"}</span></span>
        </button>
        <button type="button" className={isCropPreviewLocked ? "secondary-button" : "ghost-button"} onClick={handleToggleCropPreviewLock} disabled={!sourceUrl || !hasCrop || isCropSelecting}>
          <span className="button-content"><span className="button-icon" aria-hidden="true">◫</span><span>{isCropPreviewLocked ? "表示を戻す" : "crop完了"}</span></span>
        </button>
        <button type="button" className="ghost-button" onClick={handleClearCrop} disabled={!sourceUrl || !hasCrop}>
          <span className="button-content"><span className="button-icon" aria-hidden="true">□</span><span>解除</span></span>
        </button>
      </div>
    </div>
  );
}