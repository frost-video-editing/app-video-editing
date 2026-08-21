import React from "react";
import useLanguage from "../../hooks/useLanguage.jsx";

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
  const { t } = useLanguage();

  return (
    <div className="action-row action-row--secondary preview-crop-actions">
      <div className="action-row action-row--tools">
        <button type="button" className="secondary-button" onClick={handleCopy} disabled={!segments.length || isExporting}>
          <span className="button-content"><span className="button-icon" aria-hidden="true">⧉</span><span>{t("copy")}</span></span>
        </button>
        <button type="button" onClick={handleCut} disabled={!segments.length || isExporting}>
          <span className="button-content"><span className="button-icon" aria-hidden="true">✂</span><span>{t("cut")}</span></span>
        </button>
        <button type="button" className="danger-button" onClick={handleDelete} disabled={!segments.length || isExporting}>
          <span className="button-content"><span className="button-icon" aria-hidden="true">⌦</span><span>{t("delete")}</span></span>
        </button>
        <button type="button" className="secondary-button" onClick={handlePaste} disabled={!clipboard.length || isExporting}>
          <span className="button-content"><span className="button-icon" aria-hidden="true">↳</span><span>{t("paste")}</span></span>
        </button>
      </div>

      <div className="action-row" style={{ marginTop: 8 }}>
        <button type="button" className="ghost-button" onClick={handleUndo} disabled={!undoStack.length || isExporting}>
          <span className="button-content"><span className="button-icon" aria-hidden="true">↶</span><span>{t("undo")}</span></span>
        </button>
      </div>

      <div className="action-row" style={{ marginTop: 8 }}>
        <button type="button" className={isCropSelecting ? "secondary-button" : "ghost-button"} onClick={handleStartCropSelection} disabled={!sourceUrl || !previewBounds}>
          <span className="button-content"><span className="button-icon" aria-hidden="true">▣</span><span>{isCropSelecting ? t("cropSelecting") : t("crop")}</span></span>
        </button>
        <button type="button" className={isCropPreviewLocked ? "secondary-button" : "ghost-button"} onClick={handleToggleCropPreviewLock} disabled={!sourceUrl || !hasCrop || isCropSelecting}>
          <span className="button-content"><span className="button-icon" aria-hidden="true">◫</span><span>{isCropPreviewLocked ? t("restoreView") : t("cropComplete")}</span></span>
        </button>
        <button type="button" className="ghost-button" onClick={handleClearCrop} disabled={!sourceUrl || !hasCrop}>
          <span className="button-content"><span className="button-icon" aria-hidden="true">□</span><span>{t("clear")}</span></span>
        </button>
      </div>
    </div>
  );
}