import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { DiceError, probabilities } from "@tavernlight/dice";
import type { RollDto } from "@tavernlight/shared";
import { errorText } from "../src/api";
import { describeRoll, useRoll } from "../src/roll";
import { useTheme } from "../src/theme";
import { Body, Button, Card, Field, Notice, OptionRow, Screen, Stat, Title } from "../src/ui";

export default function Dice() {
  const t = useTheme();
  const [expression, setExpression] = useState("1d20+5");
  const [mode, setMode] = useState<"normal" | "advantage" | "disadvantage">("normal");
  const [history, setHistory] = useState<RollDto[]>([]);
  const roll = useRoll((r) => setHistory((h) => [r, ...h].slice(0, 20)));
  const advantage = mode === "normal" ? null : mode;
  const analysis = useMemo(() => {
    try {
      return { p: probabilities(expression, { advantage, samples: 20000 }), error: null as string | null };
    } catch (e) {
      return { p: null, error: e instanceof DiceError ? `${e.message}${e.hint ? ` Example: ${e.hint}` : ""}` : String(e) };
    }
  }, [expression, advantage]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Title>Dice</Title>
        <Body muted>Rolled by the server with a secure generator.</Body>
        <Field label="Expression" value={expression} onChangeText={setExpression} autoCapitalize="none" autoCorrect={false} error={analysis.error} />
        <View accessibilityRole="radiogroup" accessibilityLabel="d20 rolls">
          {(["normal", "advantage", "disadvantage"] as const).map((m) => (
            <OptionRow key={m} label={m[0].toUpperCase() + m.slice(1)} selected={mode === m} onPress={() => setMode(m)} />
          ))}
        </View>
        <Button label="Roll" variant="accent" onPress={() => roll.mutate({ expression, advantage })} disabled={!!analysis.error} loading={roll.isPending} style={{ marginVertical: 8 }} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {["d4", "d6", "d8", "d10", "d12", "d20", "d100"].map((d) => (
            <Button key={d} label={d} onPress={() => roll.mutate({ expression: `1${d}` })} />
          ))}
        </View>
        {roll.error && <Notice tone="danger">{errorText(roll.error)}</Notice>}
        {analysis.p && (
          <Card>
            <Title level={3}>Probabilities</Title>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              <Stat label="Minimum" value={analysis.p.min} />
              <Stat label="Maximum" value={analysis.p.max} />
              <Stat label="Average" value={analysis.p.mean.toFixed(1)} />
            </View>
          </Card>
        )}
        <Title level={2}>Results</Title>
        {history.map((r) => (
          <Card key={r.id}>
            <Text accessibilityLabel={describeRoll(r)} style={{ color: t.text, fontSize: 28, fontWeight: "700" }}>
              {r.result.total}
            </Text>
            <Text style={{ color: t.muted, fontFamily: "monospace" }}>{r.result.breakdown.replace(/~~(\d+)~~/g, "($1)")}</Text>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
