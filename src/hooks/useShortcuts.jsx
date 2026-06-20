import { useEffect } from "react";

// Centralized keyboard shortcuts hook.
// Accepts callbacks and minimal state needed to decide whether shortcuts are allowed.
export default function useShortcuts({ onTogglePreviewPlayback, onCut, onReturn, segmentsLength, isExporting, setErrorText }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.repeat) return;
      const code = e.code || e.key;
      if (code === "Space" || code === "Enter") {
        const target = e.target;
        const tag = target && target.tagName ? String(target.tagName).toLowerCase() : null;
        if (tag === "input" || tag === "textarea" || target?.isContentEditable) {
          return;
        }
        e.preventDefault?.();
        try {
          onTogglePreviewPlayback?.();
        } catch (err) {
          console.error("Shortcut onTogglePreviewPlayback failed", err);
          setErrorText?.("ショートカットの実行に失敗しました。コンソールを確認してください。");
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onTogglePreviewPlayback, setErrorText]);

  // S key for the cut
  useEffect(() => {
    function onCutShortcut(e) {
      if (e.repeat) return;
      if (e.code === "KeyS") {
        const target = e.target;
        const tag = target && target.tagName ? String(target.tagName).toLowerCase() : null;
        if (tag === "input" || tag === "textarea" || target?.isContentEditable) {
          return;
        }
        e.preventDefault?.();

        if (!segmentsLength || isExporting) {
          setErrorText?.("切り取りできる動画が読み込まれていないか、出力中のため操作できません。");
          return;
        }

        try {
          onCut?.();
        } catch (err) {
          console.error("Shortcut onCut failed", err);
          setErrorText?.("ショートカットの実行に失敗しました。コンソールを確認してください。");
        }
      }
      if (e.code === "KeyR") {
        const target = e.target;
        const tag = target && target.tagName ? String(target.tagName).toLowerCase() : null;
        if (tag === "input" || tag === "textarea" || target?.isContentEditable) {
          return;
        }
        e.preventDefault?.();
        try {
          onReturn?.();
        } catch (err) {
          console.error("Shortcut onReturn failed", err);
          setErrorText?.("ショートカットの実行に失敗しました。コンソールを確認してください。");
        }
      }
    }

    window.addEventListener("keydown", onCutShortcut);
    return () => window.removeEventListener("keydown", onCutShortcut);
  }, [segmentsLength, isExporting, onCut, onReturn, setErrorText]);
}
