import { clamp } from "../../lib/videoTimeline.js";

const MIN_CROP_BOX_SIZE = 12;
const MAX_CROP_SUM = 99;

function scaleCropAxis(startPercent, endPercent) {
  const total = startPercent + endPercent;
  if (total <= MAX_CROP_SUM) {
    return [startPercent, endPercent];
  }

  const scale = MAX_CROP_SUM / total;
  return [startPercent * scale, endPercent * scale];
}

// Clamp crop percentages while keeping at least 1% of the frame on each axis.
export function normalizeCropInput(nextCrop) {
  const left = clamp(Number(nextCrop?.left) || 0, 0, MAX_CROP_SUM);
  const top = clamp(Number(nextCrop?.top) || 0, 0, MAX_CROP_SUM);
  const right = clamp(Number(nextCrop?.right) || 0, 0, MAX_CROP_SUM);
  const bottom = clamp(Number(nextCrop?.bottom) || 0, 0, MAX_CROP_SUM);

  const [safeLeft, safeRight] = scaleCropAxis(left, right);
  const [safeTop, safeBottom] = scaleCropAxis(top, bottom);

  return {
    left: safeLeft,
    top: safeTop,
    right: safeRight,
    bottom: safeBottom
  };
}

// Convert a client pointer position into preview-relative coordinates.
export function getPreviewPoint(clientX, clientY, stageRect, previewBounds) {
  if (!stageRect || !previewBounds) {
    return null;
  }

  return {
    x: clamp(clientX - stageRect.left - previewBounds.left, 0, previewBounds.width),
    y: clamp(clientY - stageRect.top - previewBounds.top, 0, previewBounds.height)
  };
}

// Update the current crop draft with a freely resizable rectangle.
export function updateCropDraft(currentDraft, point, previewBounds) {
  if (!currentDraft || !point || !previewBounds) {
    return currentDraft;
  }

  return {
    ...currentDraft,
    endX: clamp(point.x, 0, previewBounds.width),
    endY: clamp(point.y, 0, previewBounds.height)
  };
}

// Build the overlay style for the current draft rectangle.
export function getDraftCropBoxStyle(cropDraft, previewBounds) {
  if (!cropDraft || !previewBounds) {
    return null;
  }

  const { startX, startY, endX, endY } = cropDraft;
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);

  return {
    left: `${(left / previewBounds.width) * 100}%`,
    top: `${(top / previewBounds.height) * 100}%`,
    width: `${(width / previewBounds.width) * 100}%`,
    height: `${(height / previewBounds.height) * 100}%`
  };
}

// Convert a draft rectangle into crop percentages for preview and export.
export function computeCropPercentFromDraft(startX, startY, endX, endY, previewBounds) {
  if (!previewBounds) {
    return null;
  }

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

// Finalize a crop draft into normalized percentages or return null for tiny drags.
export function finalizeCropSelection(cropDraft, previewBounds) {
  if (!cropDraft || !previewBounds) {
    return null;
  }

  const width = Math.abs(cropDraft.endX - cropDraft.startX);
  const height = Math.abs(cropDraft.endY - cropDraft.startY);
  if (width < MIN_CROP_BOX_SIZE || height < MIN_CROP_BOX_SIZE) {
    return null;
  }

  return normalizeCropInput(
    computeCropPercentFromDraft(
      cropDraft.startX,
      cropDraft.startY,
      cropDraft.endX,
      cropDraft.endY,
      previewBounds
    )
  );
}
