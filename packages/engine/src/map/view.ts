import { cellIndex, pixelToCell, tokenCells } from "./grid";
import { partyViewers, visibleCellsForTokens } from "./vision";
import type { MapData, Point, Token, Wall } from "./types";

export interface FogUpdate {
  /** Cells currently in the party's line of sight. */
  visible: Set<number>;
  /** Revealed cells after adding what the party sees (auto mode). */
  revealed: Set<number>;
}

/** Recomputes what the party sees and, in automatic mode, reveals it. */
export function computeFog(map: MapData): FogUpdate {
  const revealed = new Set(map.fog.revealed);
  const visible = visibleCellsForTokens(map, partyViewers(map));
  if (map.fog.mode === "auto") for (const c of visible) revealed.add(c);
  return { visible, revealed };
}

export function revealCells(map: MapData, cells: number[], reveal: boolean): number[] {
  const set = new Set(map.fog.revealed);
  for (const c of cells) {
    if (reveal) set.add(c);
    else set.delete(c);
  }
  return [...set].sort((a, b) => a - b);
}

export interface PlayerToken {
  id: string;
  name: string;
  kind: Token["kind"];
  side: Token["side"];
  col: number;
  row: number;
  size: number;
  label: string;
  color: string;
  characterId?: string;
}

export interface PlayerMapView {
  grid: MapData["grid"];
  hasBackground: boolean;
  backgroundOpacity: number;
  /** Terrain of revealed cells only. */
  terrain: (string | null)[];
  decor: MapData["decor"];
  walls: Omit<Wall, "secret">[];
  tokens: PlayerToken[];
  /** Cells the players may see (null when the fog is disabled). */
  revealed: number[] | null;
  /** Cells currently in the party's line of sight. */
  visible: number[];
}

function isPointRevealed(map: MapData, revealed: Set<number> | null, p: Point): boolean {
  if (!revealed) return true;
  const cell = pixelToCell(map.grid, p);
  return revealed.has(cellIndex(map.grid, cell));
}

/** A wall is shown when a revealed cell lies on either side of it. */
function wallTouchesRevealed(map: MapData, revealed: Set<number>, w: Wall): boolean {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const length = Math.hypot(dx, dy) || 1;
  const offset = map.grid.cellSize * 0.3;
  const nx = (-dy / length) * offset;
  const ny = (dx / length) * offset;
  for (const t of [0.1, 0.5, 0.9]) {
    const p = { x: w.a.x + dx * t, y: w.a.y + dy * t };
    if (isPointRevealed(map, revealed, { x: p.x + nx, y: p.y + ny }) || isPointRevealed(map, revealed, { x: p.x - nx, y: p.y - ny })) return true;
  }
  return false;
}

/** True when the players can see this token right now. */
export function tokenVisibleToPlayers(map: MapData, token: Token, visible: Set<number>, revealed: Set<number> | null): boolean {
  if (token.layer === "gm" || token.hidden) return false;
  if (token.kind === "pc") return true;
  if (!revealed) return true;
  const cells = tokenCells(token).map((c) => cellIndex(map.grid, c));
  // In automatic mode, creatures must be in the line of sight; in manual
  // mode, everything in revealed areas is visible.
  if (map.fog.mode === "auto") return cells.some((c) => visible.has(c));
  return cells.some((c) => revealed.has(c));
}

/**
 * The only map data ever sent to the players' view: unrevealed terrain,
 * decor and walls, the game master layer and hidden tokens are removed here,
 * on the server, before serialization.
 */
export function playerMapView(map: MapData, fog: FogUpdate): PlayerMapView {
  const revealed = map.fog.enabled ? fog.revealed : null;
  const terrain = map.terrain.map((t, i) => (revealed && !revealed.has(i) ? null : t));
  const decor = map.decor.filter((d) => d.layer === "decor" && isPointRevealed(map, revealed, { x: d.x, y: d.y }));
  const walls = map.walls
    .filter((w) => !revealed || wallTouchesRevealed(map, revealed, w))
    // A secret door looks like a plain wall to the players.
    .map(({ secret, ...w }) => (secret ? { ...w, kind: "wall" as const, open: false } : w));
  const tokens: PlayerToken[] = map.tokens
    .filter((t) => tokenVisibleToPlayers(map, t, fog.visible, revealed))
    .map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      side: t.side,
      col: t.col,
      row: t.row,
      size: t.size,
      label: t.label,
      color: t.color,
      characterId: t.kind === "pc" ? t.characterId : undefined,
    }));
  return {
    grid: map.grid,
    hasBackground: !!map.background,
    backgroundOpacity: map.background?.opacity ?? 1,
    terrain,
    decor,
    walls,
    tokens,
    revealed: revealed ? [...revealed].sort((a, b) => a - b) : null,
    visible: [...fog.visible].sort((a, b) => a - b),
  };
}

export function emptyMap(cols = 30, rows = 20, type: "square" | "hex" = "square"): MapData {
  return {
    grid: { type, cols, rows, cellSize: 64, feetPerCell: 5, diagonals: "standard" },
    background: null,
    terrain: Array.from({ length: cols * rows }, () => null),
    decor: [],
    walls: [],
    tokens: [],
    fog: { mode: "auto", revealed: [], enabled: true },
  };
}
