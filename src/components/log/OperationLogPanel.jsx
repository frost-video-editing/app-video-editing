import React from "react";
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
  onClearLogs,
  t,
  language
}) {
  if (isOpen) {
    return (
      <StandaloneOperationLogView
        logs={logs}
        onClose={onClose}
        onClearLogs={onClearLogs}
        language={language}
        t={t}
      />
    );
  }

  return (
    <button
      type="button"
      className="secondary-button"
      onClick={onOpen}
      title={t("operationLogTitle")}
    >
      📋 {t("showLogs")} ({logs.length})
    </button>
  );
}
