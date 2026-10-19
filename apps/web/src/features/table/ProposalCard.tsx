import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Proposal, TargetOutcome } from "@tavernlight/engine";
import { Badge, Button, Card, Checkbox, NumberField } from "@/components/ui";

/**
 * Result computed by the server, shown before it is applied. The game
 * master can exclude targets, flip hits and saves, and change the damage.
 */
export function ProposalCard({ proposal, onApply, onDiscard, busy }: { proposal: Proposal; onApply: (p: Proposal) => void; onDiscard: () => void; busy: boolean }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Proposal>(proposal);
  useEffect(() => setDraft(proposal), [proposal]);

  const setTarget = (index: number, patch: Partial<TargetOutcome>) => setDraft((d) => ({ ...d, targets: d.targets.map((x, i) => (i === index ? { ...x, ...patch } : x)) }));

  return (
    <Card as="article" aria-labelledby={`prop-${proposal.id}`} className="flex flex-col gap-3 border-2 border-lantern">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`prop-${proposal.id}`} className="font-display text-lg font-semibold">
          {proposal.title}
        </h3>
        <Badge tone="accent">{t("proposal.pending", "To review")}</Badge>
      </header>
      {proposal.sharedRolls.map((r, i) => (
        <p key={i} className="font-mono text-sm">
          {r.label}: {r.breakdown.replace(/~~(\d+)~~/g, "($1)")}
        </p>
      ))}
      {proposal.cost?.slotLevel && <p className="text-sm text-muted">{t("proposal.slot", "Uses a level {{n}} spell slot", { n: proposal.cost.slotLevel })}</p>}
      {proposal.concentration && <p className="text-sm text-muted">{t("proposal.concentration", "Concentration: {{name}}", { name: proposal.concentration.name })}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-left text-sm">
          <caption className="sr-only">{t("proposal.targets", "Result for each target")}</caption>
          <thead>
            <tr className="border-b border-line text-muted">
              <th scope="col" className="py-1">{t("proposal.target", "Target")}</th>
              <th scope="col">{t("proposal.roll", "Roll")}</th>
              <th scope="col">{t("proposal.damage", "Damage")}</th>
              <th scope="col">{t("proposal.other", "Effects")}</th>
            </tr>
          </thead>
          <tbody>
            {draft.targets.map((target, i) => (
              <tr key={target.targetId} className="border-b border-line align-top">
                <th scope="row" className="py-1 font-medium">
                  <Checkbox isSelected={target.included} onChange={(v) => setTarget(i, { included: v })}>
                    {target.name}
                  </Checkbox>
                </th>
                <td className="py-1">
                  {target.attack && (
                    <div className="flex flex-col gap-1">
                      <span>
                        {target.attack.total} vs {t("common.ac", "AC")} {target.attack.ac} {target.attack.critical && <Badge tone="success">{t("roll.nat20", "Natural 20")}</Badge>}
                      </span>
                      <Checkbox isSelected={target.attack.hit} onChange={(hit) => setTarget(i, { attack: { ...target.attack!, hit }, totalDamage: hit ? target.damage.reduce((s, d) => s + d.final, 0) : 0 })}>
                        {target.attack.hit ? t("proposal.hit", "Hit") : t("proposal.miss", "Miss")}
                      </Checkbox>
                    </div>
                  )}
                  {target.save && (
                    <div className="flex flex-col gap-1">
                      <span>
                        {target.save.ability.toUpperCase()} {target.save.total} vs {t("proposal.dc", "DC")} {target.save.dc}
                      </span>
                      <Checkbox isSelected={target.save.success} onChange={(success) => setTarget(i, { save: { ...target.save!, success } })}>
                        {target.save.success ? t("proposal.success", "Success") : t("proposal.failure", "Failure")}
                      </Checkbox>
                    </div>
                  )}
                  {target.deathSave && (
                    <span>
                      {target.deathSave.total} → {t(`proposal.death.${target.deathSave.result}`, target.deathSave.result)}
                    </span>
                  )}
                  {target.concentrationCheck && (
                    <Checkbox isSelected={target.concentrationCheck.success} onChange={(success) => setTarget(i, { concentrationCheck: { ...target.concentrationCheck!, success } })}>
                      {t("proposal.conc", "Concentration CON {{total}} vs {{dc}}", { total: target.concentrationCheck.total, dc: target.concentrationCheck.dc })}
                    </Checkbox>
                  )}
                </td>
                <td className="w-40 py-1">
                  {target.damage.length > 0 || target.totalDamage > 0 ? (
                    <div className="flex flex-col gap-1">
                      {target.damage.map((d, n) => (
                        <span key={n} className="text-xs text-muted">
                          {d.amount} {d.damageType}
                          {d.half ? ` ÷2` : ""}
                          {d.multiplier === 0 ? ` (${t("proposal.immune", "immune")})` : d.multiplier < 1 ? ` (${t("proposal.resistant", "resistant")})` : d.multiplier > 1 ? ` (${t("proposal.vulnerable", "vulnerable")})` : ""}
                        </span>
                      ))}
                      <NumberField label={t("proposal.finalDamage", "Damage to {{name}}", { name: target.name })} hideLabel value={target.totalDamage} minValue={0} onChange={(v) => setTarget(i, { totalDamage: v })} />
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-1">
                  <ul className="flex flex-col gap-0.5">
                    {target.healing > 0 && (
                      <li>
                        <NumberField label={t("proposal.healing", "Healing")} value={target.healing} minValue={0} onChange={(v) => setTarget(i, { healing: v })} className="w-36" />
                      </li>
                    )}
                    {target.tempHp > 0 && <li>+{target.tempHp} {t("sheet.temp", "temp")}</li>}
                    {target.conditions.map((c, n) => (
                      <li key={`c${n}`}>
                        <Badge tone="danger">
                          {c.condition}
                          {c.remainingRounds ? ` · ${c.remainingRounds} ${t("proposal.rounds", "rounds")}` : ""}
                        </Badge>
                      </li>
                    ))}
                    {target.effects.map((e, n) => (
                      <li key={`e${n}`}>
                        <Badge tone="info">
                          {e.name}
                          {e.remainingRounds ? ` · ${e.remainingRounds} ${t("proposal.rounds", "rounds")}` : ""}
                        </Badge>
                      </li>
                    ))}
                    {target.notes.map((note, n) => (
                      <li key={`n${n}`} className="text-xs text-muted">
                        {note}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onPress={() => onApply(draft)} loading={busy}>
          <Check aria-hidden className="h-4 w-4" />
          {t("proposal.apply", "Apply")}
        </Button>
        <Button onPress={onDiscard}>
          <X aria-hidden className="h-4 w-4" />
          {t("proposal.discard", "Discard")}
        </Button>
      </div>
    </Card>
  );
}
