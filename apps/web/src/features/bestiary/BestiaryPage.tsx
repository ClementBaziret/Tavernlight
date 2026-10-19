import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ABILITIES, ABILITY_NAMES, modifier, type MonsterDef } from "@tavernlight/engine";
import type { MonsterSummary } from "@tavernlight/shared";
import { Alert, Card, PageHeader, Select, Spinner, TextField } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { crLabel, distance, signed, titleCase } from "@/lib/format";
import { useSettings } from "@/lib/settings";

export const MONSTER_TYPES = ["aberration", "beast", "celestial", "construct", "dragon", "elemental", "fey", "fiend", "giant", "humanoid", "monstrosity", "ooze", "plant", "undead", "swarm"];
export const SIZES = ["tiny", "small", "medium", "large", "huge", "gargantuan"];
const CRS = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)];

export function useMonsterSearch(filters: { search: string; type: string; size: string; crMin: string; crMax: string }) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v && v !== "any") params.set(k, v);
  return useQuery({ queryKey: ["monsters", params.toString()], queryFn: () => api.get<MonsterSummary[]>(`/rules/monsters?${params}`), staleTime: Infinity });
}

export function MonsterFilters({ value, onChange }: { value: { search: string; type: string; size: string; crMin: string; crMax: string }; onChange: (v: { search: string; type: string; size: string; crMin: string; crMax: string }) => void }) {
  const { t } = useTranslation();
  const crOptions = [{ id: "any", label: t("bestiary.any", "Any") }, ...CRS.map((c) => ({ id: String(c), label: crLabel(c) }))];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <TextField label={t("bestiary.search", "Search")} value={value.search} onChange={(search) => onChange({ ...value, search })} placeholder={t("bestiary.searchPh", "Goblin, dragon…")} />
      <Select label={t("bestiary.type", "Type")} value={value.type} onChange={(type) => onChange({ ...value, type })} options={[{ id: "any", label: t("bestiary.any", "Any") }, ...MONSTER_TYPES.map((x) => ({ id: x, label: titleCase(x) }))]} />
      <Select label={t("bestiary.size", "Size")} value={value.size} onChange={(size) => onChange({ ...value, size })} options={[{ id: "any", label: t("bestiary.any", "Any") }, ...SIZES.map((x) => ({ id: x, label: titleCase(x) }))]} />
      <Select label={t("bestiary.crMin", "Minimum CR")} value={value.crMin} onChange={(crMin) => onChange({ ...value, crMin })} options={crOptions} />
      <Select label={t("bestiary.crMax", "Maximum CR")} value={value.crMax} onChange={(crMax) => onChange({ ...value, crMax })} options={crOptions} />
    </div>
  );
}

