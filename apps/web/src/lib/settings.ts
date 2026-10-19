import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "system" | "light" | "dark";
export type Units = "feet" | "meters";

interface Settings {
  theme: Theme;
  reduceMotion: boolean;
  largeText: boolean;
  units: Units;
  /** Announce game events with the screen reader live region. */
  announcements: boolean;
  set: (patch: Partial<Omit<Settings, "set">>) => void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      theme: "system",
      reduceMotion: false,
      largeText: false,
      units: "feet",
      announcements: true,
      set: (patch) => set(patch),
    }),
    { name: "tavernlight-settings" },
  ),
);

/** Applies theme / motion / text size classes on <html>. */
export function applySettings(s: Pick<Settings, "theme" | "reduceMotion" | "largeText">) {
  const root = document.documentElement;
  const dark = s.theme === "dark" || (s.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  root.classList.toggle("reduce-motion", s.reduceMotion);
  root.classList.toggle("text-large", s.largeText);
}

export function prefersReducedMotion(): boolean {
  return useSettings.getState().reduceMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
