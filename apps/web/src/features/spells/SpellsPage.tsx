import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, PageHeader, Select, Spinner, TextField } from "@/components/ui";
import { useRules } from "@/lib/rules";

export function SpellsPage() {
  const { t } = useTranslation();
  const { data: rules, isLoading } = useRules(["spells", "classes"]);
  const [search, setSearch] = useState("");
  const [cls, setCls] = useState("any");
  const [level, setLevel] = useState("any");
  if (isLoading || !rules) return <Spinner />;
  const spells = (rules.data.spells ?? []).filter(
    (s) => (!search || s.name.toLowerCase().includes(search.toLowerCase())) && (cls === "any" || s.classes.includes(cls)) && (level === "any" || s.level === Number(level)),
  );
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("spells.title", "Spells")} subtitle={t("spells.subtitle", "The spells of the SRD 5.2.")} />
      <Card className="grid gap-3 sm:grid-cols-3">
        <TextField label={t("bestiary.search", "Search")} value={search} onChange={setSearch} />
        <Select label={t("spells.class", "Class")} value={cls} onChange={setCls} options={[{ id: "any", label: t("bestiary.any", "Any") }, ...(rules.data.classes ?? []).filter((c) => c.spellcasting).map((c) => ({ id: c.key, label: c.name }))]} />
        <Select label={t("common.level", "Level")} value={level} onChange={setLevel} options={[{ id: "any", label: t("bestiary.any", "Any") }, ...Array.from({ length: 10 }, (_, i) => ({ id: String(i), label: i === 0 ? t("sheet.cantrip", "cantrip") : String(i) }))]} />
      </Card>
      <p role="status" className="text-sm text-muted">
        {t("spells.count", "{{n}} spells", { n: spells.length })}
      </p>
      <ul className="flex flex-col gap-2">
        {spells.slice(0, 200).map((s) => (
          <li key={s.key}>
            <details className="rounded-xl border border-line bg-surface px-4 py-3">
              <summary className="cursor-pointer">
                <span className="font-semibold">{s.name}</span>
                <span className="ml-2 text-sm text-muted">
                  {s.level === 0 ? t("sheet.cantrip", "cantrip") : `${t("common.level", "level")} ${s.level}`} · {s.school} · {s.classes.join(", ")}
                  {s.concentration ? ` · ${t("spells.concentration", "concentration")}` : ""}
                  {s.ritual ? ` · ${t("spells.ritual", "ritual")}` : ""}
                  {s.action ? ` · ${t("spells.automated", "automated")}` : ""}
                </span>
              </summary>
              <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-muted">{t("spells.castingTime", "Casting time")}</dt>
                  <dd>{s.castingTime}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t("spells.range", "Range")}</dt>
                  <dd>{s.range}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t("spells.components", "Components")}</dt>
                  <dd>
                    {s.components.join(", ")}
                    {s.material ? ` (${s.material})` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">{t("spells.duration", "Duration")}</dt>
                  <dd>{s.duration}</dd>
                </div>
              </dl>
              <p className="mt-2 whitespace-pre-line">{s.description}</p>
              {s.higherLevel && <p className="mt-2 text-muted">{s.higherLevel}</p>}
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
