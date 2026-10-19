import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ABILITY_NAMES, type DerivedCharacter, type RulesIndex, type ScopedChoice } from "@tavernlight/engine";
import { Checkbox, cx, TextField } from "@/components/ui";

export interface PickOption {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

/** Checkbox list limited to `max` selected entries (announced count). */
export function MultiPick(props: {
  legend: string;
  options: PickOption[];
  selected: string[];
  max: number;
  onChange: (v: string[]) => void;
  searchable?: boolean;
  columns?: boolean;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const full = props.selected.length >= props.max;
  const shown = query ? props.options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : props.options;
  return (
    <fieldset className="flex flex-col gap-2 rounded-xl border border-line p-3">
      <legend className="px-1 font-semibold">
        {props.legend}{" "}
        <span className={cx("ml-1 text-sm font-normal", props.selected.length === props.max ? "text-success" : "text-muted")}>
          {t("choice.count", "{{n}} of {{max}} chosen", { n: props.selected.length, max: props.max })}
        </span>
      </legend>
      {props.searchable && props.options.length > 12 && <TextField label={t("choice.filter", "Filter")} value={query} onChange={setQuery} className="max-w-xs" />}
      <div className={cx("grid gap-x-4", props.columns !== false && "sm:grid-cols-2 lg:grid-cols-3")}>
        {shown.map((o) => {
          const checked = props.selected.includes(o.id);
          return (
            <Checkbox
              key={o.id}
              isSelected={checked}
              isDisabled={o.disabled || (!checked && full)}
              onChange={(v) => props.onChange(v ? [...props.selected, o.id].slice(-props.max) : props.selected.filter((x) => x !== o.id))}
            >
              <span className="flex flex-col py-1">
                <span>{o.label}</span>
                {o.description && <span className="text-sm text-muted">{o.description}</span>}
              </span>
            </Checkbox>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Options for a choice coming from the rules data (feature, feat, species trait). */
export function choiceOptions(scoped: ScopedChoice, rules: RulesIndex, derived: DerivedCharacter | null): PickOption[] {
  const c = scoped.choice;
  switch (c.kind) {
    case "skill":
      return (c.from === "any" ? rules.skills.map((s) => s.key) : c.from).map((key) => {
        const s = rules.skill(key);
        return { id: key, label: s?.name ?? key, description: s ? ABILITY_NAMES[s.ability] : undefined };
      });
    case "expertise":
      return (derived?.skills ?? []).filter((s) => s.proficient).map((s) => ({ id: s.key, label: s.name }));
    case "feat":
      return c.from.map((key) => {
        const f = rules.feat(key);
        return { id: key, label: f?.name ?? key, description: f?.description.split("\n")[0].slice(0, 160) };
      });
    case "spells":
      return rules.spellsFor(c.spellList, c.level, c.level).map((s) => ({ id: s.key, label: s.name, description: `${s.school}${s.concentration ? " · C" : ""}` }));
    case "option":
      return c.from.map((o) => ({ id: o.key, label: o.name, description: o.description }));
    case "ability":
      return c.from.map((a) => ({ id: a, label: ABILITY_NAMES[a] }));
  }
}

export function ChoicePicker({ scoped, rules, derived, selected, onChange }: { scoped: ScopedChoice; rules: RulesIndex; derived: DerivedCharacter | null; selected: string[]; onChange: (v: string[]) => void }) {
  return (
    <MultiPick
      legend={`${scoped.choice.label} (${scoped.source})`}
      options={choiceOptions(scoped, rules, derived)}
      selected={selected}
      max={scoped.choice.count}
      onChange={onChange}
      searchable={scoped.choice.kind === "spells" || scoped.choice.kind === "skill"}
    />
  );
}
