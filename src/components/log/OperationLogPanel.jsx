import React, { useState } from "react";
import "../../styles/operation-log-viewer.css";
import StandaloneOperationLogView from "./OperationLogView.jsx";

/**
 * Owns the log entry point and the full operation history view.
 * @param {{logs: Array, isOpen: boolean, onOpen: Function, onClose: Function, onClearLogs: Function}} props
 * @returns {JSX.Element}
 */
export default function OperationLogPanel({
  logs = [],
  isOpen,
  onOpen,
  onClose,
  onClearLogs
}) {
  if (isOpen) {
    return (
      <StandaloneOperationLogView
        logs={logs}
        onClose={onClose}
        onClearLogs={onClearLogs}
      />
    );
  }

  return (
    <button
      type="button"
      className="secondary-button"
      onClick={onOpen}
      title="編集操作のログを表示・設定"
    >
      📋 ログを表示 ({logs.length})
    </button>
  );
}

function OperationLogView({ logs, onClose, onClearLogs }) {
  const [sortColumn, setSortColumn] = useState("timestamp");
  const [sortDirection, setSortDirection] = useState("desc");
  const [expandedId, setExpandedId] = useState(null);

  function formatTimestamp(timestamp) {
    if (!timestamp) return "-";
    return new Date(timestamp).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function getOperationIcon(operationType) {
    return {
      copy: "⧉", cut: "✂", paste: "↳", delete: "⌦", undo: "↶",
      crop: "▣", export: "💾", load: "📁"
    }[operationType] || "•";
  }

  function getOperationLabel(operationType) {
    return {
      copy: "コピー", cut: "カット", paste: "貼る", delete: "削除", undo: "戻す",
      crop: "crop", export: "出力", load: "読み込み"
    }[operationType] || operationType;
  }

  function handleSort(column) {
    if (sortColumn === column) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortColumn(column);
    setSortDirection("asc");
  }

  const sortedLogs = [...logs].sort((a, b) => {
    const compareA = sortColumn === "operation"
      ? a.operationType
      : new Date(a.timestamp).getTime();
    const compareB = sortColumn === "operation"
      ? b.operationType
      : new Date(b.timestamp).getTime();
    if (compareA === compareB) return 0;
    const result = compareA < compareB ? -1 : 1;
    return sortDirection === "asc" ? result : -result;
  });

  const sortIndicator = (column) => sortColumn === column
    ? (sortDirection === "asc" ? " ▲" : " ▼")
    : "";

  return (
    <main className="editor-shell log-viewer-container">
      <section className="hero card">
        <div className="hero-head">
          <div>
            <p className="eyebrow">Operation History</p>
            <h1>編集操作ログ</h1>
            <p>実行された動画編集操作の履歴</p>
          </div>
          <div className="hero-actions" style={{ marginRight: 12 }}>
            <button type="button" className="ghost-button" onClick={onClose}>戻る</button>
            {logs.length > 0 && (
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  if (window.confirm("すべてのログを削除しますか？")) onClearLogs();
                }}
              >
                ログをクリア
              </button>
            )}
          </div>
        </div>
        <div className="status-strip">
          <div><span>合計操作数</span><strong>{logs.length}</strong></div>
          {logs.length > 0 && <>
            <div><span>最初の操作</span><strong>{formatTimestamp(logs[0]?.timestamp)}</strong></div>
            <div><span>最後の操作</span><strong>{formatTimestamp(logs[logs.length - 1]?.timestamp)}</strong></div>
          </>}
        </div>
      </section>

      <section className="log-viewer-section card">
        {logs.length === 0 ? (
          <div className="log-empty-state">
            <p className="eyebrow">📝</p>
            <h2>操作ログがありません</h2>
            <p>動画編集操作を実行するとここに記録されます。</p>
          </div>
        ) : (
          <div className="log-table-wrapper">
            <table className="log-table">
              <thead><tr>
                <th className="col-number">#</th>
                <th className="col-operation"><button className="sort-button" onClick={() => handleSort("operation")}>操作{sortIndicator("operation")}</button></th>
                <th className="col-timestamp"><button className="sort-button" onClick={() => handleSort("timestamp")}>タイムスタンプ{sortIndicator("timestamp")}</button></th>
                <th className="col-details">詳細</th>
              </tr></thead>
              <tbody>
                {sortedLogs.map((log) => (
                  <React.Fragment key={log.id}>
                    <tr
                      className={`log-table-row ${expandedId === log.id ? "log-table-row--expanded" : ""}`}
                      onClick={() => setExpandedId((current) => current === log.id ? null : log.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <td className="col-number">{logs.length - logs.indexOf(log)}</td>
                      <td className="col-operation"><span className="operation-icon">{getOperationIcon(log.operationType)}</span><span className="operation-label">{getOperationLabel(log.operationType)}</span></td>
                      <td className="col-timestamp">{formatTimestamp(log.timestamp)}</td>
                      <td className="col-details"><span className="expand-indicator">{expandedId === log.id ? "▼" : "▶"}</span></td>
                    </tr>
                    {expandedId === log.id && log.details && (
                      <tr className="log-details-row"><td colSpan="4"><div className="log-details-content"><table className="details-table"><tbody>
                        {Object.entries(log.details).map(([key, value]) => (
                          <tr key={key}><td className="detail-key">{key}</td><td className="detail-value">{typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}</td></tr>
                        ))}
                      </tbody></table></div></td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
