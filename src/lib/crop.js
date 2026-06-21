import { clamp } from "./videoTimeline.js";

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

// Create a cropDraft (pixel coordinates) from normalized percent crop and preview bounds
export function createDraftFromCropPercent(crop, previewBounds) {
  if (!previewBounds || !crop) return null;

  const leftPx = (Number(crop.left) || 0) / 100 * previewBounds.width;
  const topPx = (Number(crop.top) || 0) / 100 * previewBounds.height;
  const rightPx = (Number(crop.right) || 0) / 100 * previewBounds.width;
  const bottomPx = (Number(crop.bottom) || 0) / 100 * previewBounds.height;

  const startX = leftPx;
  const startY = topPx;
  const endX = previewBounds.width - rightPx;
  const endY = previewBounds.height - bottomPx;

  return { startX, startY, endX, endY };
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
// If prevCrop is provided, compose the new crop inside the previous kept region.
export function finalizeCropSelection(cropDraft, previewBounds, prevCrop) {
  if (!cropDraft || !previewBounds) {
    return null;
  }

  const width = Math.abs(cropDraft.endX - cropDraft.startX);
  const height = Math.abs(cropDraft.endY - cropDraft.startY);
  if (width < MIN_CROP_BOX_SIZE || height < MIN_CROP_BOX_SIZE) {
    return null;
  }

  const draftPercent = computeCropPercentFromDraft(
    cropDraft.startX,
    cropDraft.startY,
    cropDraft.endX,
    cropDraft.endY,
    previewBounds
  );

  if (!prevCrop) {
    return normalizeCropInput(draftPercent);
  }

  // Compose prevCrop and draftPercent: compute relative draft within prev kept region
  const W = previewBounds.width;
  const H = previewBounds.height;

  const prevLeftPx = (Number(prevCrop.left) || 0) / 100 * W;
  const prevTopPx = (Number(prevCrop.top) || 0) / 100 * H;
  const prevRightPx = (Number(prevCrop.right) || 0) / 100 * W;
  const prevBottomPx = (Number(prevCrop.bottom) || 0) / 100 * H;

  const prevWidthPx = W - prevLeftPx - prevRightPx;
  const prevHeightPx = H - prevTopPx - prevBottomPx;

  if (prevWidthPx <= 0 || prevHeightPx <= 0) {
    return normalizeCropInput(draftPercent);
  }

  // Draft rectangle in pixels
  const draftLeftPx = (draftPercent.left / 100) * W;
  const draftTopPx = (draftPercent.top / 100) * H;
  const draftRightPx = (draftPercent.right / 100) * W;
  const draftBottomPx = (draftPercent.bottom / 100) * H;

  // Clamp draft to prev region
  const clampedLeftPx = Math.min(Math.max(draftLeftPx, prevLeftPx), prevLeftPx + prevWidthPx);
  const clampedTopPx = Math.min(Math.max(draftTopPx, prevTopPx), prevTopPx + prevHeightPx);
  const clampedRightPx = Math.min(Math.max(W - draftRightPx, prevLeftPx), prevLeftPx + prevWidthPx);
  const clampedBottomPx = Math.min(Math.max(H - draftBottomPx, prevTopPx), prevTopPx + prevHeightPx);

  // Relative positions within prev region
  const relLeft = (clampedLeftPx - prevLeftPx) / prevWidthPx;
  const relTop = (clampedTopPx - prevTopPx) / prevHeightPx;
  const relRight = (prevLeftPx + prevWidthPx - clampedRightPx) / prevWidthPx;
  const relBottom = (prevTopPx + prevHeightPx - clampedBottomPx) / prevHeightPx;

  const prevKeptW = 100 - (Number(prevCrop.left) || 0) - (Number(prevCrop.right) || 0);
  const prevKeptH = 100 - (Number(prevCrop.top) || 0) - (Number(prevCrop.bottom) || 0);

  const combined = {
    left: (Number(prevCrop.left) || 0) + relLeft * prevKeptW,
    top: (Number(prevCrop.top) || 0) + relTop * prevKeptH,
    right: (Number(prevCrop.right) || 0) + relRight * prevKeptW,
    bottom: (Number(prevCrop.bottom) || 0) + relBottom * prevKeptH
  };

  return normalizeCropInput(combined);
}
