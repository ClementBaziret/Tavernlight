import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { RulesVersion } from "@tavernlight/engine";
import { Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";

export function AboutPage() {
  const { t } = useTranslation();
  const version = useQuery({ queryKey: ["rules-version"], queryFn: () => api.get<RulesVersion>("/rules/version") });
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title={t("about.title", "Credits, licences and accessibility")} />
      <Card aria-labelledby="srd-title">
        <h2 id="srd-title" className="font-display text-xl font-semibold">
          {t("about.srd", "Rules content")}
        </h2>
        <p className="mt-2">{t("about.compat", "Tavernlight is compatible with the 5th edition. It is not affiliated with, endorsed or sponsored by Wizards of the Coast.")}</p>
        <p className="mt-2 rounded-lg bg-surface-2 p-3 text-sm">{version.data?.attribution ?? "This work includes material from the System Reference Document 5.2 (\"SRD 5.2\") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode."}</p>
        {version.data && (
          <p className="mt-2 text-sm text-muted">
            {t("about.dataset", "Dataset: {{source}}, version {{v}}, imported on {{d}}.", { source: version.data.source, v: version.data.sourceVersion, d: new Date(version.data.importedAt).toLocaleDateString() })}
          </p>
        )}
      </Card>
      <Card aria-labelledby="credits-title">
        <h2 id="credits-title" className="font-display text-xl font-semibold">
          {t("about.credits", "Visual credits")}
        </h2>
        <ul className="mt-2 list-disc pl-5">
          <li>{t("about.logo", "Tavernlight logo, map tiles, decor and tokens: drawn by the Tavernlight team (vector shapes).")}</li>
          <li>{t("about.icons", "Interface icons: Lucide (ISC licence), lucide.dev.")}</li>
          <li>{t("about.data", "Structured SRD data: 5e-bits/5e-database (MIT licence for the code, SRD content under CC BY 4.0).")}</li>
        </ul>
      </Card>
      <Card aria-labelledby="a11y-statement">
        <h2 id="a11y-statement" className="font-display text-xl font-semibold">
          {t("about.a11y", "Accessibility features")}
        </h2>
        <ul className="mt-2 list-disc pl-5">
          <li>{t("about.a11y1", "Everything works with the keyboard: sheets, dice, combat and token movement (arrow keys on the map).")}</li>
          <li>{t("about.a11y2", "Every map has a text view: visible tokens, positions, distances and revealed areas.")}</li>
          <li>{t("about.a11y3", "Turns, rolls and damage are announced to screen readers.")}</li>
          <li>{t("about.a11y4", "Health and sides are never shown by color only: text and shapes accompany them.")}</li>
          <li>{t("about.a11y5", "Animations can be turned off; text can be enlarged; the layout supports 200% zoom.")}</li>
        </ul>
      </Card>
    </div>
  );
}
