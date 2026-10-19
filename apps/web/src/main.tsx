import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider as AriaRouterProvider } from "react-aria-components";
import "./i18n";
import { applySettings, useSettings } from "./lib/settings";
import { router } from "./router";
import "./styles/app.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function SettingsEffects() {
  const theme = useSettings((s) => s.theme);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const largeText = useSettings((s) => s.largeText);
  useEffect(() => {
    applySettings({ theme, reduceMotion, largeText });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => applySettings({ theme, reduceMotion, largeText });
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [theme, reduceMotion, largeText]);
  return null;
}

function App() {
  return (
    <AriaRouterProvider navigate={(to) => void router.navigate({ to: String(to) })} useHref={(to) => String(to)}>
      <SettingsEffects />
      <RouterProvider router={router} />
    </AriaRouterProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
