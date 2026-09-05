import { useCallback, useEffect, useState } from "react";
import ja from "../locales/ja.json";
import en from "../locales/en.json";

const STORAGE_KEY = "videoEditor.language";
const translations = { ja, en };

export default function useLanguage() {
  const [language, setLanguage] = useState(() => {
    if (typeof window === "undefined") return "ja";
    return window.localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "ja";
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback((key, ...values) => {
    const template = translations[language][key] || translations.ja[key] || key;
    return values.reduce((result, value, index) => result.replaceAll(`{${index}}`, String(value)), template);
  }, [language]);

  return { language, setLanguage, t };
}
