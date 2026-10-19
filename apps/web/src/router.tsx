import { createRootRoute, createRoute, createRouter, Navigate, Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BareLayout, Layout } from "@/components/Layout";
import { Spinner } from "@/components/ui";
import { useMe } from "@/lib/auth";
import { AboutPage } from "@/features/about/AboutPage";
import { LoginPage, RegisterPage } from "@/features/auth/AuthPages";
import { BestiaryPage, MonsterPage } from "@/features/bestiary/BestiaryPage";
import { CampaignPage } from "@/features/campaign/CampaignPage";
import { JoinPage } from "@/features/campaign/JoinPage";
import { CharacterSheetPage } from "@/features/character/CharacterSheetPage";
import { CharacterWizardPage } from "@/features/character/CharacterWizard";
import { DicePage } from "@/features/dice/DicePage";
import { HomePage } from "@/features/home/HomePage";
import { MapEditorPage } from "@/features/maps/MapEditorPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { SpellsPage } from "@/features/spells/SpellsPage";
import { GmTablePage } from "@/features/table/GmTablePage";
import { PlayersViewPage } from "@/features/table/PlayersViewPage";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <Spinner />;
  if (!me) return <Navigate to="/login" search={{ redirect: window.location.pathname }} />;
  return <>{children}</>;
}

const rootRoute = createRootRoute({ component: Outlet });
const mainLayout = createRoute({ getParentRoute: () => rootRoute, id: "main", component: Layout });
const bareLayout = createRoute({ getParentRoute: () => rootRoute, id: "bare", component: BareLayout });

const authed = (Component: () => ReactNode) => () => (
  <RequireAuth>
    <Component />
  </RequireAuth>
);

const routes = [
  createRoute({ getParentRoute: () => mainLayout, path: "/", component: HomePage }),
  createRoute({ getParentRoute: () => mainLayout, path: "/login", component: LoginPage, validateSearch: (s: Record<string, unknown>): { redirect?: string } => (typeof s.redirect === "string" ? { redirect: s.redirect } : {}) }),
  createRoute({ getParentRoute: () => mainLayout, path: "/register", component: RegisterPage }),
  createRoute({ getParentRoute: () => mainLayout, path: "/join/$code", component: authed(JoinPage) }),
  createRoute({ getParentRoute: () => mainLayout, path: "/characters/new", component: authed(CharacterWizardPage) }),
  createRoute({ getParentRoute: () => mainLayout, path: "/characters/$id", component: authed(CharacterSheetPage) }),
  createRoute({ getParentRoute: () => mainLayout, path: "/campaigns/$id", component: authed(CampaignPage), validateSearch: (s: Record<string, unknown>): { tab?: string } => (typeof s.tab === "string" ? { tab: s.tab } : {}) }),
  createRoute({ getParentRoute: () => mainLayout, path: "/campaigns/$id/maps/$mapId", component: authed(MapEditorPage) }),
  createRoute({ getParentRoute: () => mainLayout, path: "/bestiary", component: BestiaryPage }),
  createRoute({ getParentRoute: () => mainLayout, path: "/bestiary/$key", component: MonsterPage }),
  createRoute({ getParentRoute: () => mainLayout, path: "/spells", component: SpellsPage }),
  createRoute({ getParentRoute: () => mainLayout, path: "/dice", component: DicePage }),
  createRoute({ getParentRoute: () => mainLayout, path: "/settings", component: SettingsPage }),
  createRoute({ getParentRoute: () => mainLayout, path: "/about", component: AboutPage }),
];
const bareRoutes = [
  createRoute({ getParentRoute: () => bareLayout, path: "/campaigns/$id/table", component: authed(GmTablePage) }),
  createRoute({ getParentRoute: () => bareLayout, path: "/campaigns/$id/players", component: authed(PlayersViewPage) }),
];

const routeTree = rootRoute.addChildren([mainLayout.addChildren(routes), bareLayout.addChildren(bareRoutes)]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
