import { Dices } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { RollDto } from "@tavernlight/shared";
import { useRollFeed } from "@/lib/roll";
import { Badge, Card, cx } from "./ui";

export function RollLine({ roll, compact }: { roll: RollDto; compact?: boolean }) {
  const { t } = useTranslation();
  const crit = roll.result.critical;
  return (
    <div className={cx("flex flex-col gap-0.5", !compact && "rounded-lg border border-line p-2")}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">
          {roll.characterName ?? roll.userName}
          {roll.label && <span className="text-muted"> · {roll.label}</span>}
        </span>
        <span className="text-2xl font-bold tabular-nums">{roll.result.total}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span className="font-mono">{roll.result.breakdown.replace(/~~(\d+)~~/g, "($1)")}</span>
        {crit === "success" && <Badge tone="success">{t("roll.nat20", "Natural 20")}</Badge>}
        {crit === "failure" && <Badge tone="danger">{t("roll.nat1", "Natural 1")}</Badge>}
        {roll.visibility !== "public" && <Badge tone="info">{roll.visibility === "private" ? t("roll.private", "Private") : t("roll.hidden", "Hidden")}</Badge>}
      </div>
    </div>
  );
}

/** Recent rolls of this browser; the newest one is animated (unless reduced motion). */
export function RollPanel({ className }: { className?: string }) {
  const { t } = useTranslation();
  const rolls = useRollFeed((s) => s.rolls);
  return (
    <Card className={cx("flex flex-col gap-2", className)} aria-labelledby="roll-panel-title">
      <h2 id="roll-panel-title" className="flex items-center gap-2 font-display text-lg font-semibold">
        <Dices aria-hidden className="h-5 w-5" />
        {t("roll.recent", "Recent rolls")}
      </h2>
      {rolls.length === 0 ? (
        <p className="text-sm text-muted">{t("roll.none", "Click a skill, a save or an attack to roll.")}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rolls.slice(0, 6).map((r, i) => (
            <li key={r.id} className={i === 0 ? "animate-roll" : undefined}>
              <RollLine roll={r} />
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
