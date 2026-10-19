import { useColorScheme } from "react-native";

/** Same palette as the web app; contrasts checked for WCAG AA. */
const light = {
  bg: "#f7f2e7",
  surface: "#ffffff",
  surface2: "#efe7d6",
  text: "#1d1b16",
  muted: "#5b5446",
  border: "#8c8270",
  line: "#d8ccb4",
  brand: "#1b2140",
  brandText: "#ffffff",
  accent: "#8a5a00",
  lantern: "#e9b949",
  danger: "#b3261e",
  success: "#1a6b2f",
};

const dark: typeof light = {
  bg: "#11131f",
  surface: "#1a1d2e",
  surface2: "#242840",
  text: "#f0ebe0",
  muted: "#bdb5a4",
  border: "#8d8778",
  line: "#353a55",
  brand: "#f0c55d",
  brandText: "#11131f",
  accent: "#f0c55d",
  lantern: "#f0c55d",
  danger: "#ff8a80",
  success: "#7fdc96",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}

/** Minimum touch target (Android guideline: 48dp). */
export const TOUCH = 48;
