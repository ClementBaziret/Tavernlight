import { newId, type DecorItem, type MapData, type Token, type Wall } from "@tavernlight/engine";

/** Helpers to draw the demo maps in code (walls follow cell edges). */
class MapBuilder {
  readonly data: MapData;

  constructor(cols: number, rows: number, type: "square" | "hex" = "square", fogMode: "auto" | "manual" = "auto") {
    this.data = {
      grid: { type, cols, rows, cellSize: 64, feetPerCell: 5, diagonals: "standard" },
      background: null,
      terrain: Array.from({ length: cols * rows }, () => null),
      decor: [],
      walls: [],
      tokens: [],
      fog: { mode: fogMode, revealed: [], enabled: true },
    };
  }

  private get s() {
    return this.data.grid.cellSize;
  }

  fill(terrain: string, c0: number, r0: number, c1: number, r1: number) {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (c >= 0 && r >= 0 && c < this.data.grid.cols && r < this.data.grid.rows) this.data.terrain[r * this.data.grid.cols + c] = terrain;
    return this;
  }

  /** Wall between grid points (x0,y0)-(x1,y1), in cell units. */
  wall(x0: number, y0: number, x1: number, y1: number, kind: Wall["kind"] = "wall", extra: Partial<Wall> = {}) {
    this.data.walls.push({ id: newId("wall"), a: { x: x0 * this.s, y: y0 * this.s }, b: { x: x1 * this.s, y: y1 * this.s }, kind, ...extra });
    return this;
  }

  /** Rectangular room enclosing cells c0..c1 x r0..r1, with gaps listed as [side, offset]. */
  room(c0: number, r0: number, c1: number, r1: number, terrain: string, doors: { side: "n" | "s" | "e" | "w"; at: number; kind?: "door" | "gap"; open?: boolean; secret?: boolean }[] = []) {
    this.fill(terrain, c0, r0, c1, r1);
    const x0 = c0;
    const y0 = r0;
    const x1 = c1 + 1;
    const y1 = r1 + 1;
    const side = (s: "n" | "s" | "e" | "w", from: number, to: number, fixed: number) => {
      const openings = doors.filter((d) => d.side === s).sort((a, b) => a.at - b.at);
      let cursor = from;
      for (const d of openings) {
        if (d.at > cursor) this.segment(s, cursor, d.at, fixed);
        if (d.kind !== "gap") this.segment(s, d.at, d.at + 1, fixed, "door", { open: d.open ?? false, secret: d.secret });
        cursor = d.at + 1;
      }
      if (cursor < to) this.segment(s, cursor, to, fixed);
    };
    side("n", x0, x1, y0);
    side("s", x0, x1, y1);
    side("w", y0, y1, x0);
    side("e", y0, y1, x1);
    return this;
  }

  private segment(side: "n" | "s" | "e" | "w", from: number, to: number, fixed: number, kind: Wall["kind"] = "wall", extra: Partial<Wall> = {}) {
    if (side === "n" || side === "s") this.wall(from, fixed, to, fixed, kind, extra);
    else this.wall(fixed, from, fixed, to, kind, extra);
  }

  decor(icon: string, col: number, row: number, options: Partial<DecorItem> = {}) {
    const centre = this.centre(col, row);
    this.data.decor.push({ id: newId("dec"), icon, x: centre.x, y: centre.y, size: 1, rotation: 0, layer: "decor", ...options });
    return this;
  }

  centre(col: number, row: number) {
    if (this.data.grid.type === "square") return { x: (col + 0.5) * this.s, y: (row + 0.5) * this.s };
    const r = this.s / Math.sqrt(3);
    return { x: this.s * (col + 0.5 * (row & 1)) + this.s / 2, y: 1.5 * r * row + r };
  }

  token(token: Omit<Token, "id">) {
    this.data.tokens.push({ id: newId("tok"), ...token });
    return this;
  }
}

