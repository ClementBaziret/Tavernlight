import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, Check, ChevronLeft, ChevronRight, Dices } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ABILITIES,
  ABILITY_NAMES,
  POINT_BUY_BUDGET,
  POINT_BUY_COSTS,
  STANDARD_ARRAY,
  abilityScores,
  collectChoices,
  derive,
  emptyState,
  initialState,
  modifier,
  pointBuyCost,
  stepOf,
  validateBuild,
  type Ability,
  type BuildStep,
  type CharacterBuild,
  type RulesIndex,
} from "@tavernlight/engine";
import type { CharacterDto } from "@tavernlight/shared";
import { Alert, Badge, Button, Card, cx, NumberField, PageHeader, RadioGroup, Select, Spinner, TextField } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { announce } from "@/lib/announce";
import { signed } from "@/lib/format";
import { useRules } from "@/lib/rules";
import { ChoicePicker, MultiPick } from "./ChoicePicker";

const STEPS: { id: BuildStep | "review"; label: string }[] = [
  { id: "species", label: "Species" },
  { id: "class", label: "Class" },
  { id: "background", label: "Background" },
  { id: "abilities", label: "Ability scores" },
  { id: "skills", label: "Skills & features" },
  { id: "equipment", label: "Equipment" },
  { id: "spells", label: "Spells" },
  { id: "review", label: "Review" },
];

function emptyBuild(): CharacterBuild {
  return {
    name: "",
    species: "",
    background: "",
    class: "",
    level: 1,
    abilityMethod: "standardArray",
    baseAbilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    backgroundBoost: {},
    classSkills: [],
    choices: {},
    equipment: {},
    cantrips: [],
    preparedSpells: [],
    levels: [],
  };
}

function withoutChoices(choices: Record<string, string[]>, prefix: string) {
  return Object.fromEntries(Object.entries(choices).filter(([k]) => !k.startsWith(prefix)));
}

// --- Steps ------------------------------------------------------------------------

