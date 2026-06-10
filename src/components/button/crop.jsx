import React from "react";
import { clamp } from "../../lib/videoTimeline.js";

// Compute a square draft (startX,startY,endX,endY) given a start and current pointer.
export function computeSquareDraft(startX, startY, pointerX, pointerY, previewBounds) {
  if (!previewBounds) return null;

  const dx = pointerX - startX;
  const dy = pointerY - startY;
  const desired = Math.max(Math.abs(dx), Math.abs(dy));
  const px = clamp(pointerX, 0, previewBounds.width);
  const py = clamp(pointerY, 0, previewBounds.height);
  const toRight = dx >= 0;
  const toBottom = dy >= 0;

  let s = desired;
  let sX0, sY0, sX1, sY1;

  if (toRight && toBottom) {
    sX1 = px;
    sY1 = py;
    sX0 = sX1 - s;
    sY0 = sY1 - s;
    if (sX0 < 0) {
      sX0 = 0; sX1 = sX0 + s;
    }
    if (sY0 < 0) {
      sY0 = 0; sY1 = sY0 + s;
    }
    if (sX1 > previewBounds.width) { s = previewBounds.width - sX0; sX1 = sX0 + s; }
    if (sY1 > previewBounds.height) { s = Math.min(s, previewBounds.height - sY0); sY1 = sY0 + s; }
  } else if (!toRight && toBottom) {
    sX1 = px;
    sY1 = py;
    sX0 = sX1 + s;
    sY0 = sY1 - s;
    if (sX0 > previewBounds.width) sX0 = previewBounds.width;
    if (sY0 < 0) { sY0 = 0; sY1 = sY0 + s; }
    sX1 = sX0 - s;
    if (sX1 < 0) { s = sX0; sX1 = 0; sX0 = s; }
    if (sY1 > previewBounds.height) { s = Math.min(s, previewBounds.height - sY0); sX0 = sX1 + s; sY0 = sY1 - s; }
  } else if (toRight && !toBottom) {
    sX1 = px;
    sY1 = py;
    sX0 = sX1 - s;
    sY0 = sY1 + s;
    if (sY0 > previewBounds.height) sY0 = previewBounds.height;
    if (sX0 < 0) { sX0 = 0; sX1 = sX0 + s; }
    sY1 = sY0 - s;
    if (sY1 < 0) { s = sY0; sY1 = 0; sY0 = s; }
  } else {
    sX1 = px;
    sY1 = py;
    sX0 = sX1 + s;
    sY0 = sY1 + s;
    if (sX0 > previewBounds.width) sX0 = previewBounds.width;
    if (sY0 > previewBounds.height) sY0 = previewBounds.height;
    sX1 = sX0 - s;
    sY1 = sY0 - s;
    if (sX1 < 0) { s = sX0; sX1 = 0; sX0 = s; }
    if (sY1 < 0) { s = sY0; sY1 = 0; sY0 = s; }
  }

  sX0 = clamp(sX0, 0, previewBounds.width);
  sY0 = clamp(sY0, 0, previewBounds.height);
  sX1 = clamp(sX1, 0, previewBounds.width);
  sY1 = clamp(sY1, 0, previewBounds.height);

  return { startX: sX0, startY: sY0, endX: sX1, endY: sY1 };
}

export function computeCropPercentFromSquare(startX, startY, endX, endY, previewBounds) {
  if (!previewBounds) return null;
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);

  return {
    left: (left / previewBounds.width) * 100,
    top: (top / previewBounds.height) * 100,
    right: ((previewBounds.width - left - width) / previewBounds.width) * 100,
    bottom: ((previewBounds.height - top - height) / previewBounds.height) * 100
  };
}

export default function CropOverlay({
  previewBounds,
  isCropSelecting,
  cropDraft,
  draftCropBoxStyle,
  hasCrop,
  currentCropBoxStyle,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel
}) {
  if (!previewBounds) return null;

  return (
    <div
      className={`preview-crop-overlay${isCropSelecting ? " preview-crop-overlay--interactive" : ""}`}
      style={{
        left: `${previewBounds.left}px`,
        top: `${previewBounds.top}px`,
        width: `${previewBounds.width}px`,
        height: `${previewBounds.height}px`
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
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
  );
}
