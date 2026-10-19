import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { AccessibilityInfo, ScrollView, Text, View } from "react-native";
import {
  ABILITIES,
  ABILITY_NAMES,
  POINT_BUY_BUDGET,
  STANDARD_ARRAY,
  abilityScores,
  collectChoices,
  derive,
  emptyState,
  modifier,
  pointBuyCost,
  stepOf,
  validateBuild,
  type Ability,
  type CharacterBuild,
  type RulesIndex,
  type ScopedChoice,
} from "@tavernlight/engine";
import type { CharacterDto } from "@tavernlight/shared";
import { api, errorText } from "../src/api";
import { useRules } from "../src/rules";
import { useTheme } from "../src/theme";
import { Body, Button, Card, Field, Loading, Notice, OptionRow, Screen, Title } from "../src/ui";

const STEPS = ["species", "class", "background", "abilities", "skills", "equipment", "spells", "review"] as const;
const STEP_LABELS: Record<(typeof STEPS)[number], string> = {
  species: "Species",
  class: "Class",
  background: "Background",
  abilities: "Ability scores",
  skills: "Skills & features",
  equipment: "Equipment",
  spells: "Spells",
  review: "Review",
};

const initial: CharacterBuild = {
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

const without = (choices: Record<string, string[]>, prefix: string) => Object.fromEntries(Object.entries(choices).filter(([k]) => !k.startsWith(prefix)));

function MultiList({ title, options, selected, max, onChange }: { title: string; options: { id: string; label: string; description?: string; disabled?: boolean }[]; selected: string[]; max: number; onChange: (v: string[]) => void }) {
  const t = useTheme();
  return (
    <Card>
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 17, fontWeight: "700" }}>
        {title}
      </Text>
      <Text style={{ color: selected.length === max ? t.success : t.muted }}>{`${selected.length} of ${max} chosen`}</Text>
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <OptionRow
            key={o.id}
            multiple
            label={o.label}
            description={o.description}
            selected={on}
            disabled={o.disabled || (!on && selected.length >= max)}
            onPress={() => onChange(on ? selected.filter((x) => x !== o.id) : [...selected, o.id])}
          />
        );
      })}
    </Card>
  );
}

function choiceOptions(c: ScopedChoice, rules: RulesIndex, proficient: string[]) {
  const ch = c.choice;
  switch (ch.kind) {
    case "skill":
      return (ch.from === "any" ? rules.skills.map((s) => s.key) : ch.from).map((k) => ({ id: k, label: rules.skill(k)?.name ?? k }));
    case "expertise":
      return proficient.map((k) => ({ id: k, label: rules.skill(k)?.name ?? k }));
    case "feat":
      return ch.from.map((k) => ({ id: k, label: rules.feat(k)?.name ?? k }));
    case "spells":
      return rules.spellsFor(ch.spellList, ch.level, ch.level).map((s) => ({ id: s.key, label: s.name }));
    case "option":
      return ch.from.map((o) => ({ id: o.key, label: o.name, description: o.description }));
    case "ability":
      return ch.from.map((a) => ({ id: a, label: ABILITY_NAMES[a] }));
  }
}

