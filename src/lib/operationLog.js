/**
 * Utility functions for managing operation logs
 */

export function createOperationLog(operationType, details = {}) {
  return {
    id: Date.now() + Math.random(),
    operationType,
    timestamp: new Date().toISOString(),
    details
  };
}

export function createCopyLog(selectedDuration, selectionStart, selectionEnd) {
  return createOperationLog("copy", {
    "選択範囲": `${formatTime(selectionStart)} - ${formatTime(selectionEnd)}`,
    "選択時間": `${formatTime(selectedDuration)}`
  });
}

export function createCutLog(playhead, cutTime) {
  return createOperationLog("cut", {
    "切断位置": formatTime(cutTime || playhead),
    "再生ヘッド": formatTime(playhead)
  });
}

export function createPasteLog(playhead, pastedDuration, clipboardDuration) {
  return createOperationLog("paste", {
    "挿入位置": formatTime(playhead),
    "挿入時間": formatTime(pastedDuration),
    "クリップ大きさ": formatTime(clipboardDuration)
  });
}

export function createDeleteLog(selectionStart, selectionEnd, deletedDuration) {
  return createOperationLog("delete", {
    "削除範囲": `${formatTime(selectionStart)} - ${formatTime(selectionEnd)}`,
    "削除時間": formatTime(deletedDuration)
  });
}

export function createUndoLog() {
  return createOperationLog("undo", {
    "説明": "前の操作を取り消しました"
  });
}

export function createCropLog(crop, hasCrop) {
  return createOperationLog("crop", {
    "crop有効": hasCrop ? "はい" : "いいえ",
    "左": `${crop.left.toFixed(2)}%`,
    "上": `${crop.top.toFixed(2)}%`,
    "右": `${crop.right.toFixed(2)}%`,
    "下": `${crop.bottom.toFixed(2)}%`
  });
}

export function createExportLog(sourceName, outputPath, segmentCount, metadata) {
  return createOperationLog("export", {
    "ソース": sourceName || "不明",
    "出力先": outputPath || "不明",
    "セグメント数": String(segmentCount),
    "動画時間": `${metadata.duration.toFixed(2)}秒`,
    "解像度": `${metadata.width}x${metadata.height}`,
    "音声": metadata.hasAudio ? "あり" : "なし"
  });
}

export function createLoadLog(sourceName, metadata) {
  return createOperationLog("load", {
    "ファイル名": sourceName || "不明",
    "動画時間": `${metadata.duration.toFixed(2)}秒`,
    "解像度": `${metadata.width}x${metadata.height}`,
    "音声": metadata.hasAudio ? "あり" : "なし"
  });
}

function formatTime(seconds) {
  if (typeof seconds !== "number" || !isFinite(seconds)) {
    return "0:00.00";
  }
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const ms = Math.floor((seconds - Math.floor(seconds)) * 100);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}
