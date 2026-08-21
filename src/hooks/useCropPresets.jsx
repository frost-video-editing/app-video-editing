import { useEffect, useState } from "react";
import { clamp } from "../lib/videoTimeline.js";
import { normalizeCropInput } from "../lib/crop.js";
import {
  createDraftFromCropPercent,
  finalizeCropSelection,
  getPreviewPoint as getCropPreviewPoint,
  updateCropDraft
} from "../lib/crop.js";
import useLanguage from "./useLanguage.jsx";

const STORAGE_KEY = "videoEditor.cropPresets";

// Owns crop form synchronization and saved crop preset persistence.
export default function useCropPresets({
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
}) {
  const { t } = useLanguage();
  const [cropForm, setCropForm] = useState({ left: 0, top: 0, width: 100, height: 100 });
  const [cropPresets, setCropPresets] = useState([]);

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
      setCropForm({
        left: Math.round((left / 100) * previewBounds.width),
        top: Math.round((top / 100) * previewBounds.height),
        width: Math.round((widthPct / 100) * previewBounds.width),
        height: Math.round((heightPct / 100) * previewBounds.height)
      });
    }
  }, [crop, cropFormUnit, previewBounds]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setCropPresets(parsed);
      }
    } catch (error) {
      console.error("Failed to restore crop presets", error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cropPresets));
    } catch (error) {
      console.error("Failed to persist crop presets", error);
    }
  }, [cropPresets]);

  function handleCropFormChange(field, value) {
    const num = Number(value);
    if (!Number.isNaN(num)) setCropForm((current) => ({ ...current, [field]: num }));
  }

  function applyCropFromForm() {
    if (!previewBounds) {
      messages.setErrorMessage(t("previewNotReady"));
      return;
    }

    let leftPct;
    let topPct;
    let widthPct;
    let heightPct;
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

    pushUndoSnapshot();
    setCrop(normalizeCropInput({
      left: leftPct,
      top: topPct,
      right: Math.max(0, 100 - leftPct - widthPct),
      bottom: Math.max(0, 100 - topPct - heightPct)
    }));
    setIsCropPreviewLocked(true);
    messages.setStatusMessage(t("cropApplied"));
  }

  function handleSaveCropPreset() {
    if (!hasCrop) {
      messages.setErrorMessage(t("cropRequired"));
      return;
    }
    const name = (presetName || `preset-${new Date().toISOString()}`).trim();
    setCropPresets((current) => [{ id: Date.now(), name, crop: normalizeCropInput(crop) }, ...current].slice(0, 50));
    setPresetName("");
    messages.setStatusMessage(t("cropPresetSaved", name));
    messages.clearErrorOnly();
  }

  function handleApplyCropPreset(preset) {
    if (!preset?.crop) return;
    pushUndoSnapshot();
    setCrop({ ...preset.crop });
    setIsCropPreviewLocked(true);
    messages.setStatusMessage(t("cropPresetApplied", preset.name));
  }

  function handleDeletePreset(id) {
    setCropPresets((current) => current.filter((preset) => preset.id !== id));
    messages.setStatusMessage(t("cropPresetDeleted"));
  }

  return {
    cropForm,
    cropPresets,
    handleCropFormChange,
    applyCropFromForm,
    handleSaveCropPreset,
    handleApplyCropPreset,
    handleDeletePreset
  };
}

// Owns crop preview locking and clearing actions.
export function useCropActions({
  hasCrop,
  isCropPreviewLocked,
  setIsCropPreviewLocked,
  setCrop,
  emptyCrop,
  pushUndoSnapshot,
  resetCropSelection,
  messages
}) {
  const { t } = useLanguage();
  function handleToggleCropPreviewLock() {
    if (!hasCrop) {
      messages.setErrorMessage(t("cropRequired"));
      return;
    }

    const nextLocked = !isCropPreviewLocked;
    setIsCropPreviewLocked(nextLocked);
    messages.clearErrorOnly();
    messages.setStatusMessage(nextLocked ? t("cropLocked") : t("previewRestored"));
  }

  function handleClearCrop() {
    pushUndoSnapshot();
    setCrop(emptyCrop);
    setIsCropPreviewLocked(false);
    resetCropSelection();
    messages.clearErrorOnly();
    messages.setStatusMessage(t("cropCleared"));
  }

  return { handleToggleCropPreviewLock, handleClearCrop };
}

