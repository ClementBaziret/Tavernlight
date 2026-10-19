import { useTranslation } from "react-i18next";
import { Card, PageHeader, RadioGroup, Switch } from "@/components/ui";
import { useSettings } from "@/lib/settings";

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const s = useSettings();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader title={t("settings.title", "Settings")} subtitle={t("settings.subtitle", "Saved in this browser.")} />
      <Card className="flex flex-col gap-4">
        <RadioGroup
          label={t("settings.language", "Language")}
          orientation="horizontal"
          value={i18n.language.startsWith("fr") ? "fr" : "en"}
          onChange={(v) => void i18n.changeLanguage(v)}
          options={[
            { id: "en", label: "English" },
            { id: "fr", label: "Français" },
          ]}
        />
        <RadioGroup
          label={t("settings.theme", "Theme")}
          orientation="horizontal"
          value={s.theme}
          onChange={(v) => s.set({ theme: v as typeof s.theme })}
          options={[
            { id: "system", label: t("settings.system", "Like my system") },
            { id: "light", label: t("settings.light", "Light") },
            { id: "dark", label: t("settings.dark", "Dark") },
          ]}
        />
        <RadioGroup
          label={t("settings.units", "Distances")}
          orientation="horizontal"
          value={s.units}
          onChange={(v) => s.set({ units: v as typeof s.units })}
          options={[
            { id: "feet", label: t("settings.feet", "Feet (5 ft per square)") },
            { id: "meters", label: t("settings.meters", "Meters (1.5 m per square)") },
          ]}
        />
      </Card>
      <Card className="flex flex-col gap-2" aria-labelledby="a11y-title">
        <h2 id="a11y-title" className="font-display text-xl font-semibold">
          {t("settings.accessibility", "Accessibility")}
        </h2>
        <Switch isSelected={s.reduceMotion} onChange={(v) => s.set({ reduceMotion: v })}>
          {t("settings.reduceMotion", "Turn off animations (dice, transitions)")}
        </Switch>
        <Switch isSelected={s.largeText} onChange={(v) => s.set({ largeText: v })}>
          {t("settings.largeText", "Larger text")}
        </Switch>
        <Switch isSelected={s.announcements} onChange={(v) => s.set({ announcements: v })}>
          {t("settings.announcements", "Announce game events to screen readers (turns, rolls, damage)")}
        </Switch>
      </Card>
    </div>
  );
}