export default function NewCharacter() {
  const { data: rules } = useRules();
  const theme = useTheme();
  const client = useQueryClient();
  const [build, setBuild] = useState<CharacterBuild>(initial);
  const [step, setStep] = useState(0);
  const [rollToken, setRollToken] = useState<string | null>(null);
  const set = (patch: Partial<CharacterBuild>) => setBuild((b) => ({ ...b, ...patch }));
  const issues = useMemo(() => (rules ? validateBuild(build, rules) : []), [build, rules]);
  const create = useMutation({
    mutationFn: () => api.post<CharacterDto>("/characters", { build, details: {}, rollToken: rollToken ?? undefined }),
    onSuccess: (c) => {
      void client.invalidateQueries({ queryKey: ["characters"] });
      AccessibilityInfo.announceForAccessibility(`${c.build.name} created`);
      router.replace(`/character/${c.id}`);
    },
  });
  if (!rules) return <Loading />;

  const current = STEPS[step];
  const stepIssues = issues.filter((i) => (current === "review" ? i.path === "name" : stepOf(i) === current && i.path !== "name"));
  const cls = rules.class(build.class);
  const bg = rules.background(build.background);
  const species = rules.species(build.species);
  const complete = cls && bg && species;
  const derived = complete ? derive(build, emptyState(), rules) : null;
  const choices = complete ? collectChoices(build, rules) : [];
  const proficient = derived?.skills.filter((s) => s.proficient).map((s) => s.key) ?? [];
  const go = (i: number) => {
    setStep(i);
    AccessibilityInfo.announceForAccessibility(`Step ${i + 1} of ${STEPS.length}: ${STEP_LABELS[STEPS[i]]}`);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Title>{`${step + 1}/${STEPS.length} · ${STEP_LABELS[current]}`}</Title>

        {current === "species" && (
          <View accessibilityRole="radiogroup">
            {(rules.data.species ?? []).map((s) => (
              <OptionRow key={s.key} label={s.name} description={s.features.map((f) => f.name).join(", ")} selected={build.species === s.key} onPress={() => set({ species: s.key, lineage: undefined, size: s.sizes[0], choices: without(without(build.choices, "species:"), "lineage:") })} />
            ))}
            {species && species.lineages.length > 0 && (
              <Card>
                <Title level={3}>{species.lineageLabel ?? "Lineage"}</Title>
                {species.lineages.map((l) => (
                  <OptionRow key={l.key} label={l.name} selected={build.lineage === l.key} onPress={() => set({ lineage: l.key })} />
                ))}
              </Card>
            )}
          </View>
        )}

        {current === "class" && (
          <View accessibilityRole="radiogroup">
            {(rules.data.classes ?? []).map((c) => (
              <OptionRow
                key={c.key}
                label={c.name}
                description={`d${c.hitDie} · ${c.primaryAbilities.map((a) => ABILITY_NAMES[a]).join("/")}`}
                selected={build.class === c.key}
                onPress={() => set({ class: c.key, classSkills: [], cantrips: [], preparedSpells: [], equipment: { ...build.equipment, class: undefined }, choices: without(build.choices, "class:") })}
              />
            ))}
          </View>
        )}

        {current === "background" && (
          <View>
            {(rules.data.backgrounds ?? []).map((b) => (
              <OptionRow key={b.key} label={b.name} description={`${b.abilities.map((a) => a.toUpperCase()).join(", ")} · ${rules.feat(b.feat)?.name}`} selected={build.background === b.key} onPress={() => set({ background: b.key, backgroundBoost: {}, equipment: { ...build.equipment, background: undefined }, choices: without(build.choices, "background:") })} />
            ))}
            {bg && (
              <Card>
                <Title level={3}>Ability increase</Title>
                <OptionRow label={`+1 to ${bg.abilities.map((a) => ABILITY_NAMES[a]).join(", ")}`} selected={Object.keys(build.backgroundBoost).length === 3} onPress={() => set({ backgroundBoost: Object.fromEntries(bg.abilities.map((a) => [a, 1])) })} />
                {bg.abilities.flatMap((a2) =>
                  bg.abilities
                    .filter((a1) => a1 !== a2)
                    .map((a1) => (
                      <OptionRow key={`${a2}${a1}`} label={`+2 ${ABILITY_NAMES[a2]}, +1 ${ABILITY_NAMES[a1]}`} selected={build.backgroundBoost[a2] === 2 && build.backgroundBoost[a1] === 1} onPress={() => set({ backgroundBoost: { [a2]: 2, [a1]: 1 } })} />
                    )),
                )}
              </Card>
            )}
          </View>
        )}

        {current === "abilities" && (
          <View>
            <OptionRow label="Standard array" description={STANDARD_ARRAY.join(", ")} selected={build.abilityMethod === "standardArray"} onPress={() => set({ abilityMethod: "standardArray", baseAbilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 } })} />
            <OptionRow label="Point buy" description={`${POINT_BUY_BUDGET} points`} selected={build.abilityMethod === "pointBuy"} onPress={() => set({ abilityMethod: "pointBuy", baseAbilities: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } })} />
            <OptionRow label="Roll 4d6 (server)" selected={build.abilityMethod === "rolled"} onPress={() => set({ abilityMethod: "rolled" })} />
            {build.abilityMethod === "rolled" && !rollToken && (
              <Button
                label="Roll my scores"
                variant="accent"
                onPress={async () => {
                  const r = await api.post<{ token: string; scores: number[] }>("/characters/roll-abilities");
                  setRollToken(r.token);
                  set({ rolledScores: r.scores, baseAbilities: Object.fromEntries(ABILITIES.map((a, i) => [a, r.scores[i]])) as CharacterBuild["baseAbilities"] });
                  AccessibilityInfo.announceForAccessibility(`Rolled ${r.scores.join(", ")}`);
                }}
              />
            )}
            {build.abilityMethod === "pointBuy" && <Body>{`Points left: ${POINT_BUY_BUDGET - (pointBuyCost(build.baseAbilities) ?? 99)}`}</Body>}
            {build.abilityMethod !== "pointBuy" && <Body muted>Swap two scores with the arrows to assign them.</Body>}
            {ABILITIES.map((a, i) => {
              const final = complete ? abilityScores(build, rules)[a] : build.baseAbilities[a];
              const swap = (j: number) => {
                const other = ABILITIES[j];
                set({ baseAbilities: { ...build.baseAbilities, [a]: build.baseAbilities[other], [other]: build.baseAbilities[a] } });
              };
              return (
                <Card key={a} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ flex: 1, fontSize: 16, color: theme.text }} accessibilityLabel={`${ABILITY_NAMES[a]} ${build.baseAbilities[a]}, final ${final}, modifier ${modifier(final)}`}>
                    <Text style={{ fontWeight: "700" }}>{ABILITY_NAMES[a]}</Text> {build.baseAbilities[a]} → {final} ({modifier(final) >= 0 ? "+" : ""}
                    {modifier(final)})
                  </Text>
                  {build.abilityMethod === "pointBuy" ? (
                    <>
                      <Button label="−" accessibilityHint={`Lower ${ABILITY_NAMES[a]}`} onPress={() => set({ baseAbilities: { ...build.baseAbilities, [a]: Math.max(8, build.baseAbilities[a] - 1) } })} />
                      <Button label="+" accessibilityHint={`Raise ${ABILITY_NAMES[a]}`} onPress={() => set({ baseAbilities: { ...build.baseAbilities, [a]: Math.min(15, build.baseAbilities[a] + 1) } })} />
                    </>
                  ) : (
                    <>
                      <Button label="↑" accessibilityHint={`Swap with ${i > 0 ? ABILITY_NAMES[ABILITIES[i - 1] as Ability] : ""}`} disabled={i === 0} onPress={() => swap(i - 1)} />
                      <Button label="↓" accessibilityHint={`Swap with ${i < 5 ? ABILITY_NAMES[ABILITIES[i + 1] as Ability] : ""}`} disabled={i === 5} onPress={() => swap(i + 1)} />
                    </>
                  )}
                </Card>
              );
            })}
          </View>
        )}

        {current === "skills" && cls && (
          <View>
            <MultiList
              title={`${cls.name} skills`}
              options={cls.skillChoices.from.map((s) => ({ id: s, label: rules.skill(s)?.name ?? s, disabled: bg?.skills.includes(s), description: bg?.skills.includes(s) ? "From your background" : undefined }))}
              selected={build.classSkills}
              max={cls.skillChoices.count}
              onChange={(v) => set({ classSkills: v })}
            />
            {choices.map((c) => (
              <MultiList key={c.id} title={`${c.choice.label} (${c.source})`} options={choiceOptions(c, rules, proficient)} selected={build.choices[c.id] ?? []} max={c.choice.count} onChange={(v) => set({ choices: { ...build.choices, [c.id]: v } })} />
            ))}
          </View>
        )}

        {current === "equipment" && (
          <View>
            {cls && (
              <Card>
                <Title level={3}>{`${cls.name} equipment`}</Title>
                {cls.equipment.map((o) => (
                  <OptionRow key={o.key} label={`Option ${o.key.toUpperCase()}`} description={o.label} selected={build.equipment.class === o.key} onPress={() => set({ equipment: { ...build.equipment, class: o.key } })} />
                ))}
              </Card>
            )}
            {bg && (
              <Card>
                <Title level={3}>{`${bg.name} equipment`}</Title>
                {bg.equipment.map((o) => (
                  <OptionRow key={o.key} label={`Option ${o.key.toUpperCase()}`} description={o.label} selected={build.equipment.background === o.key} onPress={() => set({ equipment: { ...build.equipment, background: o.key } })} />
                ))}
              </Card>
            )}
          </View>
        )}

        {current === "spells" &&
          (derived?.spellcasting && cls?.spellcasting ? (
            <View>
              {derived.spellcasting.cantripsKnown > 0 && (
                <MultiList title="Cantrips" options={rules.spellsFor(cls.spellcasting.list, 0, 0).map((s) => ({ id: s.key, label: s.name }))} selected={build.cantrips} max={derived.spellcasting.cantripsKnown} onChange={(v) => set({ cantrips: v })} />
              )}
              <MultiList
                title="Prepared spells"
                options={rules.spellsFor(cls.spellcasting.list, derived.spellcasting.maxSpellLevel, 1).map((s) => ({ id: s.key, label: s.name, description: `level ${s.level}` }))}
                selected={build.preparedSpells}
                max={derived.spellcasting.preparedMax}
                onChange={(v) => set({ preparedSpells: v })}
              />
            </View>
          ) : (
            <Notice>No spells to choose for this class at level 1.</Notice>
          ))}

        {current === "review" && (
          <View>
            <Field label="Character name" value={build.name} onChangeText={(v) => set({ name: v })} />
            {derived && <Body>{`AC ${derived.ac} · HP ${derived.maxHp} · Initiative ${derived.initiative >= 0 ? "+" : ""}${derived.initiative} · Speed ${derived.speed} ft`}</Body>}
            {issues.filter((i) => i.severity === "error").length > 0 && <Notice tone="danger">{issues.filter((i) => i.severity === "error").map((i) => `• ${i.message}`).join("\n")}</Notice>}
            {create.error && <Notice tone="danger">{errorText(create.error)}</Notice>}
            <Button label="Create the character" variant="accent" disabled={issues.some((i) => i.severity === "error")} loading={create.isPending} onPress={() => create.mutate()} />
          </View>
        )}

        {stepIssues.length > 0 && current !== "review" && <Notice tone="danger">{stepIssues.map((i) => `• ${i.message}`).join("\n")}</Notice>}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12, gap: 8 }}>
          <Button label="Previous" disabled={step === 0} onPress={() => go(step - 1)} />
          {step < STEPS.length - 1 && <Button label="Next" variant="primary" onPress={() => go(step + 1)} />}
        </View>
      </ScrollView>
    </Screen>
  );
}
