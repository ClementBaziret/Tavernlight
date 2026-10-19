import { useParams } from "@tanstack/react-router";
import { Expand, ScrollText } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlayerCombatant } from "@tavernlight/engine";
import { RollLine } from "@/components/RollPanel";
import { Alert, Badge, Button, cx, HpBar, Spinner, Switch } from "@/components/ui";
import { MapCanvas, type TokenStatus } from "@/features/maps/MapCanvas";
import { MapTextView } from "@/features/maps/MapTextView";
import { useTable } from "@/lib/table";

function useStatusLabel() {
  const { t } = useTranslation();
  return (c: PlayerCombatant) => (c.status === "down" ? t("players.down", "down") : c.status === "injured" ? t("players.injured", "injured") : t("players.unhurt", "unhurt"));
}

/**
 * The second screen (TV / projector). Everything shown here was filtered
 * by the server: hidden things are not in the received data at all.
 */
export function PlayersViewPage() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false }) as { id: string };
  const conn = useTable(id, "players");
  const statusLabel = useStatusLabel();
  const [textView, setTextView] = useState(false);
  const state = conn.state;
  const map = state?.map ?? null;
  const revealed = useMemo(() => (map?.revealed ? new Set(map.revealed) : null), [map?.revealed]);
  const visible = useMemo(() => new Set(map?.visible ?? []), [map?.visible]);
  const combat = state?.combat ?? null;
  const statuses = useMemo(() => {
    const s: Record<string, TokenStatus> = {};
    for (const c of combat?.combatants ?? []) if (c.tokenId) s[c.tokenId] = { down: c.status === "down", current: c.id === combat?.currentId };
    return s;
  }, [combat]);

  if (!state) {
    return <div className="flex min-h-screen items-center justify-center bg-[#0b0d17] text-[#f0ebe0]">{conn.error ? <Alert tone="danger">{conn.error}</Alert> : <Spinner label={t("table.connecting", "Connecting to the table…")} />}</div>;
  }

  const current = combat?.combatants.find((c) => c.id === combat.currentId);
  const enemies = combat?.combatants.filter((c) => c.side !== "party") ?? [];

  return (
    <div className="dark flex h-screen flex-col bg-[#0b0d17] text-[#f0ebe0]">
      <header className="flex flex-wrap items-center gap-3 border-b border-[#353a55] px-4 py-2">
        <h1 className="font-display text-xl font-semibold">{state.campaignName}</h1>
        {map && <span className="text-[#bdb5a4]">· {map.name}</span>}
        {combat?.status === "active" && (
          <p className="rounded-full bg-[#f0c55d] px-4 py-1 text-lg font-bold text-[#11131f]" aria-live="polite">
            {current ? t("players.turnOf", "{{name}}'s turn", { name: current.name }) : t("players.round", "Round {{n}}", { n: combat.round })}
          </p>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Switch isSelected={textView} onChange={setTextView} className="text-[#f0ebe0]">
            {t("players.textView", "Text view")}
          </Switch>
          <Button size="sm" variant="ghost" className="text-[#f0ebe0]" onPress={() => void document.documentElement.requestFullscreen?.()}>
            <Expand aria-hidden className="h-4 w-4" />
            {t("players.fullscreen", "Full screen")}
          </Button>
          <Badge tone={conn.connected ? "success" : "danger"}>{conn.connected ? t("table.connected", "connected") : t("table.disconnected", "disconnected")}</Badge>
        </div>
      </header>
      <main id="main" className="relative grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[1fr_20rem]">
        <section aria-label={t("table.map", "Map")} className="relative min-h-0">
          {map ? (
            textView ? (
              <div className="h-full overflow-auto rounded-xl bg-[#1a1d2e] p-4">
                <MapTextView
                  grid={map.grid}
                  tokens={map.tokens.map((tk) => {
                    const c = combat?.combatants.find((x) => x.tokenId === tk.id);
                    return { ...tk, status: c ? (c.hp !== undefined ? `${c.hp}/${c.maxHp} HP` : statusLabel(c)) : undefined, current: !!c && c.id === combat?.currentId };
                  })}
                  terrain={map.terrain}
                  revealed={revealed}
                />
              </div>
            ) : (
              <MapCanvas
                grid={map.grid}
                terrain={map.terrain}
                decor={map.decor}
                walls={map.walls}
                tokens={map.tokens}
                backgroundUrl={map.hasBackground && state.backgroundVersion ? `/api/table/${id}/background?v=${state.backgroundVersion}` : null}
                backgroundOpacity={map.backgroundOpacity}
                fogView={revealed ? "players" : "none"}
                revealed={revealed}
                visible={revealed ? visible : null}
                statuses={statuses}
                ariaLabel={t("players.mapLabel", "Map seen by the characters. Switch on the text view for a description.")}
                className="relative h-full min-h-[50vh] w-full overflow-hidden rounded-xl border border-[#353a55]"
                fit
              />
            )
          ) : (
            <div className="flex h-full items-center justify-center text-2xl text-[#bdb5a4]">{t("players.noMap", "The game master hasn't shown a map yet.")}</div>
          )}
          {state.document && (
            <article aria-labelledby="revealed-doc" className="absolute inset-x-4 top-4 mx-auto max-w-2xl rounded-xl border-2 border-[#f0c55d] bg-[#f7f2e7] p-6 text-[#1d1b16] shadow-2xl">
              <h2 id="revealed-doc" className="flex items-center gap-2 font-display text-2xl font-semibold">
                <ScrollText aria-hidden className="h-6 w-6" />
                {state.document.title}
              </h2>
              {state.document.assetId && <img src={`/api/assets/${state.document.assetId}`} alt={state.document.title} className="mt-3 max-h-[40vh] rounded-lg" />}
              <p className="mt-3 whitespace-pre-line text-lg">{state.document.body}</p>
            </article>
          )}
        </section>
        <aside className="flex min-h-0 flex-col gap-3 overflow-auto">
          <section aria-labelledby="party-h" className="rounded-xl bg-[#1a1d2e] p-3">
            <h2 id="party-h" className="font-display text-lg font-semibold">
              {t("players.party", "The party")}
            </h2>
            <ul className="mt-2 flex flex-col gap-2">
              {state.party.map((p) => {
                const c = combat?.combatants.find((x) => x.name === p.name || x.id === p.id);
                return (
                  <li key={p.id}>
                    <p className="flex justify-between">
                      <span className="font-semibold">{p.name}</span>
                      <span className="tabular-nums">
                        {p.hp}/{p.maxHp}
                        {p.tempHp ? ` +${p.tempHp}` : ""} · {t("common.ac", "AC")} {p.ac}
                      </span>
                    </p>
                    <HpBar hp={p.hp} max={p.maxHp} temp={p.tempHp} label={t("common.hpOf", "Hit points of {{name}}", { name: p.name })} />
                    {(p.conditions.length > 0 || (c?.effects.length ?? 0) > 0) && (
                      <p className="text-sm text-[#bdb5a4]">{[...p.conditions, ...(c?.effects ?? [])].join(", ")}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
          {combat && (
            <section aria-labelledby="init-h" className="rounded-xl bg-[#1a1d2e] p-3">
              <h2 id="init-h" className="font-display text-lg font-semibold">
                {t("table.initiative", "Initiative")} · {t("table.round", "round {{n}}", { n: combat.round })}
              </h2>
              <ol className="mt-2 flex flex-col gap-1">
                {combat.combatants.map((c) => (
                  <li key={c.id} className={cx("flex justify-between rounded-lg px-2 py-1", c.id === combat.currentId && "bg-[#f0c55d] font-bold text-[#11131f]")}>
                    <span>
                      {c.id === combat.currentId && <span className="sr-only">{t("table.currentTurn", "Current turn:")} </span>}
                      {c.name}
                    </span>
                    <span className="text-sm">{c.side === "party" ? `${c.hp}/${c.maxHp}` : statusLabel(c)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {enemies.length > 0 && (
            <section aria-labelledby="enemies-h" className="rounded-xl bg-[#1a1d2e] p-3">
              <h2 id="enemies-h" className="font-display text-lg font-semibold">
                {t("players.creatures", "Creatures")}
              </h2>
              <ul className="mt-2 flex flex-col gap-1">
                {enemies.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <span>{c.name}</span>
                    <span className="text-right text-sm">
                      {statusLabel(c)}
                      {c.conditions.length + c.effects.length > 0 && ` · ${[...c.conditions, ...c.effects].join(", ")}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="rolls-h" className="rounded-xl bg-[#1a1d2e] p-3">
            <h2 id="rolls-h" className="font-display text-lg font-semibold">
              {t("players.rolls", "Last rolls")}
            </h2>
            <ol className="mt-2 flex flex-col gap-2">
              {state.rolls.slice(0, 5).map((r, i) => (
                <li key={r.id} className={i === 0 ? "animate-roll" : undefined}>
                  <RollLine roll={r} compact />
                </li>
              ))}
            </ol>
          </section>
          <p className="text-xs text-[#bdb5a4]">{t("table.perf", "sync {{c}} ms + {{d}} ms", { c: state.perf.computeMs.toFixed(1), d: conn.syncDelay ?? "?" })}</p>
        </aside>
      </main>
    </div>
  );
}
