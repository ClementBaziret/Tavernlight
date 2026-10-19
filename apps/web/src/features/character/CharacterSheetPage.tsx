import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowUpCircle, BedDouble, Coffee, Download, Heart, Minus, Plus, Shield, Sparkles, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ABILITIES,
  ABILITY_NAMES,
  cantripTier,
  multiplyDice,
  newId,
  type ActionDef,
  type CharacterState,
  type InventoryItem,
} from "@tavernlight/engine";
import type { CharacterAction, CharacterDto } from "@tavernlight/shared";
import { RollPanel } from "@/components/RollPanel";
import { Alert, Badge, Button, Card, Checkbox, cx, HpBar, IconButton, ModalDialog, NumberField, PageHeader, RadioGroup, Select, Spinner, TextArea, TextField } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { announce } from "@/lib/announce";
import { distance, signed } from "@/lib/format";
import { useRoll } from "@/lib/roll";
import { useRules } from "@/lib/rules";
import { useSettings } from "@/lib/settings";
import { LevelUpDialog } from "./LevelUpDialog";

type Advantage = "normal" | "advantage" | "disadvantage";

function Section({ id, title, children, actions, className }: { id: string; title: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <Card aria-labelledby={id} className={cx("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="font-display text-xl font-semibold">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </Card>
  );
}

function RollButton({ label, bonus, onRoll, sub }: { label: string; bonus: number | string; onRoll: () => void; sub?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onRoll}
      className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-left hover:border-border hover:bg-surface-2"
    >
      <span className="flex flex-col">
        <span>{label}</span>
        {sub && <span className="text-xs text-muted">{sub}</span>}
      </span>
      <span className="font-mono text-lg font-semibold tabular-nums">{typeof bonus === "number" ? signed(bonus) : bonus}</span>
    </button>
  );
}

function actionDamage(action: ActionDef): string | null {
  const effects = [...(action.onHit ?? []), ...(action.onFail ?? []), ...(action.effects ?? [])];
  const dmg = effects.find((e) => e.type === "damage");
  return dmg && dmg.type === "damage" ? String(dmg.dice) : null;
}

function actionHeal(action: ActionDef): string | null {
  const heal = (action.effects ?? []).find((e) => e.type === "heal");
  return heal && heal.type === "heal" ? String(heal.dice) : null;
}

export function CharacterSheetPage() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false }) as { id: string };
  const client = useQueryClient();
  const navigate = useNavigate();
  const units = useSettings((s) => s.units);
  const { data: rules } = useRules();
  const query = useQuery({ queryKey: ["character", id], queryFn: () => api.get<CharacterDto>(`/characters/${id}`) });
  const roll = useRoll();
  const [adv, setAdv] = useState<Advantage>("normal");
  const [amount, setAmount] = useState(1);
  const [restOpen, setRestOpen] = useState(false);
  const [hitDice, setHitDice] = useState(1);
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const act = useMutation({
    mutationFn: (action: CharacterAction) => api.post<{ character: CharacterDto; extra?: unknown }>(`/characters/${id}/actions`, action),
    onSuccess: (r) => {
      client.setQueryData(["character", id], r.character);
      void client.invalidateQueries({ queryKey: ["characters"] });
    },
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/characters/${id}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["characters"] });
      void navigate({ to: "/" });
    },
  });

  if (query.isLoading || !rules) return <Spinner />;
  if (query.error || !query.data) return <Alert tone="danger">{errorMessage(query.error)}</Alert>;
  const c = query.data;
  const { build, state, derived: d } = c;
  const cls = rules.class(build.class);
  const species = rules.species(build.species);
  const advantage = adv === "normal" ? null : adv;
  const rollD20 = (bonus: number, label: string) => roll.mutate({ expression: `1d20 ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)}`, label, characterId: id, advantage });
  const rollExpr = (expression: string, label: string) => roll.mutate({ expression, label, characterId: id });
  const doAct = (a: CharacterAction, message?: string) =>
    act.mutate(a, {
      onSuccess: () => message && announce(message),
    });
  const setInventory = (inventory: InventoryItem[]) => doAct({ type: "inventory", inventory });

  const itemMatches = itemQuery.length >= 2 ? (rules.data.items ?? []).filter((i) => i.name.toLowerCase().includes(itemQuery.toLowerCase())).slice(0, 8) : [];

  const exportPdf = async () => {
    setPdfLoading(true);
    try {
      const { downloadCharacterPdf } = await import("./CharacterPdf");
      await downloadCharacterPdf(c, rules);
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={build.name}
        subtitle={
          <>
            {species?.name}
            {build.lineage ? ` (${species?.lineages.find((l) => l.key === build.lineage)?.name})` : ""} · {cls?.name} {build.level}
            {build.subclass ? ` · ${rules.subclass(build.subclass)?.name}` : ""} · {rules.background(build.background)?.name}
          </>
        }
        actions={
          <>
            <Button onPress={() => setLevelUpOpen(true)} isDisabled={build.level >= 20}>
              <ArrowUpCircle aria-hidden className="h-4 w-4" />
              {t("sheet.levelUp", "Level up")}
            </Button>
            <Button onPress={() => setRestOpen(true)}>
              <Coffee aria-hidden className="h-4 w-4" />
              {t("sheet.shortRest", "Short rest")}
            </Button>
            <Button onPress={() => doAct({ type: "longRest" }, t("sheet.longRestDone", "Long rest complete: hit points, slots and resources restored."))}>
              <BedDouble aria-hidden className="h-4 w-4" />
              {t("sheet.longRest", "Long rest")}
            </Button>
            <Button onPress={exportPdf} loading={pdfLoading}>
              <Download aria-hidden className="h-4 w-4" />
              {t("sheet.pdf", "Export PDF")}
            </Button>
            <IconButton label={t("sheet.delete", "Delete character")} onPress={() => setDeleteOpen(true)}>
              <Trash2 aria-hidden className="h-5 w-5" />
            </IconButton>
          </>
        }
      />
      {act.error && <Alert tone="danger">{errorMessage(act.error)}</Alert>}
      {roll.error && <Alert tone="danger">{errorMessage(roll.error)}</Alert>}
      {c.issues.some((i) => i.severity === "error") && (
        <Alert tone="warning" title={t("sheet.issues", "This character needs attention")}>
          <ul className="list-disc pl-5">
            {c.issues
              .filter((i) => i.severity === "error")
              .map((i, n) => (
                <li key={n}>{i.message}</li>
              ))}
          </ul>
        </Alert>
      )}

      <RadioGroup
        label={t("sheet.d20Mode", "d20 rolls")}
        orientation="horizontal"
        value={adv}
        onChange={(v) => setAdv(v as Advantage)}
        options={[
          { id: "normal", label: t("sheet.normal", "Normal") },
          { id: "advantage", label: t("sheet.advantage", "Advantage") },
          { id: "disadvantage", label: t("sheet.disadvantage", "Disadvantage") },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr_20rem]">
        <div className="flex flex-col gap-6">
          <Section id="abilities" title={t("sheet.abilities", "Abilities and saving throws")}>
            <ul className="grid gap-2 sm:grid-cols-2">
              {ABILITIES.map((a) => {
                const ab = d.abilities[a];
                return (
                  <li key={a} className="rounded-lg border border-line p-2">
                    <p className="flex items-baseline justify-between">
                      <span className="font-semibold">{ABILITY_NAMES[a]}</span>
                      <span>
                        <span className="text-2xl font-bold">{ab.score}</span> <span className="text-muted">({signed(ab.modifier)})</span>
                      </span>
                    </p>
                    <div className="mt-1 grid grid-cols-2 gap-1">
                      <RollButton label={t("sheet.check", "Check")} bonus={ab.modifier} onRoll={() => rollD20(ab.modifier, `${ABILITY_NAMES[a]} check`)} />
                      <RollButton
                        label={t("sheet.save", "Save")}
                        sub={ab.saveProficient ? t("sheet.proficient", "proficient") : undefined}
                        bonus={ab.save}
                        onRoll={() => rollD20(ab.save, `${ABILITY_NAMES[a]} save`)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section id="skills" title={t("sheet.skills", "Skills")}>
            <ul className="grid gap-1 sm:grid-cols-2">
              {d.skills.map((s) => (
                <li key={s.key}>
                  <RollButton
                    label={s.name}
                    sub={
                      <>
                        {s.ability.toUpperCase()}
                        {s.expertise ? ` · ${t("sheet.expertise", "expertise")}` : s.proficient ? ` · ${t("sheet.proficient", "proficient")}` : ""}
                      </>
                    }
                    bonus={s.bonus}
                    onRoll={() => rollD20(s.bonus, s.name)}
                  />
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted">
              {t("sheet.passive", "Passive Perception")} {d.passivePerception} · {t("sheet.passiveInsight", "Insight")} {d.passiveInsight} · {t("sheet.passiveInvestigation", "Investigation")} {d.passiveInvestigation}
            </p>
          </Section>
        </div>

        <div className="flex flex-col gap-6">
          <Section id="combat" title={t("sheet.combat", "Combat")}>
            <dl className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-surface-2 p-2 text-center">
                <dt className="text-sm text-muted">
                  <Shield aria-hidden className="mr-1 inline h-4 w-4" />
                  {t("common.ac", "AC")}
                </dt>
                <dd className="text-2xl font-bold">{d.ac}</dd>
                <dd className="text-xs text-muted">{d.acBreakdown}</dd>
              </div>
              <div className="rounded-lg bg-surface-2 p-2 text-center">
                <dt className="text-sm text-muted">{t("sheet.speed", "Speed")}</dt>
                <dd className="text-2xl font-bold">{distance(d.speed, units)}</dd>
              </div>
              <div className="rounded-lg bg-surface-2 p-2 text-center">
                <dt className="text-sm text-muted">{t("sheet.prof", "Proficiency")}</dt>
                <dd className="text-2xl font-bold">{signed(d.proficiencyBonus)}</dd>
              </div>
            </dl>
            <RollButton label={t("sheet.initiative", "Initiative")} bonus={d.initiative} onRoll={() => rollD20(d.initiative, "Initiative")} />
            <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
              <p className="flex items-baseline justify-between">
                <span className="font-semibold">
                  <Heart aria-hidden className="mr-1 inline h-4 w-4" />
                  {t("sheet.hitPoints", "Hit points")}
                </span>
                <span>
                  <span className="text-2xl font-bold tabular-nums">{d.currentHp}</span> / {d.maxHp}
                  {state.tempHp > 0 && <Badge tone="info" className="ml-2">+{state.tempHp} {t("sheet.temp", "temp")}</Badge>}
                </span>
              </p>
              <HpBar hp={d.currentHp} max={d.maxHp} temp={state.tempHp} label={t("sheet.hitPoints", "Hit points")} />
              <div className="flex flex-wrap items-end gap-2">
                <NumberField label={t("sheet.amount", "Amount")} value={amount} onChange={setAmount} minValue={0} maxValue={999} className="w-36" />
                <Button variant="danger" size="sm" onPress={() => doAct({ type: "damage", amount }, t("sheet.tookDamage", "{{n}} damage taken", { n: amount }))}>
                  {t("sheet.damage", "Damage")}
                </Button>
                <Button variant="primary" size="sm" onPress={() => doAct({ type: "heal", amount }, t("sheet.healed", "{{n}} hit points healed", { n: amount }))}>
                  {t("sheet.heal", "Heal")}
                </Button>
                <Button size="sm" onPress={() => doAct({ type: "tempHp", amount })}>
                  {t("sheet.setTemp", "Temporary HP")}
                </Button>
              </div>
              <p className="text-sm text-muted">
                {t("sheet.hitDice", "Hit dice")}: {d.hitDiceRemaining}/{d.level} d{d.hitDie}
              </p>
            </div>
            {d.currentHp === 0 && (
              <div className="flex flex-col gap-2 rounded-lg border border-danger p-3">
                <p className="font-semibold">
                  {t("sheet.deathSaves", "Death saving throws")}: {state.deathSaves.successes} ✓ · {state.deathSaves.failures} ✗
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onPress={() => rollExpr("1d20", "Death saving throw")}>
                    {t("sheet.rollDeathSave", "Roll")}
                  </Button>
                  <Button size="sm" onPress={() => doAct({ type: "deathSave", success: true })}>
                    {t("sheet.success", "Success")}
                  </Button>
                  <Button size="sm" onPress={() => doAct({ type: "deathSave", success: false })}>
                    {t("sheet.failure", "Failure")}
                  </Button>
                </div>
              </div>
            )}
            <ConditionsEditor state={state} conditions={(rules.data.conditions ?? []).map((x) => ({ id: x.key, label: x.name }))} onSave={(conditions, exhaustion) => doAct({ type: "conditions", conditions, exhaustion })} />
          </Section>

          <Section id="actions" title={t("sheet.actions", "Attacks and actions")}>
            <ul className="flex flex-col gap-2">
              {d.actions.map((a) => {
                const dmg = actionDamage(a);
                const heal = actionHeal(a);
                const scaled = dmg && a.cantripScaling ? multiplyDice(dmg, cantripTier(d.level)) : dmg;
                return (
                  <li key={a.key} className="rounded-lg border border-line p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">
                        {a.name}
                        {a.level !== undefined && a.source === "spell" && <span className="ml-2 text-sm font-normal text-muted">{a.level === 0 ? t("sheet.cantrip", "cantrip") : `${t("common.level", "level")} ${a.level}`}</span>}
                      </span>
                      <span className="text-sm text-muted">
                        {a.range?.reach ? `${t("sheet.reach", "reach")} ${distance(a.range.reach, units)}` : a.range?.normal ? distance(a.range.normal, units) : a.range?.touch ? t("sheet.touch", "touch") : ""}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {a.resolution.type === "attack" && (
                        <Button
                          size="sm"
                          variant="primary"
                          onPress={() => a.resolution.type === "attack" && roll.mutate({ expression: `1d20 + ${a.resolution.bonus}`, label: `${a.name} — attack`, characterId: id, advantage })}
                        >
                          {t("sheet.attack", "Attack")} {typeof a.resolution.bonus === "number" ? signed(a.resolution.bonus) : signed(d.spellcasting?.attackBonus ?? d.variables.spell_attack)}
                        </Button>
                      )}
                      {a.resolution.type === "save" && <Badge tone="accent">{t("sheet.saveDc", "{{ability}} save, DC {{dc}}", { ability: a.resolution.ability.toUpperCase(), dc: typeof a.resolution.dc === "number" ? a.resolution.dc : d.variables.spell_dc })}</Badge>}
                      {scaled && (
                        <>
                          <Button size="sm" onPress={() => rollExpr(scaled, `${a.name} — damage`)}>
                            {t("sheet.damageRoll", "Damage")} {scaled}
                          </Button>
                          {a.resolution.type === "attack" && (
                            <Button size="sm" variant="ghost" onPress={() => rollExpr(multiplyDice(scaled, 2), `${a.name} — critical damage`)}>
                              {t("sheet.crit", "Critical")}
                            </Button>
                          )}
                        </>
                      )}
                      {heal && (
                        <Button size="sm" onPress={() => rollExpr(heal, `${a.name} — healing`)}>
                          {t("sheet.healRoll", "Healing")} {heal}
                        </Button>
                      )}
                    </div>
                    {a.description && a.source !== "spell" && <p className="mt-1 text-sm text-muted">{a.description}</p>}
                  </li>
                );
              })}
            </ul>
          </Section>

          {d.spellcasting && (
            <Section id="spells" title={t("sheet.spellcasting", "Spellcasting")}>
              <p>
                {t("sheet.spellStats", "Ability {{ability}} · save DC {{dc}} · spell attack {{atk}}", {
                  ability: ABILITY_NAMES[d.spellcasting.ability],
                  dc: d.spellcasting.saveDc,
                  atk: signed(d.spellcasting.attackBonus),
                })}
              </p>
              <ul className="flex flex-col gap-2">
                {d.spellcasting.slots.map((n, level) =>
                  level > 0 && n > 0 ? (
                    <li key={level} className="flex flex-wrap items-center gap-2">
                      <span className="w-24 font-medium">
                        {t("sheet.slotLevel", "Level {{n}}", { n: level })}
                      </span>
                      <span className="sr-only">{t("sheet.slotsLeft", "{{left}} of {{max}} slots left", { left: n - (state.slotsUsed[level] ?? 0), max: n })}</span>
                      <span aria-hidden className="flex gap-1">
                        {Array.from({ length: n }, (_, i) => (
                          <span key={i} className={cx("h-5 w-5 rounded-full border-2 border-brand", i < n - (state.slotsUsed[level] ?? 0) ? "bg-brand" : "bg-transparent")} />
                        ))}
                      </span>
                      <IconButton size="sm" label={t("sheet.useSlot", "Use a level {{n}} slot", { n: level })} onPress={() => doAct({ type: "slot", level, delta: 1 })}>
                        <Minus aria-hidden className="h-4 w-4" />
                      </IconButton>
                      <IconButton size="sm" label={t("sheet.recoverSlot", "Recover a level {{n}} slot", { n: level })} onPress={() => doAct({ type: "slot", level, delta: -1 })}>
                        <Plus aria-hidden className="h-4 w-4" />
                      </IconButton>
                    </li>
                  ) : null,
                )}
              </ul>
              <SpellList title={t("wizard.cantrips", "Cantrips")} keys={build.cantrips} rules={rules} />
              <SpellList title={t("wizard.prepared", "Prepared spells")} keys={[...build.preparedSpells, ...d.spellcasting.alwaysPrepared]} rules={rules} />
            </Section>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <RollPanel />
          {d.resources.length > 0 && (
            <Section id="resources" title={t("sheet.resources", "Resources")}>
              <ul className="flex flex-col gap-2">
                {d.resources.map((r) => (
                  <li key={r.key} className="flex items-center justify-between gap-2">
                    <span>
                      {r.name}
                      <span className="block text-sm text-muted">
                        {r.max - r.used}/{r.max} · {r.recharge === "short" ? t("sheet.shortOrLong", "short or long rest") : t("sheet.longOnly", "long rest")}
                      </span>
                    </span>
                    <span className="flex gap-1">
                      <IconButton size="sm" variant="secondary" label={t("sheet.useResource", "Use {{name}}", { name: r.name })} onPress={() => doAct({ type: "resource", key: r.key, delta: 1 })}>
                        <Minus aria-hidden className="h-4 w-4" />
                      </IconButton>
                      <IconButton size="sm" variant="secondary" label={t("sheet.recoverResource", "Recover {{name}}", { name: r.name })} onPress={() => doAct({ type: "resource", key: r.key, delta: -1 })}>
                        <Plus aria-hidden className="h-4 w-4" />
                      </IconButton>
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Section id="features" title={t("sheet.features", "Features and traits")}>
            <ul className="flex flex-col gap-1">
              {d.features.map((f, i) => (
                <li key={`${f.key}-${i}`}>
                  <details className="rounded-lg border border-line px-3 py-2">
                    <summary className="cursor-pointer font-medium">
                      {f.name} <span className="text-sm font-normal text-muted">· {f.source}</span>
                    </summary>
                    <p className="mt-2 whitespace-pre-line text-sm">{f.description}</p>
                  </details>
                </li>
              ))}
            </ul>
          </Section>
          <Section id="profs" title={t("sheet.proficiencies", "Proficiencies")}>
            <p className="text-sm">
              <strong>{t("sheet.armor", "Armor")}:</strong> {d.proficiencies.armor.join(", ") || "—"}
            </p>
            <p className="text-sm">
              <strong>{t("sheet.weapons", "Weapons")}:</strong> {d.proficiencies.weapons.join(", ") || "—"}
            </p>
            <p className="text-sm">
              <strong>{t("sheet.tools", "Tools")}:</strong> {d.proficiencies.tools.join(", ") || "—"}
            </p>
            {Object.keys(d.senses).length > 0 && (
              <p className="text-sm">
                <strong>{t("sheet.senses", "Senses")}:</strong> {Object.entries(d.senses).map(([k, v]) => `${k} ${distance(v, units)}`).join(", ")}
              </p>
            )}
            {d.resistances.length > 0 && (
              <p className="text-sm">
                <strong>{t("sheet.resistances", "Resistances")}:</strong> {d.resistances.join(", ")}
              </p>
            )}
          </Section>
        </div>
      </div>

      <Section id="inventory" title={t("sheet.inventory", "Inventory and money")}>
        <p className={cx("text-sm", d.carried.encumbered ? "font-semibold text-danger" : "text-muted")}>
          {t("sheet.carried", "Carried: {{w}} lb of {{max}} lb", { w: d.carried.weight, max: d.carried.capacity })}
          {d.carried.encumbered && ` — ${t("sheet.encumbered", "over capacity")}`}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left">
            <caption className="sr-only">{t("sheet.inventory", "Inventory and money")}</caption>
            <thead>
              <tr className="border-b border-line text-sm text-muted">
                <th scope="col" className="py-2">{t("sheet.item", "Item")}</th>
                <th scope="col">{t("sheet.qty", "Quantity")}</th>
                <th scope="col">{t("sheet.weight", "Weight")}</th>
                <th scope="col">{t("sheet.equipped", "Equipped")}</th>
                <th scope="col"><span className="sr-only">{t("sheet.remove", "Remove")}</span></th>
              </tr>
            </thead>
            <tbody>
              {state.inventory.map((item) => (
                <tr key={item.id} className="border-b border-line">
                  <th scope="row" className="py-1 font-normal">{item.name}</th>
                  <td className="w-40 py-1">
                    <NumberField
                      label={t("sheet.qtyOf", "Quantity of {{name}}", { name: item.name })}
                      hideLabel
                      value={item.quantity}
                      minValue={0}
                      onChange={(q) => setInventory(state.inventory.map((i) => (i.id === item.id ? { ...i, quantity: q } : i)))}
                    />
                  </td>
                  <td>{item.weight * item.quantity} lb</td>
                  <td>
                    <Checkbox
                      aria-label={t("sheet.equipItem", "Equip {{name}}", { name: item.name })}
                      isSelected={item.equipped}
                      onChange={(v) => setInventory(state.inventory.map((i) => (i.id === item.id ? { ...i, equipped: v } : i)))}
                    >
                      <span className="sr-only">{item.name}</span>
                    </Checkbox>
                  </td>
                  <td>
                    <IconButton size="sm" label={t("sheet.removeItem", "Remove {{name}}", { name: item.name })} onPress={() => setInventory(state.inventory.filter((i) => i.id !== item.id))}>
                      <Trash2 aria-hidden className="h-4 w-4" />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <TextField label={t("sheet.findItem", "Add an item from the rules")} value={itemQuery} onChange={setItemQuery} placeholder={t("sheet.findItemPh", "Rope, longsword, potion…")} />
            {itemMatches.length > 0 && (
              <ul className="flex flex-col gap-1">
                {itemMatches.map((i) => (
                  <li key={i.key}>
                    <Button
                      size="sm"
                      onPress={() => {
                        setInventory([...state.inventory, { id: newId("item"), item: i.key, name: i.name, quantity: 1, weight: i.weight, equipped: false }]);
                        setItemQuery("");
                      }}
                    >
                      <Plus aria-hidden className="h-4 w-4" /> {i.name}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newItem.trim()) return;
              setInventory([...state.inventory, { id: newId("item"), item: null, name: newItem.trim(), quantity: 1, weight: 0, equipped: false }]);
              setNewItem("");
            }}
          >
            <TextField label={t("sheet.customItem", "Add a custom item")} value={newItem} onChange={setNewItem} className="flex-1" />
            <Button type="submit">{t("sheet.add", "Add")}</Button>
          </form>
        </div>
        <CurrencyEditor state={state} onSave={(currency) => doAct({ type: "currency", currency })} />
      </Section>

      <Section id="notes" title={t("sheet.notes", "Notes")}>
        <NotesEditor value={state.notes} onSave={(notes) => doAct({ type: "notes", notes }, t("sheet.notesSaved", "Notes saved"))} />
      </Section>

      <p className="text-sm text-muted">
        <Link to="/" className="underline">
          {t("sheet.back", "Back to my table")}
        </Link>
      </p>

      <ModalDialog isOpen={restOpen} onOpenChange={setRestOpen} title={t("sheet.shortRest", "Short rest")}>
        <div className="flex flex-col gap-4">
          <p>{t("sheet.shortRestHelp", "Spend hit dice to recover hit points (each die + Constitution modifier). Short-rest resources are restored.")}</p>
          <NumberField label={t("sheet.hitDiceToSpend", "Hit dice to spend")} value={hitDice} minValue={0} maxValue={d.hitDiceRemaining} onChange={setHitDice} description={t("sheet.hitDiceLeft", "{{n}} left", { n: d.hitDiceRemaining })} />
          <Button
            variant="primary"
            onPress={() => {
              act.mutate(
                { type: "shortRest", hitDice },
                {
                  onSuccess: (r) => {
                    const spent = (r.extra as { roll: number; healed: number }[] | undefined) ?? [];
                    announce(t("sheet.shortRestDone", "Short rest: {{n}} hit points recovered", { n: spent.reduce((s, x) => s + x.healed, 0) }));
                    setRestOpen(false);
                  },
                },
              );
            }}
          >
            <Sparkles aria-hidden className="h-4 w-4" />
            {t("sheet.rest", "Rest")}
          </Button>
        </div>
      </ModalDialog>
      <LevelUpDialog character={c} rules={rules} isOpen={levelUpOpen} onOpenChange={setLevelUpOpen} />
      <ModalDialog isOpen={deleteOpen} onOpenChange={setDeleteOpen} title={t("sheet.deleteTitle", "Delete {{name}}?", { name: build.name })}>
        <p>{t("sheet.deleteText", "This can't be undone.")}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onPress={() => setDeleteOpen(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button variant="danger" onPress={() => remove.mutate()} loading={remove.isPending}>
            {t("sheet.delete", "Delete character")}
          </Button>
        </div>
      </ModalDialog>
    </div>
  );
}

function SpellList({ title, keys, rules }: { title: string; keys: string[]; rules: NonNullable<ReturnType<typeof useRules>["data"]> }) {
  const unique = [...new Set(keys)];
  if (!unique.length) return null;
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      <ul className="mt-1 flex flex-col gap-1">
        {unique.map((k) => {
          const s = rules.spell(k);
          if (!s) return null;
          return (
            <li key={k}>
              <details className="rounded-lg border border-line px-3 py-2">
                <summary className="cursor-pointer">
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-2 text-sm text-muted">
                    {s.level === 0 ? "cantrip" : `level ${s.level}`} · {s.castingTime} · {s.range}
                    {s.concentration ? " · concentration" : ""}
                  </span>
                </summary>
                <p className="mt-2 whitespace-pre-line text-sm">{s.description}</p>
                {s.higherLevel && <p className="mt-1 text-sm text-muted">{s.higherLevel}</p>}
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ConditionsEditor({ state, conditions, onSave }: { state: CharacterState; conditions: { id: string; label: string }[]; onSave: (c: string[], exhaustion: number) => void }) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <p className="font-semibold">{t("sheet.conditions", "Conditions")}</p>
      <ul className="flex flex-wrap gap-2">
        {state.conditions.map((c) => (
          <li key={c}>
            <Badge tone="danger">
              {conditions.find((x) => x.id === c)?.label ?? c}
              <button type="button" className="ml-1 underline" aria-label={t("sheet.removeCondition", "Remove {{c}}", { c })} onClick={() => onSave(state.conditions.filter((x) => x !== c), state.exhaustion)}>
                ×
              </button>
            </Badge>
          </li>
        ))}
        {state.conditions.length === 0 && <li className="text-sm text-muted">{t("sheet.noCondition", "None")}</li>}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <Select label={t("sheet.addCondition", "Add a condition")} value={adding} onChange={setAdding} options={conditions.filter((c) => !state.conditions.includes(c.id))} className="w-56" />
        <Button size="sm" isDisabled={!adding} onPress={() => adding && (onSave([...state.conditions, adding], state.exhaustion), setAdding(null))}>
          {t("sheet.add", "Add")}
        </Button>
        <NumberField label={t("sheet.exhaustion", "Exhaustion")} value={state.exhaustion} minValue={0} maxValue={6} onChange={(v) => onSave(state.conditions, v)} className="w-36" />
      </div>
    </div>
  );
}

function CurrencyEditor({ state, onSave }: { state: CharacterState; onSave: (c: CharacterState["currency"]) => void }) {
  const { t } = useTranslation();
  const [money, setMoney] = useState(state.currency);
  const dirty = JSON.stringify(money) !== JSON.stringify(state.currency);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(money);
      }}
    >
      {(["pp", "gp", "ep", "sp", "cp"] as const).map((k) => (
        <NumberField key={k} label={k.toUpperCase()} value={money[k]} minValue={0} onChange={(v) => setMoney({ ...money, [k]: v })} className="w-32" />
      ))}
      <Button type="submit" isDisabled={!dirty}>
        {t("sheet.saveMoney", "Save money")}
      </Button>
    </form>
  );
}

function NotesEditor({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState(value);
  return (
    <div className="flex flex-col gap-2">
      <TextArea label={t("sheet.notes", "Notes")} hideLabel value={text} onChange={setText} rows={6} />
      <Button className="self-start" onPress={() => onSave(text)} isDisabled={text === value}>
        {t("sheet.saveNotes", "Save notes")}
      </Button>
    </div>
  );
}
