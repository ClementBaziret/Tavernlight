import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { BookOpen, Dices, LogOut, Settings, Skull, Users } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAnnouncer } from "@/lib/announce";
import { useAuthActions, useMe } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { Button as AriaButton } from "react-aria-components";
import { cx } from "./ui";

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className}>
      <rect width="64" height="64" rx="14" fill="#1b2140" />
      <path d="M24 14h16l-2 6H26z" fill="#e9b949" />
      <rect x="21" y="20" width="22" height="26" rx="5" fill="none" stroke="#e9b949" strokeWidth="4" />
      <path d="M32 26c4 4 5 7 5 9a5 5 0 0 1-10 0c0-2 1-5 5-9z" fill="#f6d17a" />
      <path d="M24 50h16" stroke="#e9b949" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** Screen reader live region fed by `announce()` (dice, turns, damage...). */
export function LiveRegion() {
  const { message, politeness, counter } = useAnnouncer();
  const enabled = useSettings((s) => s.announcements);
  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {enabled && politeness === "polite" ? <span key={counter}>{message}</span> : null}
      </div>
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {enabled && politeness === "assertive" ? <span key={counter}>{message}</span> : null}
      </div>
    </>
  );
}

function NavLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-brand-text/90 hover:bg-white/10 data-[status=active]:bg-white/15 data-[status=active]:text-brand-text"
      activeProps={{ "aria-current": "page" }}
    >
      {children}
    </Link>
  );
}

export function SkipLink() {
  const { t } = useTranslation();
  return (
    <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-[100] rounded-lg bg-lantern px-4 py-2 font-semibold text-[#1d1b16]">
      {t("layout.skip", "Skip to content")}
    </a>
  );
}

export function Layout() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const { logout } = useAuthActions();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const mainRef = useRef<HTMLElement>(null);

  // Move focus to the page on navigation so screen readers start at the top.
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <header className="bg-brand text-brand-text">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2">
          <Link to="/" className="mr-4 inline-flex min-h-11 items-center gap-2 rounded-lg pr-2">
            <Logo className="h-9 w-9" />
            <span className="font-display text-xl font-semibold tracking-wide">Tavernlight</span>
          </Link>
          <nav aria-label={t("layout.mainNav", "Main")} className="flex flex-1 flex-wrap items-center gap-1">
            {me && (
              <NavLink to="/">
                <Users aria-hidden className="h-4 w-4" />
                {t("nav.home", "My table")}
              </NavLink>
            )}
            <NavLink to="/bestiary">
              <Skull aria-hidden className="h-4 w-4" />
              {t("nav.bestiary", "Bestiary")}
            </NavLink>
            <NavLink to="/spells">
              <BookOpen aria-hidden className="h-4 w-4" />
              {t("nav.spells", "Spells")}
            </NavLink>
            <NavLink to="/dice">
              <Dices aria-hidden className="h-4 w-4" />
              {t("nav.dice", "Dice")}
            </NavLink>
            <NavLink to="/settings">
              <Settings aria-hidden className="h-4 w-4" />
              {t("nav.settings", "Settings")}
            </NavLink>
          </nav>
          {me ? (
            <div className="flex items-center gap-2">
              <span className="hidden text-sm sm:inline">{me.displayName}</span>
              <AriaButton
                className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-brand-text hover:bg-white/10"
                onPress={async () => {
                  await logout();
                  void navigate({ to: "/login" });
                }}
              >
                <LogOut aria-hidden className="h-4 w-4" />
                {t("nav.logout", "Log out")}
              </AriaButton>
            </div>
          ) : (
            <Link to="/login" className="inline-flex min-h-11 items-center rounded-lg bg-lantern px-4 font-semibold text-[#1d1b16]">
              {t("nav.login", "Log in")}
            </Link>
          )}
        </div>
      </header>
      <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 outline-none">
        <Outlet />
      </main>
      <Footer />
      <LiveRegion />
    </div>
  );
}

export function Footer({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <footer className={cx("border-t border-line bg-surface", className)}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm text-muted">
        <p>{t("footer.compat", "Tavernlight is compatible with the 5th edition rules (SRD 5.2, CC BY 4.0).")}</p>
        <Link to="/about" className="underline underline-offset-2 hover:text-text">
          {t("footer.about", "Credits, licences and accessibility")}
        </Link>
      </div>
    </footer>
  );
}

/** Bare layout for full-screen views (GM table, players' view). */
export function BareLayout() {
  return (
    <div className="min-h-screen">
      <SkipLink />
      <Outlet />
      <LiveRegion />
    </div>
  );
}
