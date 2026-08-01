import { useEffect } from "react";
import { loadShortcuts } from "../lib/shortcutManager.js";

// Centralized keyboard shortcuts hook with customizable shortcuts.
// Accepts callbacks and minimal state needed to decide whether shortcuts are allowed.
export default function useShortcuts({ onTogglePreviewPlayback, onCut, onReturn, onCopy, onPaste, onDelete, onCrop, onExport, segmentsLength, isExporting, setErrorMessage }) {
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
          setErrorMessage?.("ショートカットの実行に失敗しました。");
        }
      }

      // Cut
      if (code === shortcuts.cut.code) {
        e.preventDefault?.();
        if (!segmentsLength || isExporting) {
          setErrorMessage?.("切り取りできる動画が読み込まれていないか、出力中のため操作できません。");
          return;
        }
        try {
          onCut?.();
        } catch (err) {
          console.error("Shortcut onCut failed", err);
          setErrorMessage?.("ショートカットの実行に失敗しました。");
        }
      }

      // Undo/Return
      if (code === shortcuts.undo.code) {
        e.preventDefault?.();
        try {
          onReturn?.();
        } catch (err) {
          console.error("Shortcut onReturn failed", err);
          setErrorMessage?.("ショートカットの実行に失敗しました。");
        }
      }

      // Copy
      if (code === shortcuts.copy.code) {
        e.preventDefault?.();
        try {
          onCopy?.();
        } catch (err) {
          console.error("Shortcut onCopy failed", err);
          setErrorMessage?.("ショートカットの実行に失敗しました。");
        }
      }

      // Paste
      if (code === shortcuts.paste.code) {
        e.preventDefault?.();
        try {
          onPaste?.();
        } catch (err) {
          console.error("Shortcut onPaste failed", err);
          setErrorMessage?.("ショートカットの実行に失敗しました。");
        }
      }

      // Delete
      if (code === shortcuts.delete.code) {
        e.preventDefault?.();
        try {
          onDelete?.();
        } catch (err) {
          console.error("Shortcut onDelete failed", err);
          setErrorMessage?.("ショートカットの実行に失敗しました。");
        }
      }

      // Crop
      if (code === shortcuts.crop.code) {
        e.preventDefault?.();
        try {
          onCrop?.();
        } catch (err) {
          console.error("Shortcut onCrop failed", err);
          setErrorMessage?.("ショートカットの実行に失敗しました。");
        }
      }

      // Export
      if (code === shortcuts.export.code) {
        e.preventDefault?.();
        try {
          onExport?.();
        } catch (err) {
          console.error("Shortcut onExport failed", err);
          setErrorMessage?.("ショートカットの実行に失敗しました。");
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcuts, segmentsLength, isExporting, onTogglePreviewPlayback, onCut, onReturn, onCopy, onPaste, onDelete, onCrop, onExport, setErrorMessage]);
}
