import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import fr from "./fr.json";

/*
 * English strings are written in the code as default values:
 * t("sheet.hp", "Hit points"). Other languages are flat key → text files.
 */
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: {} }, fr: { translation: fr } },
    fallbackLng: "en",
    supportedLngs: ["en", "fr"],
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
    detection: { order: ["localStorage", "navigator"], caches: ["localStorage"], lookupLocalStorage: "tavernlight-lang" },
  });

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});
document.documentElement.lang = i18n.language?.startsWith("fr") ? "fr" : "en";

export default i18n;
