export type GridType = "square" | "hex";

export interface GridDef {
  type: GridType;
  cols: number;
  rows: number;
  /** Cell size in pixels (square side; hex: distance between neighbouring centres). */
  cellSize: number;
  feetPerCell: number;
  /** 2024 default: every diagonal step costs one cell. "alternate": 5-10-5. */
  diagonals: "standard" | "alternate";
}

export interface Point {
  x: number;
  y: number;
}

export interface Cell {
  col: number;
  row: number;
}

export type WallKind = "wall" | "door" | "window";

export interface Wall {
  id: string;
  a: Point;
  b: Point;
  kind: WallKind;
  /** Doors only. */
  open?: boolean;
  /** Secret doors are drawn only on the game master's view. */
  secret?: boolean;
}

export type LayerName = "background" | "decor" | "tokens" | "gm";

export interface DecorItem {
  id: string;
  /** Icon key from the built-in decor set (tree, rock, chest...). */
  icon: string;
  x: number;
  y: number;
  /** Size in cells. */
  size: number;
  rotation: number;
  layer: "decor" | "gm";
  label?: string;
  /** Blocks sight like a wall (pillars, boulders). */
  blocksSight?: boolean;
}

export type TokenKind = "pc" | "npc" | "monster" | "object";
export type Side = "party" | "enemy" | "neutral";

export interface Token {
  id: string;
  name: string;
  kind: TokenKind;
  side: Side;
  col: number;
  row: number;
  /** Size in cells (1 = medium, 2 = large...). */
  size: number;
  layer: "tokens" | "gm";
  /** Hidden by the game master: never sent to the players' view. */
  hidden: boolean;
  /** Short label drawn on the token (1-2 characters). */
  label: string;
  color: string;
  characterId?: string;
  monsterKey?: string;
  /** Vision range in feet when the character sees in the dark; 0 = unlimited light. */
  visionRange?: number;
}

export interface FogState {
  /** "manual": only the game master reveals; "auto": party line of sight also reveals. */
  mode: "manual" | "auto";
  /** Revealed cell indices (row * cols + col). */
  revealed: number[];
  /** When false, the whole map is visible to players. */
  enabled: boolean;
}

export interface MapData {
  grid: GridDef;
  /** Asset id of the background image, if any. */
  background?: { assetId: string; opacity: number } | null;
  /** Painted terrain per cell (null = empty), length cols * rows. */
  terrain: (string | null)[];
  decor: DecorItem[];
  walls: Wall[];
  tokens: Token[];
  fog: FogState;
}