/** Map 1 — with walls and doors: entrance hall, corridor and burial chamber. */
export function cryptMap(): MapData {
  const m = new MapBuilder(30, 20, "square", "auto");
  m.room(1, 6, 9, 14, "stone", [
    { side: "w", at: 10, kind: "gap" },
    { side: "e", at: 9, kind: "door" },
  ]);
  m.room(10, 8, 16, 10, "stone", [
    { side: "w", at: 9, kind: "gap" },
    { side: "e", at: 9, kind: "gap" },
  ]);
  m.room(17, 3, 28, 16, "tiles", [
    { side: "w", at: 9, kind: "door" },
    { side: "s", at: 22, kind: "door", secret: true },
  ]);
  m.room(20, 17, 25, 19, "dirt", [{ side: "n", at: 22, kind: "gap" }]);
  m.fill("dirt", 0, 10, 0, 10);
  // Pillars block sight in the burial chamber.
  for (const [c, r] of [
    [20, 6],
    [25, 6],
    [20, 13],
    [25, 13],
  ]) {
    m.decor("pillar", c, r, { blocksSight: true });
  }
  m.decor("sarcophagus", 22, 9, { size: 2, label: "Sarcophagus" });
  m.decor("brazier", 18, 4).decor("brazier", 27, 4).decor("chest", 23, 18, { label: "Hidden chest", layer: "gm" });
  m.decor("rubble", 4, 12).decor("barrel", 2, 7).decor("barrel", 3, 7).decor("torch", 5, 6);
  return m.data;
}

/** Map 2 — outdoors on a hex grid: a road through the woods. */
export function forestMap(): MapData {
  const m = new MapBuilder(26, 16, "hex", "auto");
  m.fill("grass", 0, 0, 25, 15);
  for (let c = 0; c < 26; c++) {
    const r = 7 + Math.round(Math.sin(c / 3) * 1.5);
    m.fill("road", c, r, c, r + 1);
  }
  m.fill("water", 19, 1, 22, 3);
  const trees = [
    [2, 2], [4, 3], [6, 1], [8, 4], [11, 2], [13, 4], [15, 1], [17, 3], [24, 5],
    [3, 12], [5, 13], [8, 11], [10, 13], [12, 12], [15, 14], [17, 11], [20, 13], [23, 12], [22, 10],
  ];
  for (const [c, r] of trees) m.decor("tree", c, r, { blocksSight: true });
  m.decor("rock", 14, 6, { blocksSight: true }).decor("rock", 16, 10).decor("cart", 9, 8, { size: 2, label: "Overturned cart" });
  m.decor("campfire", 21, 9);
  return m.data;
}

/** Map 3 — a cave lair on a square grid, with rock walls. */
export function caveMap(): MapData {
  const m = new MapBuilder(24, 18, "square", "auto");
  const cave: [number, number, number, number][] = [
    [1, 7, 6, 10],
    [6, 5, 12, 12],
    [12, 3, 21, 14],
    [8, 12, 11, 16],
  ];
  for (const [c0, r0, c1, r1] of cave) m.fill("cave", c0, r0, c1, r1);
  m.fill("water", 15, 9, 18, 12);
  // Outline the cave with rock walls along the edges of the cave cells.
  const isCave = (c: number, r: number) => c >= 0 && r >= 0 && c < 24 && r < 18 && m.data.terrain[r * 24 + c] !== null;
  for (let r = 0; r < 18; r++) {
    for (let c = 0; c < 24; c++) {
      if (!isCave(c, r)) continue;
      if (!isCave(c, r - 1)) m.wall(c, r, c + 1, r);
      if (!isCave(c, r + 1)) m.wall(c, r + 1, c + 1, r + 1);
      if (!isCave(c - 1, r) && c !== 1) m.wall(c, r, c, r + 1);
      if (!isCave(c + 1, r)) m.wall(c + 1, r, c + 1, r + 1);
    }
  }
  m.decor("bones", 19, 5).decor("bones", 14, 13).decor("rock", 9, 8, { blocksSight: true }).decor("stalagmite", 13, 6, { blocksSight: true });
  m.decor("chest", 20, 4, { label: "Ogre's hoard" }).decor("campfire", 16, 6);
  return m.data;
}