function SpeciesStep({ build, set, rules }: StepProps) {
  const { t } = useTranslation();
  const species = rules.species(build.species);
  const choices = collectChoices(build, rules).filter((c) => c.id.startsWith("species:") || c.id.startsWith("lineage:"));
  const derived = build.species ? derive(build, emptyState(), rules) : null;
  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        label={t("wizard.chooseSpecies", "Choose a species")}
        value={build.species}
        onChange={(v) => set({ species: v, lineage: undefined, size: rules.species(v)?.sizes[0], choices: withoutChoices(withoutChoices(build.choices, "species:"), "lineage:") })}
        options={(rules.data.species ?? []).map((s) => ({
          id: s.key,
          label: s.name,
          description: `${t("wizard.speed", "Speed")} ${s.speed} ft · ${s.features.map((f) => f.name).join(", ")}`,
        }))}
        className="[&>div]:grid [&>div]:gap-2 [&>div]:sm:grid-cols-2"
      />
      {species && species.lineages.length > 0 && (
        <Select
          label={species.lineageLabel ?? t("wizard.lineage", "Lineage")}
          value={build.lineage ?? null}
          onChange={(v) => set({ lineage: v, choices: withoutChoices(build.choices, "lineage:") })}
          options={species.lineages.map((l) => ({ id: l.key, label: l.name }))}
        />
      )}
      {species && species.sizes.length > 1 && (
        <RadioGroup
          label={t("wizard.size", "Size")}
          orientation="horizontal"
          value={build.size ?? species.sizes[0]}
          onChange={(v) => set({ size: v as CharacterBuild["size"] })}
          options={species.sizes.map((s) => ({ id: s, label: s[0].toUpperCase() + s.slice(1) }))}
        />
      )}
      {choices.map((c) => (
        <ChoicePicker key={c.id} scoped={c} rules={rules} derived={derived} selected={build.choices[c.id] ?? []} onChange={(v) => set({ choices: { ...build.choices, [c.id]: v } })} />
      ))}
      {species && (
        <Card>
          <h3 className="font-display text-lg font-semibold">{species.name}</h3>
          <dl className="mt-2 flex flex-col gap-2">
            {[...species.features, ...(species.lineages.find((l) => l.key === build.lineage)?.features ?? [])].map((f) => (
              <div key={f.key}>
                <dt className="font-semibold">{f.name}</dt>
                <dd className="whitespace-pre-line text-sm text-muted">{f.description}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
    </div>
  );
}

function ClassStep({ build, set, rules }: StepProps) {
  const { t } = useTranslation();
  const cls = rules.class(build.class);
  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        label={t("wizard.chooseClass", "Choose a class")}
        value={build.class}
        onChange={(v) =>
          set({
            class: v,
            subclass: undefined,
            classSkills: [],
            cantrips: [],
            preparedSpells: [],
            equipment: { ...build.equipment, class: undefined },
            choices: withoutChoices(withoutChoices(build.choices, "class:"), "subclass:"),
          })
        }
        options={(rules.data.classes ?? []).map((c) => ({
          id: c.key,
          label: c.name,
          description: `d${c.hitDie} · ${c.primaryAbilities.map((a) => ABILITY_NAMES[a]).join(" / ")}${c.spellcasting ? ` · ${t("wizard.caster", "spellcaster")}` : ""}`,
        }))}
        className="[&>div]:grid [&>div]:gap-2 [&>div]:sm:grid-cols-2 [&>div]:lg:grid-cols-3"
      />
      {cls && (
        <Card>
          <h3 className="font-display text-lg font-semibold">{cls.name}</h3>
          <p className="text-sm text-muted">
            {t("wizard.hitDie", "Hit die")}: d{cls.hitDie} · {t("wizard.saves", "Saving throws")}: {cls.savingThrows.map((a) => ABILITY_NAMES[a]).join(", ")}
          </p>
          <h4 className="mt-3 font-semibold">{t("wizard.level1Features", "Level 1 features")}</h4>
          <dl className="mt-1 flex flex-col gap-2">
            {cls.features
              .filter((f) => f.level === 1)
              .map((f) => (
                <div key={f.key}>
                  <dt className="font-semibold">{f.name}</dt>
                  <dd className="line-clamp-4 whitespace-pre-line text-sm text-muted">{f.description}</dd>
                </div>
              ))}
          </dl>
        </Card>
      )}
    </div>
  );
}

function BackgroundStep({ build, set, rules }: StepProps) {
  const { t } = useTranslation();
  const bg = rules.background(build.background);
  const values = Object.values(build.backgroundBoost).filter(Boolean);
  const mode = values.length === 3 ? "three" : "two";
  const plus2 = (Object.entries(build.backgroundBoost).find(([, v]) => v === 2)?.[0] ?? null) as Ability | null;
  const plus1 = (Object.entries(build.backgroundBoost).find(([, v]) => v === 1)?.[0] ?? null) as Ability | null;
  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        label={t("wizard.chooseBackground", "Choose a background")}
        value={build.background}
        onChange={(v) => set({ background: v, backgroundBoost: {}, equipment: { ...build.equipment, background: undefined }, choices: withoutChoices(build.choices, "background:") })}
        options={(rules.data.backgrounds ?? []).map((b) => ({
          id: b.key,
          label: b.name,
          description: `${b.abilities.map((a) => a.toUpperCase()).join(", ")} · ${rules.feat(b.feat)?.name ?? b.feat}${b.featOption ? ` (${b.featOption})` : ""} · ${b.skills.map((s) => rules.skill(s)?.name ?? s).join(", ")}`,
        }))}
        className="[&>div]:grid [&>div]:gap-2 [&>div]:sm:grid-cols-2"
      />
      {bg && (
        <Card className="flex flex-col gap-3">
          <h3 className="font-display text-lg font-semibold">{t("wizard.boost", "Ability score increase")}</h3>
          <RadioGroup
            label={t("wizard.boostMode", "Distribution")}
            orientation="horizontal"
            value={mode}
            onChange={(v) => set({ backgroundBoost: v === "three" ? Object.fromEntries(bg.abilities.map((a) => [a, 1])) : {} })}
            options={[
              { id: "two", label: "+2 / +1" },
              { id: "three", label: "+1 / +1 / +1" },
            ]}
          />
          {mode === "two" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label={t("wizard.plus2", "+2 to")}
                value={plus2}
                onChange={(v) => set({ backgroundBoost: { [v]: 2, ...(plus1 && plus1 !== v ? { [plus1]: 1 } : {}) } })}
                options={bg.abilities.map((a) => ({ id: a, label: ABILITY_NAMES[a] }))}
              />
              <Select
                label={t("wizard.plus1", "+1 to")}
                value={plus1}
                onChange={(v) => set({ backgroundBoost: { ...(plus2 && plus2 !== v ? { [plus2]: 2 } : {}), [v]: 1 } })}
                options={bg.abilities.map((a) => ({ id: a, label: ABILITY_NAMES[a], disabled: a === plus2 }))}
              />
            </div>
          )}
          <p className="text-sm text-muted">
            {t("wizard.originFeat", "Origin feat")}: <strong>{rules.feat(bg.feat)?.name}</strong> — {rules.feat(bg.feat)?.description.split("\n")[0]}
          </p>
        </Card>
      )}
    </div>
  );
}

function AbilitiesStep({ build, set, rules, rollToken, setRollToken }: StepProps) {
  const { t } = useTranslation();
  const [rolling, setRolling] = useState(false);
  const [rollError, setRollError] = useState<string | null>(null);
  const cost = pointBuyCost(build.baseAbilities);
  const final = build.class && build.species && build.background ? abilityScores(build, rules) : null;
  const pool = build.abilityMethod === "standardArray" ? STANDARD_ARRAY : build.rolledScores ?? [];

  const setMethod = (m: string) => {
    if (m === "pointBuy") set({ abilityMethod: "pointBuy", baseAbilities: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } });
    else if (m === "standardArray") set({ abilityMethod: "standardArray", baseAbilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 } });
    else set({ abilityMethod: "rolled", baseAbilities: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }, rolledScores: undefined });
  };

  const roll = async () => {
    setRolling(true);
    setRollError(null);
    try {
      const r = await api.post<{ token: string; scores: number[]; details: number[][] }>("/characters/roll-abilities");
      setRollToken(r.token);
      set({ rolledScores: r.scores, baseAbilities: Object.fromEntries(ABILITIES.map((a, i) => [a, r.scores[i]])) as CharacterBuild["baseAbilities"] });
      announce(t("wizard.rolledAnnounce", "Rolled: {{scores}}", { scores: r.scores.join(", ") }));
    } catch (e) {
      setRollError(errorMessage(e));
    } finally {
      setRolling(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        label={t("wizard.method", "Method")}
        orientation="horizontal"
        value={build.abilityMethod}
        onChange={setMethod}
        options={[
          { id: "standardArray", label: t("wizard.standard", "Standard array"), description: STANDARD_ARRAY.join(", ") },
          { id: "pointBuy", label: t("wizard.pointBuy", "Point buy"), description: t("wizard.pointBuyHelp", "{{n}} points, scores 8 to 15", { n: POINT_BUY_BUDGET }) },
          { id: "rolled", label: t("wizard.rolled", "Roll 4d6"), description: t("wizard.rolledHelp", "Rolled on the server, keep the best 3 dice") },
        ]}
      />
      {build.abilityMethod === "pointBuy" && (
        <p role="status" className={cx("font-semibold", cost !== null && cost > POINT_BUY_BUDGET ? "text-danger" : "")}>
          {t("wizard.pointsLeft", "Points left: {{n}}", { n: cost === null ? "?" : POINT_BUY_BUDGET - cost })}
        </p>
      )}
      {build.abilityMethod === "rolled" && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="accent" onPress={roll} loading={rolling} isDisabled={!!rollToken}>
            <Dices aria-hidden className="h-4 w-4" />
            {rollToken ? t("wizard.rolledOnce", "Scores rolled") : t("wizard.roll", "Roll my scores")}
          </Button>
          {build.rolledScores && <span>{t("wizard.results", "Results")}: <strong>{build.rolledScores.join(", ")}</strong></span>}
          {rollError && <Alert tone="danger">{rollError}</Alert>}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ABILITIES.map((a) => (
          <Card key={a} className="flex flex-col gap-2">
            {build.abilityMethod === "pointBuy" ? (
              <NumberField
                label={ABILITY_NAMES[a]}
                value={build.baseAbilities[a]}
                minValue={8}
                maxValue={15}
                onChange={(v) => set({ baseAbilities: { ...build.baseAbilities, [a]: v } })}
                description={t("wizard.cost", "Cost {{n}}", { n: POINT_BUY_COSTS[build.baseAbilities[a]] ?? "?" })}
              />
            ) : (
              <Select
                label={ABILITY_NAMES[a]}
                value={build.baseAbilities[a] ? `${build.baseAbilities[a]}` : null}
                onChange={(v) => set({ baseAbilities: { ...build.baseAbilities, [a]: Number(v) } })}
                options={[...new Set(pool)].sort((x, y) => y - x).map((v) => ({ id: String(v), label: String(v) }))}
                placeholder={t("wizard.assign", "Assign")}
              />
            )}
            {final && (
              <p className="text-sm">
                {t("wizard.final", "Final")}: <strong>{final[a]}</strong> ({signed(modifier(final[a]))})
                {build.backgroundBoost[a] ? <span className="text-muted"> · +{build.backgroundBoost[a]} {t("wizard.fromBackground", "background")}</span> : null}
              </p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function SkillsStep({ build, set, rules }: StepProps) {
  const { t } = useTranslation();
  const cls = rules.class(build.class);
  const bg = rules.background(build.background);
  const derived = cls && bg && build.species ? derive(build, emptyState(), rules) : null;
  const choices = collectChoices(build, rules).filter((c) => !c.id.startsWith("species:") && !c.id.startsWith("lineage:"));
  if (!cls) return <Alert tone="warning">{t("wizard.needClass", "Choose a class first.")}</Alert>;
  return (
    <div className="flex flex-col gap-4">
      <MultiPick
        legend={t("wizard.classSkills", "{{cls}} skills", { cls: cls.name })}
        selected={build.classSkills}
        max={cls.skillChoices.count}
        onChange={(v) => set({ classSkills: v })}
        options={cls.skillChoices.from.map((s) => ({
          id: s,
          label: rules.skill(s)?.name ?? s,
          disabled: bg?.skills.includes(s),
          description: bg?.skills.includes(s) ? t("wizard.fromBg", "Already from your background") : rules.skill(s) ? ABILITY_NAMES[rules.skill(s)!.ability] : undefined,
        }))}
      />
      {choices.map((c) => (
        <ChoicePicker key={c.id} scoped={c} rules={rules} derived={derived} selected={build.choices[c.id] ?? []} onChange={(v) => set({ choices: { ...build.choices, [c.id]: v } })} />
      ))}
    </div>
  );
}

function EquipmentStep({ build, set, rules }: StepProps) {
  const { t } = useTranslation();
  const cls = rules.class(build.class);
  const bg = rules.background(build.background);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {cls && (
        <RadioGroup
          label={t("wizard.classEquipment", "{{cls}} starting equipment", { cls: cls.name })}
          value={build.equipment.class ?? ""}
          onChange={(v) => set({ equipment: { ...build.equipment, class: v } })}
          options={cls.equipment.map((o) => ({ id: o.key, label: `${t("wizard.option", "Option")} ${o.key.toUpperCase()}`, description: o.label }))}
        />
      )}
      {bg && (
        <RadioGroup
          label={t("wizard.bgEquipment", "{{bg}} equipment", { bg: bg.name })}
          value={build.equipment.background ?? ""}
          onChange={(v) => set({ equipment: { ...build.equipment, background: v } })}
          options={bg.equipment.map((o) => ({ id: o.key, label: `${t("wizard.option", "Option")} ${o.key.toUpperCase()}`, description: o.label }))}
        />
      )}
    </div>
  );
}

function SpellsStep({ build, set, rules }: StepProps) {
  const { t } = useTranslation();
  const cls = rules.class(build.class);
  const derived = cls && build.species && build.background ? derive(build, emptyState(), rules) : null;
  const sc = derived?.spellcasting;
  if (!cls || !sc) return <Alert tone="info">{t("wizard.noSpells", "This class doesn't cast spells at this level. You can skip this step.")}</Alert>;
  const list = cls.spellcasting!.list;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">
        {t("wizard.spellInfo", "Spell save DC {{dc}}, spell attack {{atk}}, slots: {{slots}}", {
          dc: sc.saveDc,
          atk: signed(sc.attackBonus),
          slots: sc.slots
            .map((n, i) => (i > 0 && n > 0 ? `${n} × L${i}` : null))
            .filter(Boolean)
            .join(", "),
        })}
      </p>
      {sc.cantripsKnown > 0 && (
        <MultiPick
          legend={t("wizard.cantrips", "Cantrips")}
          selected={build.cantrips}
          max={sc.cantripsKnown}
          onChange={(v) => set({ cantrips: v })}
          searchable
          options={rules.spellsFor(list, 0, 0).map((s) => ({ id: s.key, label: s.name, description: s.school }))}
        />
      )}
      <MultiPick
        legend={t("wizard.prepared", "Prepared spells")}
        selected={build.preparedSpells}
        max={sc.preparedMax}
        onChange={(v) => set({ preparedSpells: v })}
        searchable
        options={rules.spellsFor(list, sc.maxSpellLevel, 1).map((s) => ({ id: s.key, label: s.name, description: `${t("common.level", "level")} ${s.level} · ${s.school}${s.concentration ? " · C" : ""}` }))}
      />
    </div>
  );
}

function ReviewStep({ build, set, rules }: StepProps) {
  const { t } = useTranslation();
  const ready = build.class && build.species && build.background;
  const derived = ready ? derive(build, initialState(build, rules, emptyState()), rules) : null;
  return (
    <div className="flex flex-col gap-4">
      <TextField label={t("wizard.name", "Character name")} value={build.name} onChange={(v) => set({ name: v })} isRequired />
      {derived && (
        <Card>
          <h3 className="font-display text-lg font-semibold">{build.name || t("wizard.unnamed", "Unnamed hero")}</h3>
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              [t("common.ac", "AC"), derived.ac],
              [t("common.hp", "HP"), derived.maxHp],
              [t("sheet.initiative", "Initiative"), signed(derived.initiative)],
              [t("sheet.speed", "Speed"), `${derived.speed} ft`],
              [t("sheet.prof", "Proficiency"), signed(derived.proficiencyBonus)],
              [t("sheet.passive", "Passive Perception"), derived.passivePerception],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-lg bg-surface-2 p-2">
                <dt className="text-sm text-muted">{k}</dt>
                <dd className="text-xl font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm">
            {ABILITIES.map((a) => `${a.toUpperCase()} ${derived.abilities[a].score} (${signed(derived.abilities[a].modifier)})`).join(" · ")}
          </p>
        </Card>
      )}
    </div>
  );
}

interface StepProps {
  build: CharacterBuild;
  set: (patch: Partial<CharacterBuild>) => void;
  rules: RulesIndex;
  rollToken: string | null;
  setRollToken: (t: string | null) => void;
}

export function CharacterWizardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: rules, isLoading } = useRules();
  const [build, setBuild] = useState<CharacterBuild>(emptyBuild);
  const [step, setStep] = useState(0);
  const [rollToken, setRollToken] = useState<string | null>(null);
  const set = (patch: Partial<CharacterBuild>) => setBuild((b) => ({ ...b, ...patch }));

  const issues = useMemo(() => (rules ? validateBuild(build, rules) : []), [build, rules]);
  const errors = issues.filter((i) => i.severity === "error");
  const issuesByStep = (id: string) => (id === "review" ? issues.filter((i) => i.path === "name") : issues.filter((i) => stepOf(i) === id && i.path !== "name"));

  const create = useMutation({
    mutationFn: () => api.post<CharacterDto>("/characters", { build, details: {}, rollToken: rollToken ?? undefined }),
    onSuccess: (c) => {
      announce(t("wizard.created", "{{name}} is ready!", { name: c.build.name }));
      void navigate({ to: "/characters/$id", params: { id: c.id } });
    },
  });

  if (isLoading || !rules) return <Spinner />;
  const current = STEPS[step];
  const stepIssues = issuesByStep(current.id);
  const props: StepProps = { build, set, rules, rollToken, setRollToken };

  const go = (i: number) => {
    setStep(i);
    announce(t("wizard.stepAnnounce", "Step {{n}} of {{total}}: {{name}}", { n: i + 1, total: STEPS.length, name: t(`wizard.step.${STEPS[i].id}`, STEPS[i].label) }));
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("wizard.title", "New character")} subtitle={t("wizard.subtitle", "Every choice is checked against the rules as you go.")} />
      <nav aria-label={t("wizard.steps", "Steps")}>
        <ol className="flex flex-wrap gap-2">
          {STEPS.map((s, i) => {
            const bad = issuesByStep(s.id).some((x) => x.severity === "error");
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={i === step ? "step" : undefined}
                  className={cx(
                    "inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-medium",
                    i === step ? "border-brand bg-brand text-brand-text" : "border-border bg-surface hover:bg-surface-2",
                  )}
                >
                  <span aria-hidden>{i + 1}.</span>
                  {t(`wizard.step.${s.id}`, s.label)}
                  {bad ? (
                    <AlertCircle aria-label={t("wizard.todo", "to complete")} className="h-4 w-4 text-danger" />
                  ) : (
                    <Check aria-label={t("wizard.done", "complete")} className={cx("h-4 w-4", i === step ? "" : "text-success")} />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <section aria-labelledby="step-title" className="flex flex-col gap-4">
        <h2 id="step-title" className="font-display text-2xl font-semibold">
          {t(`wizard.step.${current.id}`, current.label)}
        </h2>
        {current.id === "species" && <SpeciesStep {...props} />}
        {current.id === "class" && <ClassStep {...props} />}
        {current.id === "background" && <BackgroundStep {...props} />}
        {current.id === "abilities" && <AbilitiesStep {...props} />}
        {current.id === "skills" && <SkillsStep {...props} />}
        {current.id === "equipment" && <EquipmentStep {...props} />}
        {current.id === "spells" && <SpellsStep {...props} />}
        {current.id === "review" && <ReviewStep {...props} />}
        {stepIssues.length > 0 && (
          <div role="status" className="rounded-lg border border-line bg-surface p-3">
            <p className="font-semibold">{t("wizard.issues", "To check on this step")}</p>
            <ul className="mt-1 list-disc pl-5">
              {stepIssues.map((i, n) => (
                <li key={n} className={i.severity === "error" ? "text-danger" : "text-muted"}>
                  {i.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        {current.id === "review" && errors.length > 0 && (
          <Alert tone="warning" title={t("wizard.notReady", "Some steps are not complete")}>
            <ul className="list-disc pl-5">
              {errors.map((i, n) => (
                <li key={n}>
                  <button type="button" className="underline" onClick={() => go(Math.max(0, STEPS.findIndex((s) => s.id === stepOf(i))))}>
                    {i.message}
                  </button>
                </li>
              ))}
            </ul>
          </Alert>
        )}
        {create.error && <Alert tone="danger">{errorMessage(create.error)}</Alert>}
      </section>
      <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-4">
        <Button onPress={() => go(step - 1)} isDisabled={step === 0}>
          <ChevronLeft aria-hidden className="h-4 w-4" />
          {t("wizard.previous", "Previous")}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="primary" onPress={() => go(step + 1)}>
            {t("wizard.next", "Next")}
            <ChevronRight aria-hidden className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="accent" onPress={() => create.mutate()} isDisabled={errors.length > 0} loading={create.isPending}>
            <Check aria-hidden className="h-4 w-4" />
            {t("wizard.create", "Create the character")}
          </Button>
        )}
      </div>
      {errors.length > 0 && step === STEPS.length - 1 && <Badge tone="danger">{t("wizard.errorsLeft", "{{n}} problems left", { n: errors.length })}</Badge>}
    </div>
  );
}
