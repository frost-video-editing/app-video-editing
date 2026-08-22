/**
 * Shortcut keys management utility
 */

const DEFAULT_SHORTCUTS = {
  playPause: { key: " ", code: "Space", label: "Space" },
  cut: { key: "s", code: "KeyS", label: "S" },
  copy: { key: "c", code: "KeyC", label: "C" },
  paste: { key: "v", code: "KeyV", label: "V" },
  delete: { key: "d", code: "KeyD", label: "D" },
  undo: { key: "r", code: "KeyR", label: "R" },
  crop: { key: "q", code: "KeyQ", label: "Q" },
  export: { key: "e", code: "KeyE", label: "E" }
};

const SHORTCUT_DESCRIPTIONS = {
  playPause: "再生/停止",
  cut: "カット",
  copy: "コピー",
  paste: "貼る",
  delete: "削除",
  undo: "戻す",
  crop: "crop",
  export: "動画出力"
};

export function getDefaultShortcuts() {
  return { ...DEFAULT_SHORTCUTS };
}

export function getShortcutDescription(shortcutName) {
  return SHORTCUT_DESCRIPTIONS[shortcutName] || shortcutName;
}

export function getAllShortcutNames() {
  return Object.keys(DEFAULT_SHORTCUTS);
}

export function loadShortcuts() {
  try {
    const saved = localStorage.getItem("videoEditor.shortcuts");
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_SHORTCUTS, ...parsed };
    }
  } catch (e) {
    console.error("Failed to load shortcuts:", e);
  }
  return { ...DEFAULT_SHORTCUTS };
}

export function saveShortcuts(shortcuts) {
  try {
    localStorage.setItem("videoEditor.shortcuts", JSON.stringify(shortcuts));
    window.dispatchEvent(new CustomEvent("videoEditor.shortcutsChanged"));
    return true;
  } catch (e) {
    console.error("Failed to save shortcuts:", e);
    return false;
  }
}

export function isValidKeyPress(event) {
  // Ignore modifier-only presses
  if (["Shift", "Control", "Alt", "Meta", "AltGraph"].includes(event.key)) {
    return false;
  }
  return true;
}

export function getKeyLabel(event) {
  const labels = {
    " ": "Space",
    "Enter": "Enter",
    "Escape": "Esc",
    "Tab": "Tab",
    "Backspace": "Backspace",
    "Delete": "Delete",
    "ArrowUp": "↑",
    "ArrowDown": "↓",
    "ArrowLeft": "←",
    "ArrowRight": "→"
  };

  if (labels[event.key]) {
    return labels[event.key];
  }

  if (event.key.length === 1) {
    return event.key.toUpperCase();
  }

  return event.code?.replace("Key", "").replace("Digit", "") || event.key;
}

export function getKeyCode(event) {
  return event.code || event.key;
}

export function detectKeyConflicts(shortcuts) {
  const keyMap = new Map();
  const conflicts = [];

  Object.entries(shortcuts).forEach(([name, config]) => {
    const key = config.code || config.key;
    if (keyMap.has(key)) {
      conflicts.push({
        key,
        actions: [keyMap.get(key), name]
      });
    } else {
      keyMap.set(key, name);
    }
  });

  return conflicts;
}