export function useCropSelection({
  stageRef,
  sourceUrl,
  previewBounds,
  crop,
  hasCrop,
  setCrop,
  setIsCropPreviewLocked,
  messages,
  pushUndoSnapshot,
  onCropConfirmed
}) {
  const { t } = useLanguage();
  const [isCropSelecting, setIsCropSelecting] = useState(false);
  const [cropDraft, setCropDraft] = useState(null);
  const [cropInteraction, setCropInteraction] = useState(null);

  function resetCropSelection() {
    setCropDraft(null);
    setIsCropSelecting(false);
    setCropInteraction(null);
  }

  function getPreviewPoint(clientX, clientY) {
    const stage = stageRef.current;
    if (!stage || !previewBounds) return null;
    return getCropPreviewPoint(clientX, clientY, stage.getBoundingClientRect(), previewBounds);
  }

  function handleStartCropSelection() {
    if (!sourceUrl || !previewBounds) return;
    if (hasCrop) {
      setIsCropPreviewLocked(true);
      setCropDraft(createDraftFromCropPercent(crop, previewBounds));
    } else {
      setIsCropPreviewLocked(false);
      setCropDraft(null);
    }
    setIsCropSelecting(true);
    messages.setStatusMessage(t("cropInstruction"));
  }

  function handlePreviewPointerDown(event) {
    const point = getPreviewPoint(event.clientX, event.clientY);
    if (!point || !isCropSelecting) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (cropDraft) {
      const isFullViewportDraft = previewBounds &&
        cropDraft.startX === 0 && cropDraft.startY === 0 &&
        cropDraft.endX === previewBounds.width && cropDraft.endY === previewBounds.height;
      if (isFullViewportDraft && hasCrop) {
        setCropDraft({ startX: point.x, startY: point.y, endX: point.x, endY: point.y });
        return;
      }
      const left = Math.min(cropDraft.startX, cropDraft.endX);
      const top = Math.min(cropDraft.startY, cropDraft.endY);
      const right = Math.max(cropDraft.startX, cropDraft.endX);
      const bottom = Math.max(cropDraft.startY, cropDraft.endY);
      if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) {
        setCropInteraction({ mode: "move", originDraft: { ...cropDraft }, pointerStart: { x: point.x, y: point.y } });
        return;
      }
    }
    setCropDraft({ startX: point.x, startY: point.y, endX: point.x, endY: point.y });
    setCropInteraction({ mode: "new", pointerStart: { x: point.x, y: point.y } });
  }

  function handlePreviewPointerMove(event) {
    if (!cropDraft || !previewBounds) return;
    const point = getPreviewPoint(event.clientX, event.clientY);
    if (!point) return;
    if (cropInteraction?.mode === "move") {
      const dx = point.x - cropInteraction.pointerStart.x;
      const dy = point.y - cropInteraction.pointerStart.y;
      const origin = cropInteraction.originDraft;
      setCropDraft({
        startX: clamp(origin.startX + dx, 0, previewBounds.width),
        startY: clamp(origin.startY + dy, 0, previewBounds.height),
        endX: clamp(origin.endX + dx, 0, previewBounds.width),
        endY: clamp(origin.endY + dy, 0, previewBounds.height)
      });
      return;
    }
    setCropDraft((current) => updateCropDraft(current, point, previewBounds));
  }

  function handlePreviewPointerUp(event) {
    if (!cropDraft || !previewBounds) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const nextCrop = finalizeCropSelection(cropDraft, previewBounds, cropInteraction?.mode !== "new" && hasCrop ? crop : null);
    if (!nextCrop) {
      messages.setStatusMessage(t("cropSelectAgain"));
      setCropDraft(null);
      setCropInteraction(null);
      return;
    }
    pushUndoSnapshot();
    setCrop(nextCrop);
    setCropDraft(null);
    setIsCropSelecting(false);
    setIsCropPreviewLocked(true);
    setCropInteraction(null);
    messages.clearErrorOnly();
    messages.setStatusMessage(t("cropUpdated"));
    onCropConfirmed?.(nextCrop);
  }

  return { isCropSelecting, cropDraft, resetCropSelection, handleStartCropSelection, handlePreviewPointerDown, handlePreviewPointerMove, handlePreviewPointerUp };
}
