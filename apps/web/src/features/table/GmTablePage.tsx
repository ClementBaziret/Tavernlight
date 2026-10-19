import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ChevronRight, Dices, Eye, EyeOff, MonitorPlay, Play, RotateCcw, Square, Swords, Undo2, Wifi } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  areaOutline,
  cellLabel,
  cellCenter,
  distanceFeet,
  placeArea,
  type ActionDef,
  type Cell,
  type Combatant,
  type Point,
} from "@tavernlight/engine";
import type { CampaignDetail, MapSummary } from "@tavernlight/shared";
import { RollLine } from "@/components/RollPanel";
import { Alert, Badge, Button, Card, Checkbox, cx, HpBar, IconButton, NumberField, RadioGroup, Select, Spinner, Switch, Tabs, TextField } from "@/components/ui";
import { MapCanvas, tokenCentre, type TokenStatus } from "@/features/maps/MapCanvas";
import { MapTextView } from "@/features/maps/MapTextView";
import { api } from "@/lib/api";
import { announce } from "@/lib/announce";
import { distance, signed } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import { useTable } from "@/lib/table";
import { EffectForm } from "./EffectForm";
import { ProposalCard } from "./ProposalCard";

function statusText(c: Combatant): string {
  if (c.dead) return c.kind === "pc" ? "dead" : "down";
  if (c.hp === 0) return "unconscious";
  if (c.hp >= c.maxHp) return "unhurt";
  return c.hp <= c.maxHp / 2 ? "bloodied" : "injured";
}

