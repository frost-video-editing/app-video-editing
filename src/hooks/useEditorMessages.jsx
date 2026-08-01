import { useState } from "react";

// Manages status and error messages with a unified API.
export default function useEditorMessages(initialStatus) {
  const [status, setStatus] = useState(initialStatus);
  const [errorText, setErrorText] = useState("");

  function setStatusMessage(message) {
    setStatus(message);
  }

  function setErrorMessage(message) {
    setErrorText(message);
  }

  function clearMessages() {
    setErrorText("");
  }

  function clearErrorOnly() {
    setErrorText("");
  }

  function clearStatusOnly() {
    setStatus("");
  }

  return {
    status,
    errorText,
    setStatusMessage,
    setErrorMessage,
    clearMessages,
    clearErrorOnly,
    clearStatusOnly
  };
}
