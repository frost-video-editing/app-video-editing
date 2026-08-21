import { useEffect } from "react";
import { loadShortcuts } from "../lib/shortcutManager.js";
import useLanguage from "./useLanguage.jsx";

// Centralized keyboard shortcuts hook with customizable shortcuts.
// Accepts callbacks and minimal state needed to decide whether shortcuts are allowed.
export default function useShortcuts({ onTogglePreviewPlayback, onCut, onReturn, onCopy, onPaste, onDelete, onCrop, onExport, segmentsLength, isExporting, setErrorMessage }) {
  const { t } = useLanguage();
  const shortcuts = loadShortcuts();

  useEffect(() => {
    function onKeyDown(e) {
      if (e.repeat) return;
      const code = e.code || e.key;
      
      // Check if target is an input field
      const target = e.target;
      const tag = target && target.tagName ? String(target.tagName).toLowerCase() : null;
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) {
        return;
      }

      // Play/Pause
      if (code === shortcuts.playPause.code) {
        e.preventDefault?.();
        try {
          onTogglePreviewPlayback?.();
        } catch (err) {
          console.error("Shortcut onTogglePreviewPlayback failed", err);
          setErrorMessage?.(t("shortcutFailed"));
        }
      }

      // Cut
      if (code === shortcuts.cut.code) {
        e.preventDefault?.();
        if (!segmentsLength || isExporting) {
          setErrorMessage?.(t("shortcutCutUnavailable"));
          return;
        }
        try {
          onCut?.();
        } catch (err) {
          console.error("Shortcut onCut failed", err);
          setErrorMessage?.(t("shortcutFailed"));
        }
      }

      // Undo/Return
      if (code === shortcuts.undo.code) {
        e.preventDefault?.();
        try {
          onReturn?.();
        } catch (err) {
          console.error("Shortcut onReturn failed", err);
          setErrorMessage?.(t("shortcutFailed"));
        }
      }

      // Copy
      if (code === shortcuts.copy.code) {
        e.preventDefault?.();
        try {
          onCopy?.();
        } catch (err) {
          console.error("Shortcut onCopy failed", err);
          setErrorMessage?.(t("shortcutFailed"));
        }
      }

      // Paste
      if (code === shortcuts.paste.code) {
        e.preventDefault?.();
        try {
          onPaste?.();
        } catch (err) {
          console.error("Shortcut onPaste failed", err);
          setErrorMessage?.(t("shortcutFailed"));
        }
      }

      // Delete
      if (code === shortcuts.delete.code) {
        e.preventDefault?.();
        try {
          onDelete?.();
        } catch (err) {
          console.error("Shortcut onDelete failed", err);
          setErrorMessage?.(t("shortcutFailed"));
        }
      }

      // Crop
      if (code === shortcuts.crop.code) {
        e.preventDefault?.();
        try {
          onCrop?.();
        } catch (err) {
          console.error("Shortcut onCrop failed", err);
          setErrorMessage?.(t("shortcutFailed"));
        }
      }

      // Export
      if (code === shortcuts.export.code) {
        e.preventDefault?.();
        try {
          onExport?.();
        } catch (err) {
          console.error("Shortcut onExport failed", err);
          setErrorMessage?.(t("shortcutFailed"));
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcuts, segmentsLength, isExporting, onTogglePreviewPlayback, onCut, onReturn, onCopy, onPaste, onDelete, onCrop, onExport, setErrorMessage, t]);
}
