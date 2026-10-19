import { useTranslation } from "react-i18next";
import { cellFromIndex, cellLabel, distanceFeet, type GridDef } from "@tavernlight/engine";
import { cx } from "@/components/ui";
import { distance } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import type { CanvasToken } from "./MapCanvas";
import { TERRAINS } from "./MapCanvas";

/** Rows of revealed cells summarised as ranges, e.g. "row 7: B–J". */
function revealedSummary(grid: GridDef, revealed: Set<number> | null): string[] {
  if (!revealed) return [];
  const rows = new Map<number, number[]>();
  for (const i of revealed) {
    const c = cellFromIndex(grid, i);
    rows.set(c.row, [...(rows.get(c.row) ?? []), c.col]);
  }
  const out: string[] = [];
  for (const [row, cols] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    cols.sort((a, b) => a - b);
    const ranges: string[] = [];
    let start = cols[0];
    let prev = cols[0];
    for (const col of [...cols.slice(1), Infinity]) {
      if (col !== prev + 1) {
        const a = cellLabel({ col: start, row }).replace(/\d+$/, "");
        const b = cellLabel({ col: prev, row }).replace(/\d+$/, "");
        ranges.push(a === b ? a : `${a}–${b}`);
        start = col;
      }
      prev = col;
    }
    out.push(`${row + 1}: ${ranges.join(", ")}`);
  }
  return out;
}

export interface TextViewToken extends CanvasToken {
  status?: string;
  current?: boolean;
}

export function MapTextView(props: {
  id?: string;
  grid: GridDef;
  tokens: TextViewToken[];
  terrain: (string | null)[];
  revealed: Set<number> | null;
  selectedTokenId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
  doors?: { id: string; open: boolean; label: string }[];
  onToggleDoor?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const units = useSettings((s) => s.units);
  const selected = props.tokens.find((x) => x.id === props.selectedTokenId);
  const terrains = new Map<string, number>();
  props.terrain.forEach((x, i) => {
    if (x && (!props.revealed || props.revealed.has(i))) terrains.set(x, (terrains.get(x) ?? 0) + 1);
  });
  const rows = revealedSummary(props.grid, props.revealed);
  return (
    <section id={props.id} aria-label={t("textview.title", "Map in text")} className={cx("flex flex-col gap-3", props.className)}>
      <h2 className="font-display text-lg font-semibold">{t("textview.title", "Map in text")}</h2>
      <p className="text-sm text-muted">
        {t("textview.grid", "{{type}} grid of {{cols}} × {{rows}} cells, {{ft}} per cell. Columns are letters (A = left), rows are numbers (1 = top).", {
          type: props.grid.type === "hex" ? t("textview.hex", "Hexagonal") : t("textview.square", "Square"),
          cols: props.grid.cols,
          rows: props.grid.rows,
          ft: distance(props.grid.feetPerCell, units),
        })}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t("textview.tokens", "Creatures on the map")}</caption>
          <thead>
            <tr className="border-b border-line text-muted">
              <th scope="col" className="py-1">{t("textview.name", "Name")}</th>
              <th scope="col">{t("textview.side", "Side")}</th>
              <th scope="col">{t("textview.position", "Position")}</th>
              {selected && <th scope="col">{t("textview.distanceFrom", "Distance from {{name}}", { name: selected.name })}</th>}
              <th scope="col">{t("textview.status", "Status")}</th>
            </tr>
          </thead>
          <tbody>
            {props.tokens.map((tok) => (
              <tr key={tok.id} className={cx("border-b border-line", tok.id === props.selectedTokenId && "bg-accent-soft")}>
                <th scope="row" className="py-1 font-medium">
                  {props.onSelect ? (
                    <button type="button" className="min-h-9 text-left underline-offset-2 hover:underline" aria-pressed={tok.id === props.selectedTokenId} onClick={() => props.onSelect!(tok.id)}>
                      {tok.name}
                      {tok.current && <span className="ml-1 text-accent">({t("textview.turn", "turn")})</span>}
                    </button>
                  ) : (
                    tok.name
                  )}
                </th>
                <td>{tok.side === "party" ? t("textview.party", "Party") : tok.side === "enemy" ? t("textview.enemy", "Enemy") : t("textview.neutral", "Neutral")}</td>
                <td>{cellLabel({ col: tok.col, row: tok.row })}</td>
                {selected && <td>{tok.id === selected.id ? "—" : distance(distanceFeet(props.grid, selected, tok), units)}</td>}
                <td>
                  {tok.status ?? "—"}
                  {tok.hidden ? ` · ${t("textview.hidden", "hidden from players")}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {props.doors && props.doors.length > 0 && (
        <div>
          <h3 className="font-semibold">{t("textview.doors", "Doors")}</h3>
          <ul className="flex flex-wrap gap-2">
            {props.doors.map((d) => (
              <li key={d.id}>
                {props.onToggleDoor ? (
                  <button type="button" className="min-h-9 rounded-lg border border-border px-2" onClick={() => props.onToggleDoor!(d.id)}>
                    {d.label}: {d.open ? t("textview.open", "open") : t("textview.closed", "closed")}
                  </button>
                ) : (
                  <span>
                    {d.label}: {d.open ? t("textview.open", "open") : t("textview.closed", "closed")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h3 className="font-semibold">{props.revealed ? t("textview.revealed", "Revealed areas (row: columns)") : t("textview.allVisible", "The whole map is visible.")}</h3>
        {rows.length > 0 && (
          <ul className="max-h-40 overflow-auto font-mono text-sm">
            {rows.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        {terrains.size > 0 && (
          <p className="mt-1 text-sm text-muted">
            {t("textview.terrain", "Ground")}: {[...terrains.entries()].map(([k, n]) => `${TERRAINS[k]?.label ?? k} (${n})`).join(", ")}
          </p>
        )}
      </div>
    </section>
  );
}
