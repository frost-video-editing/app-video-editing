import React, { useMemo, useState } from "react";
import useLanguage from "../../hooks/useLanguage.jsx";

/**
 * Renders the full operation history screen.
 * @param {{logs: Array, onClose: Function, onClearLogs: Function}} props
 * @returns {JSX.Element}
 */
export default function OperationLogView({
  logs,
  onClose,
  onClearLogs
}) {
  const { language, t } = useLanguage();
  const [sortColumn, setSortColumn] = useState("timestamp");
  const [sortDirection, setSortDirection] = useState("desc");
  const [expandedId, setExpandedId] = useState(null);
  const [operationFilter, setOperationFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  function formatTimestamp(timestamp) {
    if (!timestamp) return "-";
    return new Date(timestamp).toLocaleString(language === "en" ? "en-US" : "ja-JP", {
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
      copy: t("copy"), cut: t("cut"), paste: t("paste"), delete: t("delete"), undo: t("undoAction"),
      crop: t("crop"), export: t("output"), load: t("loadVideo")
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

  const operationTypes = [...new Set(logs.map((log) => log.operationType).filter(Boolean))].sort();
  const filteredLogs = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : -Infinity;
    const to = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : Infinity;
    return logs.filter((log) => {
      const timestamp = new Date(log.timestamp).getTime();
      return (operationFilter === "all" || log.operationType === operationFilter)
        && timestamp >= from
        && timestamp <= to;
    });
  }, [logs, operationFilter, fromDate, toDate]);

  const sortedLogs = [...filteredLogs].sort((a, b) => {
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
            <h1>{t("operationLog")}</h1>
            <p>{t("operationLogDescription")}</p>
          </div>
          <div className="hero-actions" style={{ marginRight: 12 }}>
            <button type="button" className="ghost-button" onClick={onClose}>{t("back")}</button>
            {logs.length > 0 && (
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  if (window.confirm(t("clearLogsConfirm"))) onClearLogs();
                }}
              >
                {t("clearLogs")}
              </button>
            )}
          </div>
        </div>
        <div className="status-strip">
          <div><span>{t("shownAndTotal")}</span><strong>{filteredLogs.length} / {logs.length}</strong></div>
          {filteredLogs.length > 0 && <>
            <div><span>{t("firstOperation")}</span><strong>{formatTimestamp(filteredLogs[0]?.timestamp)}</strong></div>
            <div><span>{t("lastOperation")}</span><strong>{formatTimestamp(filteredLogs[filteredLogs.length - 1]?.timestamp)}</strong></div>
          </>}
        </div>
      </section>

      <section className="log-viewer-section card">
        {logs.length > 0 && (
          <div className="log-filters" aria-label={t("logFilters")}>
            <label>{t("operationType")}
              <select value={operationFilter} onChange={(event) => setOperationFilter(event.target.value)}>
                <option value="all">{t("all")}</option>
                {operationTypes.map((type) => <option key={type} value={type}>{getOperationLabel(type)}</option>)}
              </select>
            </label>
            <label>{t("startDate")}<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
            <label>{t("endDate")}<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
            {(operationFilter !== "all" || fromDate || toDate) && (
              <button type="button" className="ghost-button" onClick={() => { setOperationFilter("all"); setFromDate(""); setToDate(""); }}>
                {t("resetFilters")}
              </button>
            )}
          </div>
        )}
        {logs.length === 0 ? (
          <div className="log-empty-state">
            <p className="eyebrow">📝</p>
            <h2>{t("noOperationLogs")}</h2>
            <p>{t("operationLogEmptyDescription")}</p>
          </div>
        ) : sortedLogs.length === 0 ? (
          <div className="log-empty-state"><h2>{t("noMatchingLogs")}</h2><p>{t("changeFilterConditions")}</p></div>
        ) : (
          <div className="log-table-wrapper">
            <table className="log-table">
              <thead><tr>
                <th className="col-number">#</th>
                <th className="col-operation"><button className="sort-button" onClick={() => handleSort("operation")}>{t("operation")}{sortIndicator("operation")}</button></th>
                <th className="col-timestamp"><button className="sort-button" onClick={() => handleSort("timestamp")}>{t("timestamp")}{sortIndicator("timestamp")}</button></th>
                <th className="col-details">{t("details")}</th>
              </tr></thead>
              <tbody>
                {sortedLogs.map((log) => (
                  <React.Fragment key={log.id}>
                    <tr
                      className={`log-table-row ${expandedId === log.id ? "log-table-row--expanded" : ""}`}
                      onClick={() => setExpandedId((current) => current === log.id ? null : log.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <td className="col-number">{filteredLogs.length - filteredLogs.indexOf(log)}</td>
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