export function BestiaryPage() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState({ search: "", type: "any", size: "any", crMin: "any", crMax: "any" });
  const monsters = useMonsterSearch(filters);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("bestiary.title", "Bestiary")} subtitle={t("bestiary.subtitle", "Every creature of the SRD 5.2, searchable and filterable.")} />
      <Card>
        <MonsterFilters value={filters} onChange={setFilters} />
      </Card>
      {monsters.isLoading ? (
        <Spinner />
      ) : monsters.error ? (
        <Alert tone="danger">{errorMessage(monsters.error)}</Alert>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[36rem] text-left">
            <caption className="p-3 text-left text-sm text-muted">{t("bestiary.count", "{{n}} creatures", { n: monsters.data?.length ?? 0 })}</caption>
            <thead>
              <tr className="border-b border-line text-sm text-muted">
                <th scope="col" className="px-3 py-2">{t("bestiary.name", "Name")}</th>
                <th scope="col">{t("bestiary.type", "Type")}</th>
                <th scope="col">{t("bestiary.size", "Size")}</th>
                <th scope="col">{t("bestiary.cr", "CR")}</th>
                <th scope="col">{t("common.ac", "AC")}</th>
                <th scope="col">{t("common.hp", "HP")}</th>
              </tr>
            </thead>
            <tbody>
              {monsters.data?.map((m) => (
                <tr key={m.key} className="border-b border-line hover:bg-surface-2">
                  <th scope="row" className="px-3 py-2 font-medium">
                    <Link to="/bestiary/$key" params={{ key: m.key }} className="underline-offset-2 hover:underline">
                      {m.name}
                    </Link>
                  </th>
                  <td>{titleCase(m.type)}</td>
                  <td>{titleCase(m.size)}</td>
                  <td>{crLabel(m.cr)}</td>
                  <td>{m.ac}</td>
                  <td>{m.hp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function StatBlock({ m }: { m: MonsterDef }) {
  const { t } = useTranslation();
  const units = useSettings((s) => s.units);
  return (
    <article aria-labelledby={`monster-${m.key}`} className="flex flex-col gap-3">
      <header>
        <h2 id={`monster-${m.key}`} className="font-display text-2xl font-semibold">
          {m.name}
        </h2>
        <p className="italic text-muted">
          {titleCase(m.size)} {m.type}, {m.alignment}
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [t("common.ac", "AC"), `${m.ac}${m.acNote ? ` (${m.acNote})` : ""}`],
          [t("common.hp", "HP"), `${m.hp} (${m.hitDice})`],
          [t("sheet.speed", "Speed"), Object.entries(m.speed).map(([k, v]) => `${k === "walk" ? "" : `${k} `}${distance(v, units)}`).join(", ")],
          [t("bestiary.cr", "CR"), `${crLabel(m.cr)} (${m.xp} XP)`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-surface-2 p-2">
            <dt className="text-sm text-muted">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <table className="w-full text-center">
        <caption className="sr-only">{t("sheet.abilities", "Abilities")}</caption>
        <thead>
          <tr>
            {ABILITIES.map((a) => (
              <th key={a} scope="col" className="text-sm text-muted">
                <abbr title={ABILITY_NAMES[a]}>{a.toUpperCase()}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {ABILITIES.map((a) => (
              <td key={a}>
                {m.abilities[a]} ({signed(modifier(m.abilities[a]))})
                {m.saves[a] !== undefined && <span className="block text-xs text-muted">save {signed(m.saves[a]!)}</span>}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <dl className="flex flex-col gap-1 text-sm">
        {Object.keys(m.skills).length > 0 && (
          <div>
            <dt className="inline font-semibold">{t("sheet.skills", "Skills")}: </dt>
            <dd className="inline">{Object.entries(m.skills).map(([k, v]) => `${titleCase(k)} ${signed(v)}`).join(", ")}</dd>
          </div>
        )}
        {m.resistances.length > 0 && (
          <div>
            <dt className="inline font-semibold">{t("sheet.resistances", "Resistances")}: </dt>
            <dd className="inline">{m.resistances.join(", ")}</dd>
          </div>
        )}
        {m.vulnerabilities.length > 0 && (
          <div>
            <dt className="inline font-semibold">{t("bestiary.vulnerabilities", "Vulnerabilities")}: </dt>
            <dd className="inline">{m.vulnerabilities.join(", ")}</dd>
          </div>
        )}
        {m.immunities.length + m.conditionImmunities.length > 0 && (
          <div>
            <dt className="inline font-semibold">{t("bestiary.immunities", "Immunities")}: </dt>
            <dd className="inline">{[...m.immunities, ...m.conditionImmunities].join(", ")}</dd>
          </div>
        )}
        <div>
          <dt className="inline font-semibold">{t("sheet.senses", "Senses")}: </dt>
          <dd className="inline">
            {Object.entries(m.senses).map(([k, v]) => `${k} ${distance(v, units)}`).join(", ")}
            {Object.keys(m.senses).length ? ", " : ""}
            {t("sheet.passive", "Passive Perception")} {m.passivePerception}
          </dd>
        </div>
        <div>
          <dt className="inline font-semibold">{t("bestiary.languages", "Languages")}: </dt>
          <dd className="inline">{m.languages || "—"}</dd>
        </div>
      </dl>
      {m.traits.length > 0 && (
        <section>
          <h3 className="font-display text-lg font-semibold">{t("bestiary.traits", "Traits")}</h3>
          {m.traits.map((tr) => (
            <p key={tr.name} className="mt-1 text-sm">
              <strong>{tr.name}.</strong> {tr.description}
            </p>
          ))}
        </section>
      )}
      {(["action", "bonus", "reaction", "legendary"] as const).map((kind) => {
        const list = m.actionTexts.filter((a) => a.kind === kind);
        if (!list.length) return null;
        const titles = { action: t("bestiary.actions", "Actions"), bonus: t("bestiary.bonus", "Bonus actions"), reaction: t("bestiary.reactions", "Reactions"), legendary: t("bestiary.legendary", "Legendary actions") };
        return (
          <section key={kind}>
            <h3 className="font-display text-lg font-semibold">{titles[kind]}</h3>
            {list.map((a) => (
              <p key={a.name} className="mt-1 text-sm">
                <strong>{a.name}.</strong> {a.description}
              </p>
            ))}
          </section>
        );
      })}
    </article>
  );
}

export function MonsterPage() {
  const { t } = useTranslation();
  const { key } = useParams({ strict: false }) as { key: string };
  const monster = useQuery({ queryKey: ["monster", key], queryFn: () => api.get<MonsterDef>(`/rules/monsters/${key}`), staleTime: Infinity });
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link to="/bestiary" className="self-start text-sm underline">
        ← {t("bestiary.back", "Back to the bestiary")}
      </Link>
      {monster.isLoading ? <Spinner /> : monster.error ? <Alert tone="danger">{errorMessage(monster.error)}</Alert> : monster.data && <Card><StatBlock m={monster.data} /></Card>}
    </div>
  );
}
