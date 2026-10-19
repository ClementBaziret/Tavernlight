import { useQuery } from "@tanstack/react-query";
import { Dices } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { chanceAtLeast, DiceError, probabilities, type Probabilities } from "@tavernlight/dice";
import type { CampaignSummary, RollDto } from "@tavernlight/shared";
import { RollLine, RollPanel } from "@/components/RollPanel";
import { Alert, Button, Card, PageHeader, RadioGroup, Select, Switch, TextField } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { useRoll } from "@/lib/roll";

export function ProbabilityChart({ p, expression }: { p: Probabilities; expression: string }) {
  const { t } = useTranslation();
  const [table, setTable] = useState(false);
  const max = Math.max(...p.distribution.map((d) => d.probability));
  const points = p.distribution.length > 120 ? p.distribution.filter((_, i) => i % Math.ceil(p.distribution.length / 120) === 0) : p.distribution;
  const width = 640;
  const height = 180;
  const barW = width / points.length;
  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [t("dice.min", "Minimum"), p.min],
          [t("dice.max", "Maximum"), p.max],
          [t("dice.mean", "Average"), p.mean.toFixed(2)],
          [t("dice.stddev", "Standard deviation"), p.stdDev.toFixed(2)],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-lg bg-surface-2 p-2">
            <dt className="text-sm text-muted">{k}</dt>
            <dd className="text-xl font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {!p.exact && <p className="text-sm text-muted">{t("dice.estimated", "Estimated by simulation (the exact computation would be too large).")}</p>}
      <Switch isSelected={table} onChange={setTable}>
        {t("dice.showTable", "Show as a table")}
      </Switch>
      {table ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t("dice.distributionOf", "Distribution of {{e}}", { e: expression })}</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="py-1">{t("dice.result", "Result")}</th>
                <th scope="col">{t("dice.probability", "Probability")}</th>
                <th scope="col">{t("dice.atLeast", "At least")}</th>
              </tr>
            </thead>
            <tbody>
              {p.distribution.map((d) => (
                <tr key={d.value} className="border-b border-line">
                  <th scope="row" className="py-0.5 font-normal tabular-nums">{d.value}</th>
                  <td className="tabular-nums">{(d.probability * 100).toFixed(2)} %</td>
                  <td className="tabular-nums">{(chanceAtLeast(p, d.value) * 100).toFixed(1)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg viewBox={`0 0 ${width} ${height + 24}`} className="w-full" role="img" aria-label={t("dice.chartLabel", "Distribution of {{e}}: from {{min}} to {{max}}, average {{mean}}", { e: expression, min: p.min, max: p.max, mean: p.mean.toFixed(1) })}>
          {points.map((d, i) => {
            const h = (d.probability / max) * height;
            return (
              <rect key={d.value} x={i * barW + 1} y={height - h} width={Math.max(1, barW - 2)} height={h} className="fill-[var(--tl-brand)] dark:fill-[var(--tl-lantern)]">
                <title>
                  {d.value}: {(d.probability * 100).toFixed(2)} %
                </title>
              </rect>
            );
          })}
          <text x={0} y={height + 18} className="fill-[var(--tl-muted)] text-[12px]">
            {points[0]?.value}
          </text>
          <text x={width} y={height + 18} textAnchor="end" className="fill-[var(--tl-muted)] text-[12px]">
            {points[points.length - 1]?.value}
          </text>
        </svg>
      )}
    </div>
  );
}

export function DiceCheatSheet() {
  const { t } = useTranslation();
  const rows = [
    ["2d6+3", t("dice.cs1", "Roll two six-sided dice and add 3")],
    ["4d6kh3", t("dice.cs2", "Roll four d6, keep the 3 highest (kl: lowest, dh/dl: drop)")],
    ["1d20+5 adv", t("dice.cs3", "Advantage: roll 2d20 and keep the highest (dis: disadvantage)")],
    ["3d6!", t("dice.cs4", "Exploding dice: roll again on a 6 (!>=5 explodes on 5 or 6)")],
    ["2d6r1", t("dice.cs5", "Reroll 1s (ro1: reroll once; r<3 rerolls 1 and 2)")],
    ["2d6min3", t("dice.cs6", "Faces below 3 count as 3 (max: cap the faces)")],
    ["1d8+1d6+2", t("dice.cs7", "Several dice in one expression")],
    ["(1d6+2)*2", t("dice.cs8", "Parentheses, multiplication and division (rounded down)")],
    ["d%", t("dice.cs9", "Percentile die (1 to 100)")],
  ];
  return (
    <Card aria-labelledby="cheat-title">
      <h2 id="cheat-title" className="font-display text-lg font-semibold">
        {t("dice.cheat", "Dice notation cheat sheet")}
      </h2>
      <dl className="mt-2 flex flex-col gap-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-wrap gap-x-3">
            <dt className="w-28 font-mono font-semibold">{k}</dt>
            <dd className="text-muted">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function DicePage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const [expression, setExpression] = useState("1d20+5");
  const [label, setLabel] = useState("");
  const [adv, setAdv] = useState("normal");
  const [campaignId, setCampaignId] = useState<string>("none");
  const [visibility, setVisibility] = useState("public");
  const roll = useRoll();
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: () => api.get<CampaignSummary[]>("/campaigns"), enabled: !!me });
  const history = useQuery({
    queryKey: ["dice-history", campaignId],
    queryFn: () => api.get<RollDto[]>(`/dice/history${campaignId !== "none" ? `?campaignId=${campaignId}` : ""}`),
    enabled: !!me,
  });
  const advantage = adv === "normal" ? null : (adv as "advantage" | "disadvantage");
  const analysis = useMemo(() => {
    try {
      return { p: probabilities(expression, { advantage }), error: null as DiceError | null };
    } catch (e) {
      return { p: null, error: e instanceof DiceError ? e : new DiceError("unexpected_token", String(e)) };
    }
  }, [expression, advantage]);
  const role = campaigns.data?.find((c) => c.id === campaignId)?.role;

  const doRoll = (expr = expression) =>
    roll.mutate(
      { expression: expr, label: label || undefined, advantage, campaignId: campaignId === "none" ? undefined : campaignId, visibility: visibility as "public" | "private" | "hidden" },
      { onSuccess: () => void history.refetch() },
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("dice.title", "Dice")} subtitle={t("dice.subtitle", "Rolls are made by the server with a secure random generator: nobody can cheat.")} />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4">
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!analysis.error) doRoll();
              }}
            >
              <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
                <TextField
                  label={t("dice.expression", "Expression")}
                  value={expression}
                  onChange={setExpression}
                  inputClassName="font-mono text-lg"
                  error={analysis.error ? `${analysis.error.message}${analysis.error.hint ? ` ${t("dice.example", "Example")}: ${analysis.error.hint}` : ""}` : null}
                />
                <TextField label={t("dice.label", "Label (optional)")} value={label} onChange={setLabel} />
              </div>
              <RadioGroup
                label={t("sheet.d20Mode", "d20 rolls")}
                orientation="horizontal"
                value={adv}
                onChange={setAdv}
                options={[
                  { id: "normal", label: t("sheet.normal", "Normal") },
                  { id: "advantage", label: t("sheet.advantage", "Advantage") },
                  { id: "disadvantage", label: t("sheet.disadvantage", "Disadvantage") },
                ]}
              />
              {me && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    label={t("dice.campaign", "Campaign")}
                    value={campaignId}
                    onChange={setCampaignId}
                    options={[{ id: "none", label: t("dice.noCampaign", "None (personal roll)") }, ...(campaigns.data ?? []).map((c) => ({ id: c.id, label: c.name }))]}
                  />
                  {campaignId !== "none" && (
                    <Select
                      label={t("dice.visibility", "Who sees it")}
                      value={visibility}
                      onChange={setVisibility}
                      options={[
                        { id: "public", label: t("dice.public", "Everyone (public)") },
                        { id: "private", label: t("dice.privateGm", "Me and the game master (private)") },
                        ...(role === "gm" ? [{ id: "hidden", label: t("dice.hiddenGm", "Only me, the game master (hidden)") }] : []),
                      ]}
                    />
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="accent" isDisabled={!!analysis.error || !me} loading={roll.isPending}>
                  <Dices aria-hidden className="h-4 w-4" />
                  {me ? t("dice.roll", "Roll") : t("dice.loginToRoll", "Log in to roll")}
                </Button>
                {["d4", "d6", "d8", "d10", "d12", "d20", "d100"].map((d) => (
                  <Button key={d} size="sm" isDisabled={!me} onPress={() => doRoll(`1${d}`)}>
                    {d}
                  </Button>
                ))}
              </div>
            </form>
            {roll.error && <Alert tone="danger">{errorMessage(roll.error)}</Alert>}
          </Card>
          {analysis.p && (
            <Card aria-labelledby="proba-title">
              <h2 id="proba-title" className="mb-2 font-display text-lg font-semibold">
                {t("dice.probabilities", "Probabilities")}
              </h2>
              <ProbabilityChart p={analysis.p} expression={expression} />
            </Card>
          )}
          <DiceCheatSheet />
        </div>
        <div className="flex flex-col gap-6">
          <RollPanel />
          {me && (
            <Card aria-labelledby="history-title">
              <h2 id="history-title" className="mb-2 font-display text-lg font-semibold">
                {t("dice.history", "History")}
              </h2>
              <ol className="flex max-h-[32rem] flex-col gap-2 overflow-auto">
                {(history.data ?? []).map((r) => (
                  <li key={r.id}>
                    <RollLine roll={r} />
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
