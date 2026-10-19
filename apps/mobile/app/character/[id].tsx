import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { AccessibilityInfo, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ABILITIES, ABILITY_NAMES, cantripTier, multiplyDice, type ActionDef } from "@tavernlight/engine";
import type { CharacterAction, CharacterDto, RollDto } from "@tavernlight/shared";
import { api, errorText } from "../../src/api";
import { describeRoll, useRoll } from "../../src/roll";
import { TOUCH, useTheme } from "../../src/theme";
import { Body, Button, Card, Loading, Notice, OptionRow, Screen, Stat, Title } from "../../src/ui";

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

function damageOf(a: ActionDef): string | null {
  const e = [...(a.onHit ?? []), ...(a.onFail ?? []), ...(a.effects ?? [])].find((x) => x.type === "damage");
  return e && e.type === "damage" ? String(e.dice) : null;
}

function RollRow({ label, bonus, sub, onPress }: { label: string; bonus: string; sub?: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${bonus}${sub ? `, ${sub}` : ""}`}
      accessibilityHint="Rolls the dice"
      onPress={onPress}
      style={{ minHeight: TOUCH, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, borderBottomWidth: 1, borderColor: t.line }}
    >
      <View>
        <Text style={{ color: t.text, fontSize: 16 }}>{label}</Text>
        {sub ? <Text style={{ color: t.muted, fontSize: 13 }}>{sub}</Text> : null}
      </View>
      <Text style={{ color: t.text, fontSize: 18, fontWeight: "700" }}>{bonus}</Text>
    </Pressable>
  );
}

export default function CharacterSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const client = useQueryClient();
  const [last, setLast] = useState<RollDto | null>(null);
  const [amount, setAmount] = useState("5");
  const [mode, setMode] = useState<"normal" | "advantage" | "disadvantage">("normal");
  const character = useQuery({ queryKey: ["character", id], queryFn: () => api.get<CharacterDto>(`/characters/${id}`) });
  const roll = useRoll(setLast);
  const act = useMutation({
    mutationFn: (a: CharacterAction) => api.post<{ character: CharacterDto }>(`/characters/${id}/actions`, a),
    onSuccess: (r) => {
      client.setQueryData(["character", id], r.character);
      void client.invalidateQueries({ queryKey: ["characters"] });
      AccessibilityInfo.announceForAccessibility(`Hit points ${r.character.derived.currentHp} of ${r.character.derived.maxHp}`);
    },
  });

  if (character.isLoading) return <Loading />;
  if (!character.data) return <Notice tone="danger">{errorText(character.error)}</Notice>;
  const { build, state, derived: d } = character.data;
  const advantage = mode === "normal" ? null : mode;
  const d20 = (bonus: number, label: string) => roll.mutate({ expression: `1d20 ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)}`, label, characterId: id, advantage });
  const value = Math.max(0, Number(amount) || 0);

  return (
    <Screen>
      <Stack.Screen options={{ title: build.name }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Title>{build.name}</Title>
        <Body muted>
          Level {build.level} {build.class} · {build.species} · {build.background}
        </Body>
        {last && (
          <Card style={{ borderColor: t.lantern, borderWidth: 2 }}>
            <Text accessibilityLiveRegion="polite" style={{ color: t.text, fontSize: 18 }}>
              {describeRoll(last)}
            </Text>
            <Text style={{ color: t.muted, fontFamily: "monospace" }}>{last.result.breakdown.replace(/~~(\d+)~~/g, "($1)")}</Text>
          </Card>
        )}
        {roll.error && <Notice tone="danger">{errorText(roll.error)}</Notice>}
        {act.error && <Notice tone="danger">{errorText(act.error)}</Notice>}

        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          <Stat label="Armor class" value={d.ac} />
          <Stat label="Hit points" value={`${d.currentHp}/${d.maxHp}${state.tempHp ? ` +${state.tempHp}` : ""}`} />
          <Stat label="Speed" value={`${d.speed} ft`} />
          <Stat label="Proficiency" value={signed(d.proficiencyBonus)} />
        </View>

        <Card>
          <Title level={2}>Hit points</Title>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <TextInput
              accessibilityLabel="Amount"
              keyboardType="number-pad"
              value={amount}
              onChangeText={setAmount}
              style={{ minHeight: TOUCH, minWidth: 80, borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 12, color: t.text, fontSize: 18 }}
            />
            <Button label="Damage" variant="danger" onPress={() => act.mutate({ type: "damage", amount: value })} />
            <Button label="Heal" variant="primary" onPress={() => act.mutate({ type: "heal", amount: value })} />
            <Button label="Temp HP" onPress={() => act.mutate({ type: "tempHp", amount: value })} />
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <Button label="Short rest (1 hit die)" onPress={() => act.mutate({ type: "shortRest", hitDice: 1 })} />
            <Button label="Long rest" onPress={() => act.mutate({ type: "longRest" })} />
          </View>
          {d.currentHp === 0 && (
            <View style={{ marginTop: 8 }}>
              <Body>
                Death saves: {state.deathSaves.successes} successes, {state.deathSaves.failures} failures
              </Body>
              <Button label="Roll a death saving throw" onPress={() => roll.mutate({ expression: "1d20", label: "Death saving throw", characterId: id })} />
            </View>
          )}
        </Card>

        <View accessibilityRole="radiogroup" accessibilityLabel="d20 rolls">
          {(["normal", "advantage", "disadvantage"] as const).map((m) => (
            <OptionRow key={m} label={`d20: ${m}`} selected={mode === m} onPress={() => setMode(m)} />
          ))}
        </View>

        <Card style={{ padding: 0 }}>
          <View style={{ padding: 12 }}>
            <Title level={2}>Abilities and saves</Title>
          </View>
          {ABILITIES.map((a) => (
            <View key={a}>
              <RollRow label={`${ABILITY_NAMES[a]} ${d.abilities[a].score}`} bonus={signed(d.abilities[a].modifier)} sub="check" onPress={() => d20(d.abilities[a].modifier, `${ABILITY_NAMES[a]} check`)} />
              <RollRow label={`${ABILITY_NAMES[a]} save`} bonus={signed(d.abilities[a].save)} sub={d.abilities[a].saveProficient ? "proficient" : undefined} onPress={() => d20(d.abilities[a].save, `${ABILITY_NAMES[a]} save`)} />
            </View>
          ))}
          <RollRow label="Initiative" bonus={signed(d.initiative)} onPress={() => d20(d.initiative, "Initiative")} />
        </Card>

        <Card style={{ padding: 0 }}>
          <View style={{ padding: 12 }}>
            <Title level={2}>Skills</Title>
          </View>
          {d.skills.map((s) => (
            <RollRow key={s.key} label={s.name} bonus={signed(s.bonus)} sub={s.expertise ? "expertise" : s.proficient ? "proficient" : undefined} onPress={() => d20(s.bonus, s.name)} />
          ))}
        </Card>

        <Card>
          <Title level={2}>Attacks and actions</Title>
          {d.actions.map((a) => {
            const dmg = damageOf(a);
            const scaled = dmg && a.cantripScaling ? multiplyDice(dmg, cantripTier(d.level)) : dmg;
            return (
              <View key={a.key} style={{ borderBottomWidth: 1, borderColor: t.line, paddingVertical: 6 }}>
                <Text style={{ color: t.text, fontSize: 16, fontWeight: "600" }}>{a.name}</Text>
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                  {a.resolution.type === "attack" && (
                    <Button label={`Attack ${typeof a.resolution.bonus === "number" ? signed(a.resolution.bonus) : signed(d.variables.spell_attack)}`} variant="primary" onPress={() => a.resolution.type === "attack" && roll.mutate({ expression: `1d20 + ${a.resolution.bonus}`, label: `${a.name} attack`, characterId: id, advantage })} />
                  )}
                  {a.resolution.type === "save" && <Body muted>{`${a.resolution.ability.toUpperCase()} save DC ${typeof a.resolution.dc === "number" ? a.resolution.dc : d.variables.spell_dc}`}</Body>}
                  {scaled && <Button label={`Damage ${scaled}`} onPress={() => roll.mutate({ expression: scaled, label: `${a.name} damage`, characterId: id })} />}
                </View>
              </View>
            );
          })}
        </Card>

        {d.spellcasting && (
          <Card>
            <Title level={2}>Spell slots</Title>
            <Body muted>{`Save DC ${d.spellcasting.saveDc} · attack ${signed(d.spellcasting.attackBonus)}`}</Body>
            {d.spellcasting.slots.map((n, level) =>
              level > 0 && n > 0 ? (
                <View key={level} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <Text style={{ color: t.text, fontSize: 16, flex: 1 }} accessibilityLabel={`Level ${level}: ${n - (state.slotsUsed[level] ?? 0)} of ${n} slots left`}>
                    Level {level}: {n - (state.slotsUsed[level] ?? 0)}/{n}
                  </Text>
                  <Button label="Use" accessibilityHint={`Uses a level ${level} slot`} onPress={() => act.mutate({ type: "slot", level, delta: 1 })} />
                  <Button label="Recover" onPress={() => act.mutate({ type: "slot", level, delta: -1 })} />
                </View>
              ) : null,
            )}
          </Card>
        )}

        {d.resources.length > 0 && (
          <Card>
            <Title level={2}>Resources</Title>
            {d.resources.map((r) => (
              <View key={r.key} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                <Text style={{ color: t.text, fontSize: 16, flex: 1 }}>
                  {r.name}: {r.max - r.used}/{r.max}
                </Text>
                <Button label="Use" onPress={() => act.mutate({ type: "resource", key: r.key, delta: 1 })} />
                <Button label="Recover" onPress={() => act.mutate({ type: "resource", key: r.key, delta: -1 })} />
              </View>
            ))}
          </Card>
        )}

        <Card>
          <Title level={2}>Inventory</Title>
          {state.inventory.map((i) => (
            <OptionRow
              key={i.id}
              multiple
              label={`${i.quantity > 1 ? `${i.quantity} × ` : ""}${i.name}`}
              description={i.equipped ? "Equipped" : "Not equipped"}
              selected={i.equipped}
              onPress={() => act.mutate({ type: "inventory", inventory: state.inventory.map((x) => (x.id === i.id ? { ...x, equipped: !x.equipped } : x)) })}
            />
          ))}
          <Body muted>{`Money: ${state.currency.gp} gp, ${state.currency.sp} sp, ${state.currency.cp} cp · carried ${d.carried.weight}/${d.carried.capacity} lb`}</Body>
        </Card>

        <Card>
          <Title level={2}>Features</Title>
          {d.features.map((f, i) => (
            <Body key={`${f.key}${i}`}>{`• ${f.name} (${f.source})`}</Body>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}