export function GmTablePage() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false }) as { id: string };
  const units = useSettings((s) => s.units);
  const conn = useTable(id, "gm");
  const campaign = useQuery({ queryKey: ["campaign", id], queryFn: () => api.get<CampaignDetail>(`/campaigns/${id}`) });
  const maps = useQuery({ queryKey: ["maps", id], queryFn: () => api.get<MapSummary[]>(`/campaigns/${id}/maps`) });
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [slotLevel, setSlotLevel] = useState(1);
  const [adv, setAdv] = useState("normal");
  const [template, setTemplate] = useState<Point[] | null>(null);
  const [measure, setMeasure] = useState<{ from: Point; to: Point; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rollExpr, setRollExpr] = useState("1d20");
  const [rollVisibility, setRollVisibility] = useState("hidden");
  const [panel, setPanel] = useState("combat");

  const state = conn.state;
  const map = state?.map?.data ?? null;
  const combat = state?.combat ?? null;
  const combatants = combat ? combat.order.map((cid) => combat.combatants.find((c) => c.id === cid)).filter((c): c is Combatant => !!c) : [];
  const current = combat && combat.status === "active" ? combat.combatants.find((c) => c.id === combat.order[combat.turnIndex]) : null;
  const actor = combat?.combatants.find((c) => c.id === actorId) ?? null;
  const action: ActionDef | null = actor?.actions.find((a) => a.key === actionKey) ?? null;

  const revealed = useMemo(() => (map?.fog.enabled ? new Set(map.fog.revealed) : null), [map?.fog]);
  const visible = useMemo(() => new Set(state?.visible ?? []), [state?.visible]);
  const statuses = useMemo(() => {
    const s: Record<string, TokenStatus> = {};
    for (const c of combat?.combatants ?? []) if (c.tokenId) s[c.tokenId] = { hpRatio: c.maxHp ? c.hp / c.maxHp : 1, down: c.dead || c.hp === 0, current: c.id === current?.id };
    return s;
  }, [combat, current?.id]);
  const highlight = useMemo(() => new Set((combat?.combatants ?? []).filter((c) => targetIds.includes(c.id) && c.tokenId).map((c) => c.tokenId!)), [combat, targetIds]);

  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      announce(message, "assertive");
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  if (!state) {
    return (
      <div className="p-6">
        {conn.error ? <Alert tone="danger">{conn.error}</Alert> : <Spinner label={t("table.connecting", "Connecting to the table…")} />}
      </div>
    );
  }

  const selectActor = (c: Combatant) => {
    setActorId(c.id);
    setActionKey(null);
    setTemplate(null);
    if (c.tokenId) setSelectedToken(c.tokenId);
    announce(t("table.actorSelected", "{{name}} acts", { name: c.name }));
  };

  const onPointer = async (e: { type: "down" | "move" | "up"; cell: Cell; point: Point; shift: boolean; tokenId: string | null }) => {
    if (!map || e.type !== "up") return;
    if (action?.targeting.type === "area") {
      const area = action.targeting.area;
      const casterToken = actor?.tokenId ? map.tokens.find((x) => x.id === actor.tokenId) : undefined;
      const origin = casterToken ? tokenCentre(map.grid, casterToken) : e.point;
      const placement = placeArea(area, origin, e.point);
      setTemplate(areaOutline(map.grid, placement));
      const r = (await run(() => conn.command("area:targets", { area: { ...area, origin, target: e.point }, casterTokenId: casterToken?.id }))) as { combatantIds: string[] } | undefined;
      if (r) {
        setTargetIds(r.combatantIds);
        announce(t("table.areaTargets", "{{n}} creatures in the area", { n: r.combatantIds.length }));
      }
      return;
    }
    if (e.shift && selectedToken) {
      const from = map.tokens.find((x) => x.id === selectedToken);
      if (from) {
        const feet = distanceFeet(map.grid, from, e.cell);
        const label = distance(feet, units);
        setMeasure({ from: tokenCentre(map.grid, from), to: cellCenter(map.grid, e.cell), label });
        announce(t("table.distance", "Distance: {{d}}", { d: label }));
      }
      return;
    }
    setMeasure(null);
    if (e.tokenId) {
      setSelectedToken(e.tokenId);
      const c = combat?.combatants.find((x) => x.tokenId === e.tokenId);
      if (c && actor && action && action.targeting.type !== "self" && c.id !== actor.id) {
        setTargetIds((ids) => (ids.includes(c.id) ? ids.filter((x) => x !== c.id) : [...ids, c.id]));
      }
    }
  };

  const moveToken = (tokenId: string, cell: Cell) => run(() => conn.command("token:move", { tokenId, col: cell.col, row: cell.row }));

  const resolve = () =>
    actor &&
    action &&
    run(() =>
      conn.command("combat:resolve", {
        actorId: actor.id,
        actionKey: action.key,
        targetIds: action.targeting.type === "self" ? [actor.id] : targetIds,
        slotLevel: action.level ? Math.max(action.level, slotLevel) : undefined,
        advantage: adv === "normal" ? null : (adv as "advantage"),
      }),
    ).then((r) => r && setPanel("combat"));

  const selectedTok = map?.tokens.find((x) => x.id === selectedToken);
  const doors = (map?.walls ?? []).filter((w) => w.kind === "door").map((w, i) => ({ id: w.id, open: !!w.open, label: `${t("editor.door", "Door")} ${i + 1}${w.secret ? ` (${t("editor.secretShort", "secret")})` : ""}` }));

  const combatPanel = (
    <div className="flex flex-col gap-4">
      {state.pending.map((p) => (
        <ProposalCard
          key={p.id}
          proposal={p}
          busy={busy}
          onApply={(edited) => run(() => conn.command("combat:apply", { proposal: edited })).then(() => setTemplate(null))}
          onDiscard={() => run(() => conn.command("combat:discard", { proposalId: p.id }))}
        />
      ))}
      {combat && (
        <Card as="section" aria-labelledby="action-title" className="flex flex-col gap-3">
          <h2 id="action-title" className="font-display text-lg font-semibold">
            {actor ? t("table.actionOf", "Action of {{name}}", { name: actor.name }) : t("table.chooseActor", "Choose who acts in the initiative list")}
          </h2>
          {actor && (
            <>
              <Select
                label={t("table.action", "Action")}
                value={actionKey}
                onChange={(k) => {
                  setActionKey(k);
                  setTemplate(null);
                  const a = actor.actions.find((x) => x.key === k);
                  if (a?.level) setSlotLevel(a.level);
                  if (a?.targeting.type === "self") setTargetIds([actor.id]);
                }}
                options={actor.actions.map((a) => ({
                  id: a.key,
                  label: a.name,
                  description: [a.source === "spell" ? (a.level ? `${t("common.level", "level")} ${a.level}` : t("sheet.cantrip", "cantrip")) : null, a.resolution.type === "attack" ? t("table.attackRoll", "attack roll") : a.resolution.type === "save" ? `${a.resolution.ability.toUpperCase()} ${t("table.save", "save")}` : t("table.auto", "automatic"), a.targeting.type === "area" ? `${a.targeting.area.shape} ${a.targeting.area.size} ft` : null]
                    .filter(Boolean)
                    .join(" · "),
                }))}
              />
              {action?.level ? (
                <NumberField
                  label={t("table.slotLevel", "Spell slot level")}
                  value={slotLevel}
                  minValue={action.level}
                  maxValue={9}
                  onChange={setSlotLevel}
                  description={actor.slots ? t("table.slotsLeft", "Left: {{s}}", { s: actor.slots.max.map((m, i) => (i > 0 && m > 0 ? `L${i} ${m - (actor.slots!.used[i] ?? 0)}/${m}` : null)).filter(Boolean).join(", ") }) : undefined}
                />
              ) : null}
              {action?.resolution.type === "attack" && (
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
              )}
              {action?.targeting.type === "area" && <Alert tone="info">{t("table.placeTemplate", "Click on the map to place the {{shape}} ({{size}}). Creatures inside are selected, allies included; adjust the list below.", { shape: action.targeting.area.shape, size: distance(action.targeting.area.size, units) })}</Alert>}
              {action && action.targeting.type !== "self" && (
                <fieldset className="flex flex-col gap-1 rounded-xl border border-line p-3">
                  <legend className="px-1 font-semibold">{t("table.targets", "Targets ({{n}})", { n: targetIds.length })}</legend>
                  {combatants
                    .filter((c) => c.id !== actor.id || action.targeting.type !== "single")
                    .map((c) => (
                      <Checkbox key={c.id} isSelected={targetIds.includes(c.id)} onChange={(v) => setTargetIds((ids) => (v ? [...ids, c.id] : ids.filter((x) => x !== c.id)))}>
                        {c.name}{" "}
                        <span className="text-sm text-muted">
                          · {t("common.ac", "AC")} {c.ac} · {c.side}
                          {selectedTok && c.tokenId && map ? ` · ${distance(distanceFeet(map.grid, map.tokens.find((x) => x.id === actor.tokenId) ?? selectedTok, map.tokens.find((x) => x.id === c.tokenId) ?? selectedTok), units)}` : ""}
                        </span>
                      </Checkbox>
                    ))}
                </fieldset>
              )}
              {action?.description && <p className="max-h-32 overflow-auto whitespace-pre-line text-sm text-muted">{action.description}</p>}
              <Button variant="primary" onPress={resolve} isDisabled={!action || (action.targeting.type !== "self" && !targetIds.length)} loading={busy}>
                <Swords aria-hidden className="h-4 w-4" />
                {t("table.resolve", "Resolve")}
              </Button>
            </>
          )}
        </Card>
      )}
      {combat && (
        <EffectForm
          combatants={combatants}
          defaultTargets={targetIds}
          busy={busy}
          onSubmit={async (ids, effect, title) => {
            await conn.command("combat:effect", { targetIds: ids, effect, title, sourceId: actorId ?? undefined });
          }}
        />
      )}
    </div>
  );

  const logPanel = (
    <ol className="flex flex-col gap-2" aria-label={t("table.log", "Game log")}>
      {state.log.map((e) => (
        <li key={e.id} className={cx("rounded-lg border border-line p-2", e.undone && "opacity-60")}>
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium">
              #{e.seq} {e.title} {e.undone && <Badge>{t("table.undone", "undone")}</Badge>}
            </span>
            {e.undoable && (
              <Button size="sm" onPress={() => run(() => conn.command("combat:undo", { entryId: e.id }))}>
                <Undo2 aria-hidden className="h-4 w-4" />
                {t("table.undo", "Undo")}
              </Button>
            )}
          </div>
          {e.lines.length > 0 && (
            <ul className="mt-1 text-sm text-muted">
              {e.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );

  const dicePanel = (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => conn.command("roll", { expression: rollExpr, visibility: rollVisibility as "hidden" }));
        }}
      >
        <TextField label={t("dice.expression", "Expression")} value={rollExpr} onChange={setRollExpr} inputClassName="font-mono" />
        <Select
          label={t("dice.visibility", "Who sees it")}
          value={rollVisibility}
          onChange={setRollVisibility}
          options={[
            { id: "hidden", label: t("dice.hiddenGm", "Only me, the game master (hidden)") },
            { id: "public", label: t("dice.public", "Everyone (public)") },
          ]}
        />
        <Button type="submit" variant="accent">
          <Dices aria-hidden className="h-4 w-4" />
          {t("dice.roll", "Roll")}
        </Button>
      </form>
      <ol className="flex flex-col gap-2">
        {state.rolls.map((r) => (
          <li key={r.id}>
            <RollLine roll={r} />
          </li>
        ))}
      </ol>
    </div>
  );

  const docsPanel = (
    <ul className="flex flex-col gap-2">
      {state.documents.map((d) => (
        <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-line p-2">
          <span>
            {d.title} {d.revealed && <Badge tone="success">{t("docs.revealed", "revealed")}</Badge>}
          </span>
          <Button size="sm" onPress={() => run(() => conn.command("doc:reveal", { documentId: d.revealed ? null : d.id }))}>
            {d.revealed ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
            {d.revealed ? t("docs.hide", "Hide") : t("docs.reveal", "Reveal")}
          </Button>
        </li>
      ))}
      {!state.documents.length && <li className="text-muted">{t("docs.none", "No document. Create them in the campaign page.")}</li>}
    </ul>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 bg-brand px-4 py-2 text-brand-text">
        <Link to="/campaigns/$id" params={{ id }} search={{ tab: undefined }} className="min-h-11 content-center underline">
          ← {campaign.data?.name}
        </Link>
        <h1 className="font-display text-xl font-semibold">{t("table.gmView", "GM view")}</h1>
        <Badge tone={conn.connected ? "success" : "danger"}>
          <Wifi aria-hidden className="h-3 w-3" />
          {conn.connected ? t("table.connected", "connected") : t("table.disconnected", "disconnected")}
          {conn.latency !== null && ` · ${conn.latency} ms`}
        </Badge>
        <span className="text-xs opacity-80" title={t("table.perfHelp", "Server computation time of the last snapshot and its delivery delay")}>
          {t("table.perf", "sync {{c}} ms + {{d}} ms", { c: state.perf.computeMs.toFixed(1), d: conn.syncDelay ?? "?" })}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select
            label={t("table.activeMap", "Map on the table")}
            hideLabel
            value={state.map?.id ?? "none"}
            onChange={(v) => run(() => conn.command("map:activate", { mapId: v === "none" ? null : v }))}
            options={[{ id: "none", label: t("table.noMap", "No map") }, ...(maps.data ?? []).map((m) => ({ id: m.id, label: m.name }))]}
            className="w-56 text-text"
          />
          <a href={`/campaigns/${id}/players`} target="tavernlight-players" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-lantern px-3 font-semibold text-[#1d1b16]">
            <MonitorPlay aria-hidden className="h-4 w-4" />
            {t("table.openPlayers", "Open the players' view")}
          </a>
        </div>
      </header>
      {(error || conn.error) && (
        <div className="px-4 pt-2">
          <Alert tone="danger">{error ?? conn.error}</Alert>
        </div>
      )}
      <main id="main" className="grid flex-1 gap-4 p-4 xl:grid-cols-[18rem_1fr_26rem]">
        <section aria-labelledby="init-title" className="flex flex-col gap-3">
          <h2 id="init-title" className="font-display text-lg font-semibold">
            {t("table.initiative", "Initiative")}
            {combat?.status === "active" && <span className="ml-2 text-sm font-normal text-muted">{t("table.round", "round {{n}}", { n: combat.round })}</span>}
          </h2>
          {!combat ? (
            <Button variant="accent" onPress={() => run(() => conn.command("combat:create", { includeTokens: true }))} loading={busy}>
              <Swords aria-hidden className="h-4 w-4" />
              {t("table.prepare", "Prepare combat (tokens of the map)")}
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              {combat.status === "setup" && (
                <>
                  <Button size="sm" onPress={() => run(() => conn.command("combat:rollInitiative", {}))}>
                    <Dices aria-hidden className="h-4 w-4" />
                    {t("table.rollInit", "Roll initiative")}
                  </Button>
                  <Button size="sm" variant="primary" onPress={() => run(() => conn.command("combat:start", {}))}>
                    <Play aria-hidden className="h-4 w-4" />
                    {t("table.start", "Start")}
                  </Button>
                </>
              )}
              {combat.status === "active" && (
                <Button size="sm" variant="primary" onPress={() => run(() => conn.command("combat:next", {}))}>
                  <ChevronRight aria-hidden className="h-4 w-4" />
                  {t("table.next", "Next turn")}
                </Button>
              )}
              <Button size="sm" onPress={() => run(() => conn.command("combat:end", {}))}>
                <Square aria-hidden className="h-4 w-4" />
                {t("table.end", "End combat")}
              </Button>
            </div>
          )}
          {combat && (
            <ol className="flex flex-col gap-2">
              {combatants.map((c) => {
                const isCurrent = current?.id === c.id;
                return (
                  <li key={c.id} className={cx("rounded-lg border bg-surface p-2", isCurrent ? "border-2 border-lantern" : "border-line", c.dead && "opacity-60")} aria-current={isCurrent ? "step" : undefined}>
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" className={cx("min-h-9 text-left font-semibold underline-offset-2 hover:underline", actorId === c.id && "text-accent")} onClick={() => selectActor(c)} aria-pressed={actorId === c.id}>
                        {isCurrent && <span className="sr-only">{t("table.currentTurn", "Current turn:")} </span>}
                        {c.name}
                      </button>
                      <span className="flex items-center gap-1">
                        <NumberField label={t("table.initOf", "Initiative of {{name}}", { name: c.name })} hideLabel value={c.initiative ?? 0} onChange={(v) => run(() => conn.command("combat:setInitiative", { combatantId: c.id, value: v }))} className="w-28" />
                        <IconButton size="sm" label={c.hidden ? t("table.showTo", "Show {{name}} to the players", { name: c.name }) : t("table.hideFrom", "Hide {{name}} from the players", { name: c.name })} onPress={() => run(() => conn.command("combat:visibility", { combatantId: c.id, hidden: !c.hidden }))}>
                          {c.hidden ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
                        </IconButton>
                      </span>
                    </div>
                    <p className="text-sm">
                      {t("common.hp", "HP")} {c.hp}/{c.maxHp}
                      {c.tempHp ? ` (+${c.tempHp})` : ""} · {t("common.ac", "AC")} {c.ac} · <span className="text-muted">{statusText(c)}</span>
                      {c.concentration && <Badge tone="info" className="ml-1">C: {c.concentration.name}</Badge>}
                    </p>
                    <HpBar hp={c.hp} max={c.maxHp} label={t("common.hpOf", "Hit points of {{name}}", { name: c.name })} />
                    {c.kind === "pc" && c.hp === 0 && !c.dead && (
                      <p className="text-sm">
                        {t("sheet.deathSaves", "Death saving throws")}: {c.deathSaves.successes}✓ {c.deathSaves.failures}✗{" "}
                        <Button size="sm" onPress={() => run(() => conn.command("combat:deathSave", { combatantId: c.id }))}>
                          {t("sheet.rollDeathSave", "Roll")}
                        </Button>
                      </p>
                    )}
                    {(c.conditions.length > 0 || c.effects.length > 0) && (
                      <ul className="mt-1 flex flex-wrap gap-1">
                        {[...c.conditions.map((x) => ({ id: x.id, name: x.condition, rounds: x.remainingRounds, tone: "danger" as const })), ...c.effects.map((x) => ({ id: x.id, name: x.name, rounds: x.remainingRounds, tone: "info" as const }))].map((s) => (
                          <li key={s.id}>
                            <Badge tone={s.tone}>
                              {s.name}
                              {s.rounds ? ` (${s.rounds})` : ""}
                              <button type="button" className="ml-1 underline" aria-label={t("table.removeStatus", "Remove {{s}} from {{name}}", { s: s.name, name: c.name })} onClick={() => run(() => conn.command("combat:removeStatus", { combatantId: c.id, statusId: s.id }))}>
                                ×
                              </button>
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {combat && map && (
            <Select
              label={t("table.addToken", "Add a token of the map")}
              value={null}
              onChange={(tokenId) => run(() => conn.command("combat:addToken", { tokenId }))}
              options={map.tokens.filter((tk) => !combat.combatants.some((c) => c.tokenId === tk.id) && (tk.characterId || tk.monsterKey)).map((tk) => ({ id: tk.id, label: tk.name }))}
            />
          )}
        </section>

        <section aria-labelledby="map-title" className="flex min-w-0 flex-col gap-2">
          <h2 id="map-title" className="sr-only">
            {t("table.map", "Map")}
          </h2>
          {map ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Switch isSelected={map.fog.enabled} onChange={(v) => run(() => conn.command("fog:settings", { enabled: v }))}>
                  {t("editor.fogEnabled", "Fog of war enabled")}
                </Switch>
                <Select
                  label={t("editor.fogMode", "Reveal")}
                  hideLabel
                  value={map.fog.mode}
                  onChange={(v) => run(() => conn.command("fog:settings", { mode: v as "auto" }))}
                  options={[
                    { id: "auto", label: t("editor.fogAuto", "Automatic") },
                    { id: "manual", label: t("editor.fogManual", "Manual only") },
                  ]}
                  className="w-44"
                />
                {selectedTok && (
                  <span className="text-sm">
                    {t("table.selected", "Selected: {{name}} at {{cell}}", { name: selectedTok.name, cell: cellLabel(selectedTok) })}
                    <Button size="sm" variant="ghost" onPress={() => run(() => conn.command("token:update", { tokenId: selectedTok.id, patch: { hidden: !selectedTok.hidden } }))}>
                      {selectedTok.hidden ? t("table.reveal", "Reveal") : t("table.hide", "Hide")}
                    </Button>
                  </span>
                )}
                {template && (
                  <Button size="sm" variant="ghost" onPress={() => setTemplate(null)}>
                    <RotateCcw aria-hidden className="h-4 w-4" />
                    {t("table.clearTemplate", "Clear the template")}
                  </Button>
                )}
              </div>
              <MapCanvas
                grid={map.grid}
                terrain={map.terrain}
                decor={map.decor}
                walls={map.walls}
                tokens={map.tokens}
                backgroundUrl={map.background ? `/api/assets/${map.background.assetId}` : null}
                backgroundOpacity={map.background?.opacity}
                fogView={map.fog.enabled ? "gm" : "none"}
                revealed={revealed}
                visible={visible}
                selectedTokenId={selectedToken}
                highlightTokenIds={highlight}
                statuses={statuses}
                template={template}
                measure={measure}
                draggableTokens
                onPointer={(e) => void onPointer(e)}
                onTokenDrop={(tokenId, cell) => void moveToken(tokenId, cell)}
                onKeyDown={(e) => {
                  const moves: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
                  if (moves[e.key] && selectedTok) {
                    e.preventDefault();
                    void moveToken(selectedTok.id, { col: selectedTok.col + moves[e.key][0], row: selectedTok.row + moves[e.key][1] });
                  }
                }}
                ariaLabel={t("table.mapLabel", "Battle map. Choose a token in the text view below, then move it with the arrow keys. Shift+click measures a distance.")}
                ariaDescribedBy="gm-text-view"
                className="relative h-[62vh] w-full overflow-hidden rounded-xl border border-line"
                fit
              />
              <details className="rounded-xl border border-line bg-surface p-3" open>
                <summary className="cursor-pointer font-semibold">{t("textview.title", "Map in text")}</summary>
                <MapTextView
                  id="gm-text-view"
                  grid={map.grid}
                  tokens={map.tokens.map((tk) => {
                    const c = combat?.combatants.find((x) => x.tokenId === tk.id);
                    return { ...tk, status: c ? `${c.hp}/${c.maxHp} HP, ${statusText(c)}` : undefined, current: !!c && c.id === current?.id };
                  })}
                  terrain={map.terrain}
                  revealed={revealed}
                  selectedTokenId={selectedToken}
                  onSelect={setSelectedToken}
                  doors={doors}
                  onToggleDoor={(wallId) => run(() => conn.command("door:toggle", { wallId }))}
                />
              </details>
            </>
          ) : (
            <Alert tone="info">{t("table.chooseMap", "Choose a map to display on the table (top right).")}</Alert>
          )}
        </section>

        <aside aria-label={t("table.tools", "Tools")} className="flex flex-col gap-3">
          <Tabs
            label={t("table.tools", "Tools")}
            selected={panel}
            onSelect={setPanel}
            tabs={[
              { id: "combat", label: `${t("table.combat", "Combat")}${state.pending.length ? ` (${state.pending.length})` : ""}`, content: combatPanel },
              { id: "log", label: t("table.log", "Game log"), content: logPanel },
              { id: "dice", label: t("nav.dice", "Dice"), content: dicePanel },
              { id: "docs", label: t("campaign.documents", "Documents"), content: docsPanel },
            ]}
          />
          {actor && (
            <p className="text-sm text-muted">
              {actor.name}: {Object.entries(actor.saves).map(([k, v]) => `${k.toUpperCase()} ${signed(v)}`).join(" · ")}
            </p>
          )}
        </aside>
      </main>
    </div>
  );
}
