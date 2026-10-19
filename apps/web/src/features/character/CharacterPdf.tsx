import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { ABILITIES, ABILITY_NAMES, type RulesIndex } from "@tavernlight/engine";
import type { CharacterDto } from "@tavernlight/shared";

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica", color: "#1d1b16" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#1b2140" },
  subtitle: { fontSize: 10, marginBottom: 10, color: "#5b5446" },
  row: { flexDirection: "row", gap: 8 },
  box: { border: "1pt solid #8c8270", borderRadius: 4, padding: 6, marginBottom: 8 },
  h: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 4, color: "#1b2140" },
  stat: { flex: 1, border: "1pt solid #8c8270", borderRadius: 4, padding: 4, alignItems: "center" },
  big: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  small: { fontSize: 8, color: "#5b5446" },
  footer: { position: "absolute", bottom: 16, left: 28, right: 28, fontSize: 7, color: "#5b5446" },
});

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

function Sheet({ c, rules }: { c: CharacterDto; rules: RulesIndex }) {
  const d = c.derived;
  const b = c.build;
  return (
    <Document title={`${b.name} — Tavernlight`} author="Tavernlight">
      <Page size="A4" style={s.page}>
        <Text style={s.title}>{b.name}</Text>
        <Text style={s.subtitle}>
          {rules.species(b.species)?.name} · {rules.class(b.class)?.name} {b.level}
          {b.subclass ? ` (${rules.subclass(b.subclass)?.name})` : ""} · {rules.background(b.background)?.name}
        </Text>
        <View style={[s.row, { marginBottom: 8 }]}>
          {[
            ["Armor Class", String(d.ac)],
            ["Hit Points", `${d.currentHp} / ${d.maxHp}`],
            ["Initiative", signed(d.initiative)],
            ["Speed", `${d.speed} ft`],
            ["Proficiency", signed(d.proficiencyBonus)],
            ["Passive Perception", String(d.passivePerception)],
          ].map(([k, v]) => (
            <View key={k} style={s.stat}>
              <Text style={s.big}>{v}</Text>
              <Text style={s.small}>{k}</Text>
            </View>
          ))}
        </View>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <View style={s.box}>
              <Text style={s.h}>Abilities</Text>
              {ABILITIES.map((a) => (
                <Text key={a}>
                  {ABILITY_NAMES[a]}: {d.abilities[a].score} ({signed(d.abilities[a].modifier)}) · save {signed(d.abilities[a].save)}
                  {d.abilities[a].saveProficient ? " •" : ""}
                </Text>
              ))}
            </View>
            <View style={s.box}>
              <Text style={s.h}>Skills</Text>
              {d.skills.map((sk) => (
                <Text key={sk.key}>
                  {sk.expertise ? "•• " : sk.proficient ? "• " : "   "}
                  {sk.name} ({sk.ability.toUpperCase()}) {signed(sk.bonus)}
                </Text>
              ))}
            </View>
          </View>
          <View style={{ flex: 1.3 }}>
            <View style={s.box}>
              <Text style={s.h}>Attacks and actions</Text>
              {d.actions.slice(0, 18).map((a) => (
                <Text key={a.key}>
                  {a.name}
                  {a.resolution.type === "attack" ? ` · attack ${typeof a.resolution.bonus === "number" ? signed(a.resolution.bonus) : signed(d.variables.spell_attack)}` : ""}
                  {a.resolution.type === "save" ? ` · ${a.resolution.ability.toUpperCase()} save DC ${typeof a.resolution.dc === "number" ? a.resolution.dc : d.variables.spell_dc}` : ""}
                </Text>
              ))}
            </View>
            {d.spellcasting && (
              <View style={s.box}>
                <Text style={s.h}>Spellcasting</Text>
                <Text>
                  {ABILITY_NAMES[d.spellcasting.ability]} · DC {d.spellcasting.saveDc} · attack {signed(d.spellcasting.attackBonus)}
                </Text>
                <Text>
                  Slots:{" "}
                  {d.spellcasting.slots
                    .map((n, i) => (i > 0 && n > 0 ? `L${i} ${n - (c.state.slotsUsed[i] ?? 0)}/${n}` : null))
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
                <Text>Cantrips: {b.cantrips.map((k) => rules.spell(k)?.name ?? k).join(", ") || "—"}</Text>
                <Text>Prepared: {[...b.preparedSpells, ...d.spellcasting.alwaysPrepared].map((k) => rules.spell(k)?.name ?? k).join(", ") || "—"}</Text>
              </View>
            )}
            <View style={s.box}>
              <Text style={s.h}>Features</Text>
              {d.features.map((f, i) => (
                <Text key={`${f.key}${i}`}>
                  {f.name} ({f.source})
                </Text>
              ))}
            </View>
            <View style={s.box}>
              <Text style={s.h}>Equipment</Text>
              <Text>{c.state.inventory.map((i) => `${i.quantity > 1 ? `${i.quantity} × ` : ""}${i.name}${i.equipped ? " (equipped)" : ""}`).join(", ")}</Text>
              <Text>
                Money: {c.state.currency.pp} pp, {c.state.currency.gp} gp, {c.state.currency.ep} ep, {c.state.currency.sp} sp, {c.state.currency.cp} cp
              </Text>
            </View>
          </View>
        </View>
        {c.state.notes ? (
          <View style={s.box}>
            <Text style={s.h}>Notes</Text>
            <Text>{c.state.notes}</Text>
          </View>
        ) : null}
        <Text style={s.footer} fixed>
          Tavernlight — compatible with the 5th edition. {rules.data.version?.attribution}
        </Text>
      </Page>
    </Document>
  );
}

export async function downloadCharacterPdf(c: CharacterDto, rules: RulesIndex) {
  const blob = await pdf(<Sheet c={c} rules={rules} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${c.build.name.replace(/[^\w-]+/g, "_")}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
