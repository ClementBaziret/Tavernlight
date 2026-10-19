import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ABILITIES, ABILITY_NAMES, applyLevelUp, derive, emptyState, validateBuild, type Ability, type AsiChoice, type LevelUpPreview, type RulesIndex } from "@tavernlight/engine";
import type { CharacterDto } from "@tavernlight/shared";
import { Alert, Button, ModalDialog, RadioGroup, Select, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { announce } from "@/lib/announce";
import { ChoicePicker, MultiPick } from "./ChoicePicker";

export function LevelUpDialog({ character, rules, isOpen, onOpenChange }: { character: CharacterDto; rules: RulesIndex; isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const build = character.build;
  const [subclass, setSubclass] = useState<string | undefined>(build.subclass);
  const [hpMethod, setHpMethod] = useState<"average" | "roll">("average");
  const [asiMode, setAsiMode] = useState<"two" | "one" | "feat">("two");
  const [asiA, setAsiA] = useState<Ability | null>(null);
  const [asiB, setAsiB] = useState<Ability | null>(null);
  const [feat, setFeat] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, string[]>>({});
  const [cantrips, setCantrips] = useState<string[]>(build.cantrips);
  const [prepared, setPrepared] = useState<string[]>(build.preparedSpells);

  useEffect(() => {
    if (isOpen) {
      setCantrips(build.cantrips);
      setPrepared(build.preparedSpells);
      setChoices({});
    }
  }, [isOpen, build.cantrips, build.preparedSpells]);

  const preview = useQuery({
    queryKey: ["levelup", character.id, subclass ?? ""],
    queryFn: () => api.get<LevelUpPreview>(`/characters/${character.id}/level-up${subclass ? `?subclass=${subclass}` : ""}`),
    enabled: isOpen,
  });

  const asi: AsiChoice | undefined = useMemo(() => {
    if (!preview.data?.asi) return undefined;
    if (asiMode === "feat") return feat ? { type: "feat", feat } : undefined;
    if (asiMode === "one") return asiA ? { type: "asi", increases: { [asiA]: 2 } } : undefined;
    return asiA && asiB ? { type: "asi", increases: { [asiA]: 1, [asiB]: 1 } } : undefined;
  }, [preview.data?.asi, asiMode, asiA, asiB, feat]);

  // Validate the next level locally with the same engine as the server.
  const nextBuild = preview.data ? applyLevelUp(build, { hp: { method: "average", value: preview.data.averageHp }, subclass, asi, choices, cantrips, preparedSpells: prepared }) : null;
  const issues = nextBuild ? validateBuild(nextBuild, rules).filter((i) => i.severity === "error" && i.path !== "name") : [];
  const nextDerived = nextBuild ? derive(nextBuild, emptyState(), rules) : null;

  const submit = useMutation({
    mutationFn: () => api.post<{ character: CharacterDto; hpRoll: number }>(`/characters/${character.id}/level-up`, { hp: { method: hpMethod }, subclass, asi, choices, cantrips, preparedSpells: prepared }),
    onSuccess: (r) => {
      client.setQueryData(["character", character.id], r.character);
      void client.invalidateQueries({ queryKey: ["characters"] });
      announce(t("levelup.done", "{{name}} reaches level {{level}}. Hit die: {{hp}}.", { name: build.name, level: r.character.build.level, hp: r.hpRoll }));
      onOpenChange(false);
    },
  });

  const p = preview.data;
  const cls = rules.class(build.class);
  const list = cls?.spellcasting?.list;

  return (
    <ModalDialog isOpen={isOpen} onOpenChange={onOpenChange} title={t("levelup.title", "Level up to {{n}}", { n: build.level + 1 })} size="lg">
      {preview.isLoading || !p ? (
        preview.error ? <Alert tone="danger">{errorMessage(preview.error)}</Alert> : <Spinner />
      ) : (
        <div className="flex flex-col gap-4">
          {(p.needsSubclass || build.level + 1 === cls?.subclassLevel) && !build.subclass && (
            <RadioGroup
              label={t("levelup.subclass", "Choose your subclass")}
              value={subclass ?? ""}
              onChange={setSubclass}
              options={p.subclassOptions.map((s) => ({ id: s.key, label: s.name, description: s.summary }))}
            />
          )}
          <RadioGroup
            label={t("levelup.hp", "Hit points (d{{die}} + Constitution {{con}})", { die: p.hitDie, con: p.conModifier })}
            orientation="horizontal"
            value={hpMethod}
            onChange={(v) => setHpMethod(v as "average" | "roll")}
            options={[
              { id: "average", label: t("levelup.average", "Take the average ({{n}})", { n: p.averageHp }) },
              { id: "roll", label: t("levelup.roll", "Roll the hit die (server)") },
            ]}
          />
          {p.features.length > 0 && (
            <div>
              <h3 className="font-semibold">{t("levelup.features", "New features")}</h3>
              <ul className="mt-1 flex flex-col gap-1">
                {p.features.map((f) => (
                  <li key={f.key}>
                    <details className="rounded-lg border border-line px-3 py-2">
                      <summary className="cursor-pointer font-medium">{f.name}</summary>
                      <p className="mt-1 whitespace-pre-line text-sm">{f.description}</p>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {p.asi && (
            <div className="flex flex-col gap-3 rounded-xl border border-line p-3">
              <RadioGroup
                label={t("levelup.asi", "Ability Score Improvement")}
                orientation="horizontal"
                value={asiMode}
                onChange={(v) => setAsiMode(v as "two" | "one" | "feat")}
                options={[
                  { id: "two", label: "+1 / +1" },
                  { id: "one", label: "+2" },
                  { id: "feat", label: t("levelup.feat", "A feat") },
                ]}
              />
              {asiMode !== "feat" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select label={asiMode === "one" ? "+2" : t("levelup.first", "+1 to")} value={asiA} onChange={(v) => setAsiA(v as Ability)} options={ABILITIES.map((a) => ({ id: a, label: ABILITY_NAMES[a] }))} />
                  {asiMode === "two" && <Select label={t("levelup.second", "+1 to")} value={asiB} onChange={(v) => setAsiB(v as Ability)} options={ABILITIES.map((a) => ({ id: a, label: ABILITY_NAMES[a], disabled: a === asiA }))} />}
                </div>
              ) : (
                <Select
                  label={t("levelup.chooseFeat", "Feat")}
                  value={feat}
                  onChange={setFeat}
                  options={(rules.data.feats ?? []).filter((f) => f.category === "general").map((f) => ({ id: f.key, label: f.name, description: f.description.split("\n")[0].slice(0, 120) }))}
                />
              )}
            </div>
          )}
          {nextBuild &&
            p.newChoices.map((c) => (
              <ChoicePicker key={c.id} scoped={c} rules={rules} derived={nextDerived} selected={choices[c.id] ?? []} onChange={(v) => setChoices({ ...choices, [c.id]: v })} />
            ))}
          {list && p.cantrips.after > 0 && (
            <MultiPick legend={t("wizard.cantrips", "Cantrips")} selected={cantrips} max={p.cantrips.after} onChange={setCantrips} searchable options={rules.spellsFor(list, 0, 0).map((s) => ({ id: s.key, label: s.name }))} />
          )}
          {list && p.prepared.after > 0 && (
            <MultiPick
              legend={t("wizard.prepared", "Prepared spells")}
              selected={prepared}
              max={p.prepared.after}
              onChange={setPrepared}
              searchable
              options={rules.spellsFor(list, p.maxSpellLevel, 1).map((s) => ({ id: s.key, label: s.name, description: `level ${s.level}` }))}
            />
          )}
          {issues.length > 0 && (
            <Alert tone="warning" title={t("levelup.todo", "Still to choose")}>
              <ul className="list-disc pl-5">
                {issues.map((i, n) => (
                  <li key={n}>{i.message}</li>
                ))}
              </ul>
            </Alert>
          )}
          {submit.error && <Alert tone="danger">{errorMessage(submit.error)}</Alert>}
          <Button variant="accent" onPress={() => submit.mutate()} isDisabled={issues.length > 0} loading={submit.isPending}>
            {t("levelup.confirm", "Confirm level {{n}}", { n: build.level + 1 })}
          </Button>
        </div>
      )}
    </ModalDialog>
  );
}
