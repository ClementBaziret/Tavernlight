import { useState } from "react";
import { useTranslation } from "react-i18next";
import { validate } from "@tavernlight/dice";
import type { Combatant, Effect } from "@tavernlight/engine";
import { Alert, Button, Card, NumberField, Select, TextArea, TextField } from "@/components/ui";
import { MultiPick } from "@/features/character/ChoicePicker";

const DAMAGE_TYPES = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
const CONDITIONS = ["blinded", "charmed", "deafened", "frightened", "grappled", "incapacitated", "invisible", "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious"];

type Kind = "condition" | "damage" | "heal" | "tempHp" | "modifier" | "custom";

/**
 * "Add an effect": anything the rules data doesn't cover, on one or more
 * targets. The result goes through the same preview → apply → undo flow.
 */
export function EffectForm({ combatants, defaultTargets, onSubmit, busy }: { combatants: Combatant[]; defaultTargets: string[]; onSubmit: (targetIds: string[], effect: Effect, title: string) => Promise<void>; busy: boolean }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<Kind>("custom");
  const [targets, setTargets] = useState<string[]>(defaultTargets);
  const [condition, setCondition] = useState("prone");
  const [dice, setDice] = useState("1d4");
  const [damageType, setDamageType] = useState("fire");
  const [rounds, setRounds] = useState(2);
  const [modTarget, setModTarget] = useState("ac");
  const [modValue, setModValue] = useState("2");
  const [name, setName] = useState("On fire");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState("startOfTurn");
  const [periodic, setPeriodic] = useState("damage");
  const [error, setError] = useState<string | null>(null);

  const duration = rounds > 0 ? ({ type: "rounds", value: rounds } as const) : undefined;

  const submit = async () => {
    setError(null);
    if (!targets.length) return setError(t("effect.noTarget", "Choose at least one target."));
    const needsDice = kind === "damage" || kind === "heal" || kind === "tempHp" || (kind === "custom" && periodic !== "none");
    if (needsDice) {
      const err = validate(dice);
      if (err) return setError(err.message);
    }
    let effect: Effect;
    let title: string;
    switch (kind) {
      case "condition":
        effect = { type: "condition", condition, duration };
        title = condition;
        break;
      case "damage":
        effect = { type: "damage", dice, damageType };
        title = `${dice} ${damageType}`;
        break;
      case "heal":
        effect = { type: "heal", dice };
        title = `${t("effect.heal", "Healing")} ${dice}`;
        break;
      case "tempHp":
        effect = { type: "tempHp", dice };
        title = `${t("effect.tempHp", "Temporary HP")} ${dice}`;
        break;
      case "modifier":
        effect = { type: "modifier", target: modTarget as "ac", value: Number.isNaN(Number(modValue)) ? modValue : Number(modValue), name: name || `${modTarget} ${modValue}`, duration };
        title = name || `${modTarget} ${modValue}`;
        break;
      case "custom":
        effect = {
          type: "custom",
          name: name || t("effect.free", "Free effect"),
          description,
          trigger: trigger as "startOfTurn",
          effects: periodic === "damage" ? [{ type: "damage", dice, damageType }] : periodic === "heal" ? [{ type: "heal", dice }] : [],
          duration,
        };
        title = name;
        break;
    }
    try {
      await onSubmit(targets, effect, title);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card as="section" aria-labelledby="effect-form-title" className="flex flex-col gap-3">
      <h2 id="effect-form-title" className="font-display text-lg font-semibold">
        {t("effect.title", "Add an effect")}
      </h2>
      <Select
        label={t("effect.kind", "Type")}
        value={kind}
        onChange={(v) => setKind(v as Kind)}
        options={[
          { id: "custom", label: t("effect.custom", "Free effect (name, trigger, duration)") },
          { id: "condition", label: t("effect.condition", "Condition") },
          { id: "damage", label: t("effect.damage", "Damage") },
          { id: "heal", label: t("effect.heal", "Healing") },
          { id: "tempHp", label: t("effect.tempHp", "Temporary HP") },
          { id: "modifier", label: t("effect.modifier", "Temporary modifier") },
        ]}
      />
      <MultiPick legend={t("effect.targets", "Targets")} options={combatants.map((c) => ({ id: c.id, label: c.name }))} selected={targets} max={combatants.length} onChange={setTargets} columns={false} />
      {kind === "condition" && <Select label={t("effect.condition", "Condition")} value={condition} onChange={setCondition} options={CONDITIONS.map((c) => ({ id: c, label: c }))} />}
      {(kind === "custom" || kind === "modifier") && <TextField label={t("effect.name", "Name")} value={name} onChange={setName} />}
      {kind === "custom" && (
        <>
          <TextArea label={t("effect.description", "Description")} value={description} onChange={setDescription} rows={2} />
          <Select
            label={t("effect.trigger", "Trigger")}
            value={trigger}
            onChange={setTrigger}
            options={[
              { id: "startOfTurn", label: t("effect.startOfTurn", "At the start of the target's turn") },
              { id: "endOfTurn", label: t("effect.endOfTurn", "At the end of the target's turn") },
              { id: "none", label: t("effect.noTrigger", "No trigger (reminder only)") },
            ]}
          />
          <Select
            label={t("effect.periodic", "Each time it triggers")}
            value={periodic}
            onChange={setPeriodic}
            options={[
              { id: "damage", label: t("effect.damage", "Damage") },
              { id: "heal", label: t("effect.heal", "Healing") },
              { id: "none", label: t("effect.nothing", "Nothing automatic") },
            ]}
          />
        </>
      )}
      {(kind === "damage" || kind === "heal" || kind === "tempHp" || (kind === "custom" && periodic !== "none")) && (
        <div className="grid grid-cols-2 gap-2">
          <TextField label={t("effect.dice", "Dice")} value={dice} onChange={setDice} inputClassName="font-mono" />
          {(kind === "damage" || (kind === "custom" && periodic === "damage")) && <Select label={t("effect.damageType", "Damage type")} value={damageType} onChange={setDamageType} options={DAMAGE_TYPES.map((d) => ({ id: d, label: d }))} />}
        </div>
      )}
      {kind === "modifier" && (
        <div className="grid grid-cols-2 gap-2">
          <Select
            label={t("effect.modTarget", "Applies to")}
            value={modTarget}
            onChange={setModTarget}
            options={[
              { id: "ac", label: t("common.ac", "AC") },
              { id: "attack", label: t("effect.attackRolls", "Attack rolls") },
              { id: "save", label: t("effect.saves", "Saving throws") },
              { id: "damage", label: t("effect.damageRolls", "Damage") },
            ]}
          />
          <TextField label={t("effect.value", "Value (number or dice)")} value={modValue} onChange={setModValue} inputClassName="font-mono" />
        </div>
      )}
      {(kind === "condition" || kind === "modifier" || kind === "custom") && (
        <NumberField label={t("effect.rounds", "Duration in rounds (0 = until removed)")} value={rounds} minValue={0} maxValue={1000} onChange={setRounds} />
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      <Button variant="accent" onPress={submit} loading={busy}>
        {t("effect.preview", "Preview the effect")}
      </Button>
    </Card>
  );
}
