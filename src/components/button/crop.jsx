import React from "react";
import {
  normalizeCropInput,
  getPreviewPoint,
  createDraftFromCropPercent,
  updateCropDraft,
  getDraftCropBoxStyle,
  computeCropPercentFromDraft,
  finalizeCropSelection
} from "../../lib/crop.js";

export {
  normalizeCropInput,
  getPreviewPoint,
  createDraftFromCropPercent,
  updateCropDraft,
  getDraftCropBoxStyle,
  computeCropPercentFromDraft,
  finalizeCropSelection
};

export function CropControls({
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
  hasCrop
}) {
  return (
    <div className="preview-crop-coords">
      {previewBounds ? (
        <div className="crop-form">
          <strong>数値で指定</strong>
          <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "flex-end" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="radio" name="crop-unit" checked={cropFormUnit === "%"} onChange={() => setCropFormUnit("%")} />%
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="radio" name="crop-unit" checked={cropFormUnit === "px"} onChange={() => setCropFormUnit("px")} />px
              </label>
            </div>

            <label style={{ display: "flex", flexDirection: "column" }}>
              {cropFormUnit === "%" ? "left %" : "left (px)"}
              <input type="number" value={cropForm.left} onChange={(e) => handleCropFormChange("left", e.target.value)} style={{ width: 80 }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column" }}>
              {cropFormUnit === "%" ? "top %" : "top (px)"}
              <input type="number" value={cropForm.top} onChange={(e) => handleCropFormChange("top", e.target.value)} style={{ width: 80 }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column" }}>
              {cropFormUnit === "%" ? "width %" : "width (px)"}
              <input type="number" value={cropForm.width} onChange={(e) => handleCropFormChange("width", e.target.value)} style={{ width: 80 }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column" }}>
              {cropFormUnit === "%" ? "height %" : "height (px)"}
              <input type="number" value={cropForm.height} onChange={(e) => handleCropFormChange("height", e.target.value)} style={{ width: 80 }} />
            </label>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button type="button" className="secondary-button" onClick={applyCropFromForm} disabled={isExporting}>適用</button>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 8, marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input placeholder="preset name" value={presetName} onChange={(e) => setPresetName(e.target.value)} style={{ flex: 1 }} />
          <button type="button" className="secondary-button" onClick={handleSaveCropPreset} disabled={!hasCrop}>保存</button>
        </div>

        {cropPresets.length ? (
          <div style={{ marginTop: 8 }}>
            <strong>保存済み presets</strong>
            <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0 0" }}>
              {cropPresets.map((p) => (
                <li key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ flex: 1 }}>{p.name}</div>
                  <div style={{ color: "#666", fontSize: 12 }}>{(p.crop && p.crop.left != null) ? `${p.crop.left.toFixed(2)}% / ${p.crop.top.toFixed(2)}%` : "-"}</div>
                  <button type="button" className="ghost-button" onClick={() => handleApplyCropPreset(p)}>適用</button>
                  <button type="button" className="timeline-item-delete" onClick={() => handleDeletePreset(p.id)}>削除</button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
