import React, { useRef } from "react";

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
  cancelDeletePreset,
  handleExportCropPresets,
  handleImportCropPresets,
  pendingDelete,
  hasCrop,
  t
}) {
  const importInputRef = useRef(null);
  return (
    <div className="preview-crop-coords">
      {previewBounds ? (
        <div className="crop-form">
          <strong>{t("numericCrop")}</strong>
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
              {t(cropFormUnit === "%" ? "cropLeftPercent" : "cropLeftPixels")}
              <input type="number" value={cropForm.left} onChange={(e) => handleCropFormChange("left", e.target.value)} style={{ width: 80 }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column" }}>
              {t(cropFormUnit === "%" ? "cropTopPercent" : "cropTopPixels")}
              <input type="number" value={cropForm.top} onChange={(e) => handleCropFormChange("top", e.target.value)} style={{ width: 80 }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column" }}>
              {t(cropFormUnit === "%" ? "cropWidthPercent" : "cropWidthPixels")}
              <input type="number" value={cropForm.width} onChange={(e) => handleCropFormChange("width", e.target.value)} style={{ width: 80 }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column" }}>
              {t(cropFormUnit === "%" ? "cropHeightPercent" : "cropHeightPixels")}
              <input type="number" value={cropForm.height} onChange={(e) => handleCropFormChange("height", e.target.value)} style={{ width: 80 }} />
            </label>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button type="button" className="secondary-button" onClick={applyCropFromForm} disabled={isExporting}>{t("apply")}</button>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 8, marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input placeholder="preset name" value={presetName} onChange={(e) => setPresetName(e.target.value)} style={{ flex: 1 }} />
          <button type="button" className="secondary-button" onClick={handleSaveCropPreset} disabled={!hasCrop}>{t("save")}</button>
        </div>

        {/* Saved crop presets */}
        {cropPresets.length ? (
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>{t("savedPresets")}</summary>
            <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0 0" }}>
              {cropPresets.map((p) => (
                <li key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ flex: 1 }}>{p.name}</div>
                  <div style={{ color: "#666", fontSize: 12 }}>{(p.crop && p.crop.left != null) ? `${p.crop.left.toFixed(2)}% / ${p.crop.top.toFixed(2)}%` : "-"}</div>
                  <button type="button" className="ghost-button" onClick={() => handleApplyCropPreset(p)}>{t("apply")}</button>
                  {pendingDelete?.id === p.id ? (
                    <button type="button" className="timeline-item-delete" onClick={cancelDeletePreset}>
                      {t("cancel")} ({pendingDelete.remaining})
                    </button>
                  ) : (
                    <button type="button" className="timeline-item-delete" onClick={() => handleDeletePreset(p.id)} disabled={Boolean(pendingDelete)}>
                      {t("delete")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            
            {/* Export and import buttons for crop presets */}
            <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
              <button type="button" className="ghost-button" onClick={handleExportCropPresets}>{t("downloadPresets")}</button>
              <button type="button" className="ghost-button" onClick={() => importInputRef.current?.click()}>{t("importPresets")}</button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(event) => {
                  handleImportCropPresets(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
