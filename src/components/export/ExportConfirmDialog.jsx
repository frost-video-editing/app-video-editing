import { formatCrop } from "../../lib/crop.js";
import { formatVideoTime } from "../../lib/videoTimeline.js";

// Displays export settings and delegates every state change to the editor container.
export default function ExportConfirmDialog({
  isVisible,
  sourceName,
  segmentsLength,
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
  canExport,
  onChooseOutput,
  onClose,
  onExport
}) {
  if (!isVisible) {
    return null;
  }

  const cropRows = ["left", "top", "right", "bottom"];

  return (
    <div className="export-confirm-overlay" role="dialog" aria-modal="true" aria-label="動画出力の確認">
      <div className="export-confirm-dialog card">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Export Confirmation</p>
            <h2>動画出力の確認</h2>
          </div>
          <div className="panel-head-meta">
            <span>確認後に出力を開始します</span>
          </div>
        </div>

        <div className="export-confirm-body">
          <div className="export-meta">
            <span>ソース: {sourceName || "未選択"}</span>
            <span>セグメント数: {segmentsLength}</span>
            <span>出力映像長: {formatVideoTime(totalDuration)}</span>
            {hasCrop ? (
              <table className="export-crop-table" style={{ borderCollapse: "collapse", marginTop: 6 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: 4 }}>項目</th>
                    <th style={{ textAlign: "left", padding: 4 }}>%</th>
                    <th style={{ textAlign: "left", padding: 4 }}>px</th>
                  </tr>
                </thead>
                <tbody>
                  {cropRows.map((edge) => {
                    const dimension = edge === "left" || edge === "right" ? metadata.width : metadata.height;
                    const value = Number(crop[edge]) || 0;
                    return (
                      <tr key={edge}>
                        <td style={{ padding: 4 }}>{edge}</td>
                        <td style={{ padding: 4 }}>{value.toFixed(2)}%</td>
                        <td style={{ padding: 4 }}>{dimension ? `${Math.round(value / 100 * dimension)}px` : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <span>現在の crop: {formatCrop(crop)}</span>
            )}
            <span>音声: {metadata.hasAudio ? "あり" : "なし"}</span>
          </div>

          <div className="export-meta">
            <span>出力先: {outputPath || "未設定"}</span>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              出力プロファイル
              <select value={exportProfile} onChange={(event) => setExportProfile(event.target.value)}>
                <option value="fast">高速</option>
                <option value="standard">標準</option>
                <option value="high">高品質</option>
                <option value="gpu">GPU優先</option>
              </select>
            </label>
            {hasCrop ? (
              <div style={{ display: "grid", gap: 8 }}>
                <label>
                  <input
                    type="checkbox"
                    checked={preserveCropResolution}
                    onChange={(event) => setPreserveCropResolution(event.target.checked)}
                  />
                  crop後も元解像度を維持する
                </label>
                {preserveCropResolution ? (
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    拡大補間
                    <select value={cropScaleAlgorithm} onChange={(event) => setCropScaleAlgorithm(event.target.value)}>
                      <option value="lanczos">高品質 (Lanczos)</option>
                      <option value="bilinear">高速 (Bilinear)</option>
                    </select>
                  </label>
                ) : (
                  <span style={{ fontSize: 12, color: "#666" }}>
                    crop後の解像度を維持するため、再拡大を行いません。高速です。
                  </span>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className="action-row export-confirm-actions">
          <button type="button" className="secondary-button" onClick={onChooseOutput} disabled={isExporting}>
            {outputPath ? "出力先を変更" : "出力先を選ぶ"}
          </button>
          <button type="button" className="ghost-button" onClick={onClose} disabled={isExporting}>
            キャンセル
          </button>
          <button type="button" onClick={onExport} disabled={isExporting || !canExport}>
            {isExporting ? "出力中..." : "この内容で出力"}
          </button>
        </div>
      </div>
    </div>
  );
}