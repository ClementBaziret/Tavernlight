import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Brush, DoorOpen, Eraser, Eye, Hand, Mountain, Redo2, Save, Undo2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ToggleButton, ToggleButtonGroup } from "react-aria-components";
import {
  cellIndex,
  cellPolygon,
  inBounds,
  neighbours,
  newId,
  pixelToCell,
  type Cell,
  type MapData,
  type Point,
  type Token,
  type Wall,
} from "@tavernlight/engine";
import type { CampaignDetail, MapDto, MonsterSummary } from "@tavernlight/shared";
import { Alert, Button, Card, Checkbox, cx, IconButton, NumberField, PageHeader, RadioGroup, Select, Spinner, Switch, TextArea, TextField } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { announce } from "@/lib/announce";
import { DECOR_ICONS, MapCanvas, TERRAINS } from "./MapCanvas";
import { MapTextView } from "./MapTextView";

type Tool = "select" | "terrain" | "wall" | "eraseWall" | "decor" | "token" | "fog";

function snapVertex(map: MapData, p: Point): Point {
  if (map.grid.type === "square") {
    const s = map.grid.cellSize;
    return { x: Math.round(p.x / s) * s, y: Math.round(p.y / s) * s };
  }
  const cell = pixelToCell(map.grid, p);
  const candidates = [cell, ...neighbours(map.grid, cell)].flatMap((c) => cellPolygon(map.grid, c));
  return candidates.reduce((best, v) => (Math.hypot(v.x - p.x, v.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? v : best), candidates[0]);
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function resizeMap(map: MapData, cols: number, rows: number): MapData {
  const terrain: (string | null)[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) terrain.push(c < map.grid.cols && r < map.grid.rows ? map.terrain[r * map.grid.cols + c] : null);
  const revealed = map.fog.revealed
    .map((i) => ({ col: i % map.grid.cols, row: Math.floor(i / map.grid.cols) }))
    .filter((c) => c.col < cols && c.row < rows)
    .map((c) => c.row * cols + c.col);
  return { ...map, grid: { ...map.grid, cols, rows }, terrain, fog: { ...map.fog, revealed }, tokens: map.tokens.filter((t) => t.col < cols && t.row < rows) };
}

export function MapEditorPage() {
  const { t } = useTranslation();
  const { id: campaignId, mapId } = useParams({ strict: false }) as { id: string; mapId: string };
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["map", mapId], queryFn: () => api.get<MapDto>(`/campaigns/${campaignId}/maps/${mapId}`) });
  const campaign = useQuery({ queryKey: ["campaign", campaignId], queryFn: () => api.get<CampaignDetail>(`/campaigns/${campaignId}`) });
  const [map, setMap] = useState<MapData | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [history, setHistory] = useState<MapData[]>([]);
  const [future, setFuture] = useState<MapData[]>([]);
  const [dirty, setDirty] = useState(false);
  const [tool, setTool] = useState<Tool>("select");
  const [terrainKey, setTerrainKey] = useState("stone");
  const [wallKind, setWallKind] = useState<Wall["kind"]>("wall");
  const [secretDoor, setSecretDoor] = useState(false);
  const [decorIcon, setDecorIcon] = useState("tree");
  const [decorLayer, setDecorLayer] = useState<"decor" | "gm">("decor");
  const [decorBlocks, setDecorBlocks] = useState(false);
  const [fogReveal, setFogReveal] = useState(true);
  const [tokenSource, setTokenSource] = useState("npc");
  const [tokenName, setTokenName] = useState("Villager");
  const [monsterQuery, setMonsterQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingWall, setPendingWall] = useState<{ a: Point; b: Point } | null>(null);
  const painting = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (query.data && !map) {
      setMap(query.data.data);
      setName(query.data.name);
      setDescription(query.data.description);
    }
  }, [query.data, map]);

  const monsters = useQuery({
    queryKey: ["monsters", "editor", monsterQuery],
    queryFn: () => api.get<MonsterSummary[]>(`/rules/monsters?search=${encodeURIComponent(monsterQuery)}`),
    enabled: tokenSource === "monster" && monsterQuery.length >= 2,
  });

  const save = useMutation({
    mutationFn: () => api.put<MapDto>(`/campaigns/${campaignId}/maps/${mapId}`, { name, description, data: map }),
    onSuccess: (m) => {
      client.setQueryData(["map", mapId], m);
      void client.invalidateQueries({ queryKey: ["maps", campaignId] });
      setDirty(false);
      announce(t("editor.saved", "Map saved"));
    },
  });

  const update = useCallback(
    (fn: (m: MapData) => MapData, record = true) => {
      setMap((current) => {
        if (!current) return current;
        if (record) {
          setHistory((h) => [...h.slice(-49), current]);
          setFuture([]);
        }
        return fn(current);
      });
      setDirty(true);
    },
    [],
  );

  const undo = () => {
    if (!history.length || !map) return;
    setFuture((f) => [map, ...f]);
    setMap(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    announce(t("editor.undone", "Undone"));
  };
  const redo = () => {
    if (!future.length || !map) return;
    setHistory((h) => [...h, map]);
    setMap(future[0]);
    setFuture((f) => f.slice(1));
  };

  const characterOptions = campaign.data?.characters ?? [];
  const revealedSet = useMemo(() => (map?.fog.enabled ? new Set(map.fog.revealed) : null), [map?.fog]);

  if (query.isLoading || !map) return <Spinner />;
  if (query.error) return <Alert tone="danger">{errorMessage(query.error)}</Alert>;

  const paintCell = (cell: Cell) => {
    if (!inBounds(map.grid, cell)) return;
    const i = cellIndex(map.grid, cell);
    if (tool === "terrain") {
      const value = terrainKey === "none" ? null : terrainKey;
      if (map.terrain[i] === value) return;
      update((m) => ({ ...m, terrain: m.terrain.map((x, j) => (j === i ? value : x)) }), !painting.current);
    } else if (tool === "fog") {
      const has = map.fog.revealed.includes(i);
      if (has === fogReveal) return;
      update((m) => ({ ...m, fog: { ...m.fog, revealed: fogReveal ? [...m.fog.revealed, i] : m.fog.revealed.filter((x) => x !== i) } }), !painting.current);
    }
  };

  const addToken = (cell: Cell) => {
    let token: Token | null = null;
    if (tokenSource.startsWith("pc:")) {
      const c = characterOptions.find((x) => x.id === tokenSource.slice(3));
      if (!c) return;
      token = { id: newId("tok"), name: c.name.split(" ")[0], kind: "pc", side: "party", col: cell.col, row: cell.row, size: 1, layer: "tokens", hidden: false, label: c.name[0], color: "#1f6feb", characterId: c.id };
    } else if (tokenSource.startsWith("monster:")) {
      const key = tokenSource.slice(8);
      const m = monsters.data?.find((x) => x.key === key);
      const size = m ? ({ tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 } as Record<string, number>)[m.size] ?? 1 : 1;
      const count = map.tokens.filter((x) => x.monsterKey === key).length;
      token = { id: newId("tok"), name: `${m?.name ?? key}${count ? ` ${count + 1}` : ""}`, kind: "monster", side: "enemy", col: cell.col, row: cell.row, size, layer: "tokens", hidden: false, label: `${(m?.name ?? key)[0]}${count + 1}`.toUpperCase(), color: "#b3261e", monsterKey: key };
    } else {
      token = { id: newId("tok"), name: tokenName || "NPC", kind: "npc", side: "neutral", col: cell.col, row: cell.row, size: 1, layer: "tokens", hidden: false, label: (tokenName || "N")[0].toUpperCase(), color: "#6e7781" };
    }
    update((m) => ({ ...m, tokens: [...m.tokens, token!] }));
    setSelected(token.id);
    announce(t("editor.tokenAdded", "{{name}} placed", { name: token.name }));
  };

  const onPointer = (e: { type: "down" | "move" | "up"; cell: Cell; point: Point; button: number; shift: boolean; tokenId: string | null }) => {
    if (tool === "terrain" || tool === "fog") {
      if (e.type === "down") {
        painting.current = false;
        paintCell(e.cell);
        painting.current = true;
      } else if (e.type === "move" && painting.current) paintCell(e.cell);
      else if (e.type === "up") painting.current = false;
      return;
    }
    if (tool === "wall") {
      const v = snapVertex(map, e.point);
      if (e.type === "down") setPendingWall({ a: v, b: v });
      else if (e.type === "move" && pendingWall) setPendingWall({ ...pendingWall, b: v });
      else if (e.type === "up" && pendingWall) {
        const b = v;
        if (b.x !== pendingWall.a.x || b.y !== pendingWall.a.y) {
          update((m) => ({ ...m, walls: [...m.walls, { id: newId("wall"), a: pendingWall.a, b, kind: wallKind, open: wallKind === "door" ? false : undefined, secret: wallKind === "door" && secretDoor ? true : undefined }] }));
        }
        setPendingWall(null);
      }
      return;
    }
    if (e.type !== "up") return;
    switch (tool) {
      case "eraseWall": {
        const near = map.walls.map((w) => ({ w, d: distanceToSegment(e.point, w.a, w.b) })).sort((a, b) => a.d - b.d)[0];
        if (near && near.d < map.grid.cellSize * 0.25) update((m) => ({ ...m, walls: m.walls.filter((w) => w.id !== near.w.id) }));
        break;
      }
      case "decor": {
        const nearby = map.decor.find((d) => Math.hypot(d.x - e.point.x, d.y - e.point.y) < (d.size * map.grid.cellSize) / 2);
        if (nearby && e.shift) {
          update((m) => ({ ...m, decor: m.decor.filter((d) => d.id !== nearby.id) }));
          break;
        }
        const poly = cellPolygon(map.grid, e.cell);
        const cx0 = poly.reduce((s, p) => s + p.x, 0) / poly.length;
        const cy0 = poly.reduce((s, p) => s + p.y, 0) / poly.length;
        update((m) => ({ ...m, decor: [...m.decor, { id: newId("dec"), icon: decorIcon, x: cx0, y: cy0, size: 1, rotation: 0, layer: decorLayer, blocksSight: decorBlocks || undefined }] }));
        break;
      }
      case "token":
        addToken(e.cell);
        break;
      case "select": {
        if (e.tokenId) {
          setSelected(e.tokenId);
          break;
        }
        const door = map.walls.find((w) => w.kind === "door" && distanceToSegment(e.point, w.a, w.b) < map.grid.cellSize * 0.2);
        if (door) update((m) => ({ ...m, walls: m.walls.map((w) => (w.id === door.id ? { ...w, open: !w.open } : w)) }));
        else setSelected(null);
        break;
      }
    }
  };

  const moveSelected = (dc: number, dr: number) => {
    const token = map.tokens.find((x) => x.id === selected);
    if (!token) return;
    const to = { col: token.col + dc, row: token.row + dr };
    if (!inBounds(map.grid, to)) return;
    update((m) => ({ ...m, tokens: m.tokens.map((x) => (x.id === token.id ? { ...x, ...to } : x)) }));
    announce(`${token.name}: ${String.fromCharCode(65 + to.col)}${to.row + 1}`);
  };

  const selectedToken = map.tokens.find((x) => x.id === selected);
  const tools: { id: Tool; label: string; icon: React.ReactNode }[] = [
    { id: "select", label: t("editor.select", "Select / move"), icon: <Hand aria-hidden className="h-4 w-4" /> },
    { id: "terrain", label: t("editor.terrain", "Paint ground"), icon: <Brush aria-hidden className="h-4 w-4" /> },
    { id: "wall", label: t("editor.walls", "Walls and doors"), icon: <DoorOpen aria-hidden className="h-4 w-4" /> },
    { id: "eraseWall", label: t("editor.eraseWall", "Erase walls"), icon: <Eraser aria-hidden className="h-4 w-4" /> },
    { id: "decor", label: t("editor.decor", "Decor"), icon: <Mountain aria-hidden className="h-4 w-4" /> },
    { id: "token", label: t("editor.tokens", "Tokens"), icon: <UserPlus aria-hidden className="h-4 w-4" /> },
    { id: "fog", label: t("editor.fog", "Fog of war"), icon: <Eye aria-hidden className="h-4 w-4" /> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("editor.title", "Map editor")}
        subtitle={
          <Link to="/campaigns/$id" params={{ id: campaignId }} search={{ tab: "maps" }} className="underline">
            ← {campaign.data?.name ?? t("editor.campaign", "Campaign")}
          </Link>
        }
        actions={
          <>
            <IconButton label={t("editor.undo", "Undo")} variant="secondary" onPress={undo} isDisabled={!history.length}>
              <Undo2 aria-hidden className="h-5 w-5" />
            </IconButton>
            <IconButton label={t("editor.redo", "Redo")} variant="secondary" onPress={redo} isDisabled={!future.length}>
              <Redo2 aria-hidden className="h-5 w-5" />
            </IconButton>
            <Button variant="primary" onPress={() => save.mutate()} loading={save.isPending} isDisabled={!dirty}>
              <Save aria-hidden className="h-4 w-4" />
              {dirty ? t("editor.save", "Save") : t("editor.savedState", "Saved")}
            </Button>
          </>
        }
      />
      {save.error && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
      <ToggleButtonGroup
        aria-label={t("editor.tools", "Tools")}
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[tool]}
        onSelectionChange={(keys) => setTool([...keys][0] as Tool)}
        className="flex flex-wrap gap-2"
      >
        {tools.map((x) => (
          <ToggleButton
            key={x.id}
            id={x.id}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-3 font-medium data-[selected]:border-brand data-[selected]:bg-brand data-[selected]:text-brand-text"
          >
            {x.icon}
            {x.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-2">
          <MapCanvas
            grid={map.grid}
            terrain={map.terrain}
            decor={map.decor}
            walls={map.walls}
            tokens={map.tokens}
            backgroundUrl={map.background ? `/api/assets/${map.background.assetId}` : null}
            backgroundOpacity={map.background?.opacity}
            fogView={map.fog.enabled && tool === "fog" ? "gm" : "none"}
            revealed={revealedSet}
            visible={null}
            selectedTokenId={selected}
            pendingWall={pendingWall}
            draggableTokens={tool === "select"}
            onPointer={onPointer}
            onTokenDrop={(id, cell) => {
              if (!inBounds(map.grid, cell)) return;
              update((m) => ({ ...m, tokens: m.tokens.map((x) => (x.id === id ? { ...x, col: cell.col, row: cell.row } : x)) }));
            }}
            onKeyDown={(e) => {
              const moves: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
              if (moves[e.key] && selected) {
                e.preventDefault();
                moveSelected(...moves[e.key]);
              } else if ((e.key === "Delete" || e.key === "Backspace") && selected) {
                update((m) => ({ ...m, tokens: m.tokens.filter((x) => x.id !== selected) }));
                setSelected(null);
              } else if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                undo();
              }
            }}
            ariaLabel={t("editor.canvasLabel", "Map editor canvas. Select a token in the text view, then use the arrow keys to move it, Delete to remove it.")}
            ariaDescribedBy="editor-text-view"
            fit
          />
          <p className="text-sm text-muted">{t("editor.help", "Mouse wheel: zoom · right or middle button: pan · shift+click on decor: remove it · click a door with the select tool: open/close it.")}</p>
        </div>
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            {tool === "terrain" && (
              <Select
                label={t("editor.ground", "Ground")}
                value={terrainKey}
                onChange={setTerrainKey}
                options={[{ id: "none", label: t("editor.eraseGround", "Empty (eraser)") }, ...Object.entries(TERRAINS).map(([k, v]) => ({ id: k, label: v.label }))]}
              />
            )}
            {tool === "wall" && (
              <>
                <RadioGroup
                  label={t("editor.wallKind", "Draw")}
                  value={wallKind}
                  onChange={(v) => setWallKind(v as Wall["kind"])}
                  options={[
                    { id: "wall", label: t("editor.wall", "Wall"), description: t("editor.wallHelp", "Blocks movement and sight") },
                    { id: "door", label: t("editor.door", "Door"), description: t("editor.doorHelp", "Blocks both when closed") },
                    { id: "window", label: t("editor.window", "Window"), description: t("editor.windowHelp", "Blocks movement, not sight") },
                  ]}
                />
                {wallKind === "door" && (
                  <Checkbox isSelected={secretDoor} onChange={setSecretDoor}>
                    {t("editor.secret", "Secret door (shown as a wall to players)")}
                  </Checkbox>
                )}
                <p className="text-sm text-muted">{t("editor.wallDraw", "Press on a grid corner and release on another one.")}</p>
              </>
            )}
            {tool === "decor" && (
              <>
                <Select label={t("editor.decorItem", "Item")} value={decorIcon} onChange={setDecorIcon} options={Object.entries(DECOR_ICONS).map(([k, v]) => ({ id: k, label: v }))} />
                <RadioGroup
                  label={t("editor.layer", "Layer")}
                  orientation="horizontal"
                  value={decorLayer}
                  onChange={(v) => setDecorLayer(v as "decor" | "gm")}
                  options={[
                    { id: "decor", label: t("editor.layerDecor", "Decor (visible)") },
                    { id: "gm", label: t("editor.layerGm", "Game master only") },
                  ]}
                />
                <Checkbox isSelected={decorBlocks} onChange={setDecorBlocks}>
                  {t("editor.blocks", "Blocks line of sight")}
                </Checkbox>
              </>
            )}
            {tool === "token" && (
              <>
                <Select
                  label={t("editor.tokenSource", "Token")}
                  value={tokenSource.startsWith("monster:") ? "monster" : tokenSource}
                  onChange={setTokenSource}
                  options={[
                    { id: "npc", label: t("editor.npc", "Non-player character") },
                    { id: "monster", label: t("editor.monster", "Monster from the bestiary") },
                    ...characterOptions.map((c) => ({ id: `pc:${c.id}`, label: `${c.name} (${t("editor.pc", "character")})` })),
                  ]}
                />
                {tokenSource === "npc" && <TextField label={t("editor.tokenName", "Name")} value={tokenName} onChange={setTokenName} />}
                {(tokenSource === "monster" || tokenSource.startsWith("monster:")) && (
                  <>
                    <TextField label={t("editor.findMonster", "Find a monster")} value={monsterQuery} onChange={setMonsterQuery} />
                    <ul className="flex max-h-48 flex-col gap-1 overflow-auto">
                      {monsters.data?.slice(0, 20).map((m) => (
                        <li key={m.key}>
                          <Checkbox isSelected={tokenSource === `monster:${m.key}`} onChange={() => setTokenSource(`monster:${m.key}`)}>
                            {m.name} <span className="text-sm text-muted">CR {m.cr}</span>
                          </Checkbox>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="text-sm text-muted">{t("editor.tokenHelp", "Click a cell to place the token.")}</p>
              </>
            )}
            {tool === "fog" && (
              <>
                <Switch isSelected={map.fog.enabled} onChange={(v) => update((m) => ({ ...m, fog: { ...m.fog, enabled: v } }))}>
                  {t("editor.fogEnabled", "Fog of war enabled")}
                </Switch>
                <RadioGroup
                  label={t("editor.fogMode", "Reveal")}
                  value={map.fog.mode}
                  onChange={(v) => update((m) => ({ ...m, fog: { ...m.fog, mode: v as "auto" | "manual" } }))}
                  options={[
                    { id: "auto", label: t("editor.fogAuto", "Automatic"), description: t("editor.fogAutoHelp", "Line of sight of the characters, plus manual reveals") },
                    { id: "manual", label: t("editor.fogManual", "Manual only") },
                  ]}
                />
                <RadioGroup
                  label={t("editor.brush", "Brush")}
                  orientation="horizontal"
                  value={fogReveal ? "reveal" : "hide"}
                  onChange={(v) => setFogReveal(v === "reveal")}
                  options={[
                    { id: "reveal", label: t("editor.reveal", "Reveal") },
                    { id: "hide", label: t("editor.hide", "Hide") },
                  ]}
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onPress={() => update((m) => ({ ...m, fog: { ...m.fog, revealed: m.terrain.map((_, i) => i) } }))}>
                    {t("editor.revealAll", "Reveal all")}
                  </Button>
                  <Button size="sm" onPress={() => update((m) => ({ ...m, fog: { ...m.fog, revealed: [] } }))}>
                    {t("editor.hideAll", "Hide all")}
                  </Button>
                </div>
              </>
            )}
            {tool === "select" && selectedToken && (
              <div className="flex flex-col gap-2">
                <TextField label={t("editor.tokenName", "Name")} value={selectedToken.name} onChange={(v) => update((m) => ({ ...m, tokens: m.tokens.map((x) => (x.id === selected ? { ...x, name: v } : x)) }), false)} />
                <TextField label={t("editor.tokenLabel", "Label (1–3 letters)")} value={selectedToken.label} onChange={(v) => update((m) => ({ ...m, tokens: m.tokens.map((x) => (x.id === selected ? { ...x, label: v.slice(0, 3) } : x)) }), false)} />
                <Select
                  label={t("editor.side", "Side")}
                  value={selectedToken.side}
                  onChange={(v) => update((m) => ({ ...m, tokens: m.tokens.map((x) => (x.id === selected ? { ...x, side: v as Token["side"] } : x)) }))}
                  options={[
                    { id: "party", label: t("textview.party", "Party") },
                    { id: "enemy", label: t("textview.enemy", "Enemy") },
                    { id: "neutral", label: t("textview.neutral", "Neutral") },
                  ]}
                />
                <NumberField label={t("editor.size", "Size (cells)")} value={selectedToken.size} minValue={1} maxValue={8} onChange={(v) => update((m) => ({ ...m, tokens: m.tokens.map((x) => (x.id === selected ? { ...x, size: v } : x)) }))} />
                <NumberField label={t("editor.vision", "Darkvision / vision range (ft, 0 = unlimited)")} value={selectedToken.visionRange ?? 0} minValue={0} maxValue={600} step={5} onChange={(v) => update((m) => ({ ...m, tokens: m.tokens.map((x) => (x.id === selected ? { ...x, visionRange: v } : x)) }))} />
                <Checkbox isSelected={selectedToken.hidden} onChange={(v) => update((m) => ({ ...m, tokens: m.tokens.map((x) => (x.id === selected ? { ...x, hidden: v } : x)) }))}>
                  {t("editor.hidden", "Hidden from the players")}
                </Checkbox>
                <Checkbox isSelected={selectedToken.layer === "gm"} onChange={(v) => update((m) => ({ ...m, tokens: m.tokens.map((x) => (x.id === selected ? { ...x, layer: v ? "gm" : "tokens" } : x)) }))}>
                  {t("editor.onGmLayer", "On the game master layer")}
                </Checkbox>
                <Button
                  variant="danger"
                  size="sm"
                  onPress={() => {
                    update((m) => ({ ...m, tokens: m.tokens.filter((x) => x.id !== selected) }));
                    setSelected(null);
                  }}
                >
                  {t("editor.removeToken", "Remove the token")}
                </Button>
              </div>
            )}
          </Card>
          <Card className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-semibold">{t("editor.mapSettings", "Map settings")}</h2>
            <TextField label={t("editor.name", "Name")} value={name} onChange={(v) => (setName(v), setDirty(true))} />
            <TextArea label={t("editor.description", "Description")} value={description} onChange={(v) => (setDescription(v), setDirty(true))} rows={2} />
            <RadioGroup
              label={t("editor.gridType", "Grid")}
              orientation="horizontal"
              value={map.grid.type}
              onChange={(v) => update((m) => ({ ...m, grid: { ...m.grid, type: v as "square" | "hex" } }))}
              options={[
                { id: "square", label: t("textview.square", "Square") },
                { id: "hex", label: t("textview.hex", "Hexagonal") },
              ]}
            />
            <div className="grid grid-cols-2 gap-2">
              <NumberField label={t("editor.cols", "Columns")} value={map.grid.cols} minValue={4} maxValue={120} onChange={(v) => update((m) => resizeMap(m, v, m.grid.rows))} />
              <NumberField label={t("editor.rows", "Rows")} value={map.grid.rows} minValue={4} maxValue={120} onChange={(v) => update((m) => resizeMap(m, m.grid.cols, v))} />
            </div>
            <Select
              label={t("editor.diagonals", "Diagonal moves")}
              value={map.grid.diagonals}
              onChange={(v) => update((m) => ({ ...m, grid: { ...m.grid, diagonals: v as "standard" | "alternate" } }))}
              options={[
                { id: "standard", label: t("editor.diagStandard", "5 ft each (standard rule)") },
                { id: "alternate", label: t("editor.diagAlternate", "5 / 10 / 5 ft (variant)") },
              ]}
            />
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">{t("editor.background", "Background image")}</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="text-sm"
                aria-label={t("editor.uploadBackground", "Upload a background image")}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const asset = await api.upload<{ id: string }>(`/assets?campaignId=${campaignId}`, file);
                  update((m) => ({ ...m, background: { assetId: asset.id, opacity: m.background?.opacity ?? 1 } }));
                  announce(t("editor.bgUploaded", "Background uploaded"));
                }}
              />
              {map.background && (
                <>
                  <NumberField
                    label={t("editor.opacity", "Opacity (%)")}
                    value={Math.round(map.background.opacity * 100)}
                    minValue={10}
                    maxValue={100}
                    step={10}
                    onChange={(v) => update((m) => ({ ...m, background: m.background ? { ...m.background, opacity: v / 100 } : null }), false)}
                  />
                  <Button size="sm" onPress={() => update((m) => ({ ...m, background: null }))}>
                    {t("editor.removeBackground", "Remove the background")}
                  </Button>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
      <Card>
        <MapTextView
          id="editor-text-view"
          grid={map.grid}
          tokens={map.tokens}
          terrain={map.terrain}
          revealed={null}
          selectedTokenId={selected}
          onSelect={(id) => {
            setSelected(id);
            setTool("select");
          }}
          doors={map.walls.filter((w) => w.kind === "door").map((w, i) => ({ id: w.id, open: !!w.open, label: `${t("editor.door", "Door")} ${i + 1}${w.secret ? ` (${t("editor.secretShort", "secret")})` : ""}` }))}
          onToggleDoor={(id) => update((m) => ({ ...m, walls: m.walls.map((w) => (w.id === id ? { ...w, open: !w.open } : w)) }))}
        />
      </Card>
      <p className={cx("text-sm", dirty ? "text-accent" : "text-muted")} role="status">
        {dirty ? t("editor.unsaved", "Unsaved changes") : t("editor.allSaved", "All changes saved")}
      </p>
    </div>
  );
}
