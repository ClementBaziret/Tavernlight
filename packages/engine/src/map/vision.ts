import { cellCenter, cellIndex, feetToPixels, inBounds, mapPixelSize, tokenCenter } from "./grid";
import type { Cell, DecorItem, GridDef, MapData, Point, Token, Wall } from "./types";

export interface Segment {
  a: Point;
  b: Point;
}

function orientation(p: Point, q: Point, r: Point): number {
  const v = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return Math.abs(v) < 1e-9 ? 0 : v > 0 ? 1 : -1;
}

/**
 * True when the segment p1-p2 (a ray of sight or movement) is blocked by the
 * wall q1-q2. Touching a wall end counts as blocked so that sight can't leak
 * through the corner where two walls meet.
 */
export function blocks(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  const o1 = orientation(p1, p2, q1);
  const o2 = orientation(p1, p2, q2);
  if (o1 === 0 && o2 === 0) return false; // collinear: sliding along a wall
  const o3 = orientation(q1, q2, p1);
  const o4 = orientation(q1, q2, p2);
  return o1 * o2 <= 0 && o3 * o4 < 0;
}

function decorSegments(grid: GridDef, d: DecorItem): Segment[] {
  const half = (d.size * grid.cellSize) / 2 - 2;
  const corners = [
    { x: d.x - half, y: d.y - half },
    { x: d.x + half, y: d.y - half },
    { x: d.x + half, y: d.y + half },
    { x: d.x - half, y: d.y + half },
  ];
  return corners.map((a, i) => ({ a, b: corners[(i + 1) % 4] }));
}

export function sightBlockers(map: Pick<MapData, "walls" | "decor" | "grid">): Segment[] {
  const segments: Segment[] = map.walls.filter((w) => w.kind === "wall" || (w.kind === "door" && !w.open)).map((w) => ({ a: w.a, b: w.b }));
  for (const d of map.decor) if (d.blocksSight && d.layer === "decor") segments.push(...decorSegments(map.grid, d));
  return segments;
}

export function movementBlockers(walls: Wall[]): Segment[] {
  return walls.filter((w) => w.kind !== "door" || !w.open).map((w) => ({ a: w.a, b: w.b }));
}

export function lineBlocked(from: Point, to: Point, segments: Segment[]): boolean {
  for (const s of segments) if (blocks(from, to, s.a, s.b)) return true;
  return false;
}

/** Sample points of a cell: its centre plus four points near its corners. */
function samplePoints(grid: GridDef, cell: Cell): Point[] {
  const c = cellCenter(grid, cell);
  const d = grid.cellSize * 0.35;
  return [c, { x: c.x - d, y: c.y - d }, { x: c.x + d, y: c.y - d }, { x: c.x + d, y: c.y + d }, { x: c.x - d, y: c.y + d }];
}

/**
 * Cells visible from a point: a cell is visible when at least one of its
 * sample points can be reached by an unblocked straight line.
 */
export function visibleCellsFrom(grid: GridDef, origin: Point, segments: Segment[], rangeFeet = 0): Set<number> {
  const visible = new Set<number>();
  const rangePx = rangeFeet > 0 ? feetToPixels(grid, rangeFeet) + grid.cellSize / 2 : Infinity;
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const cell = { col, row };
      const center = cellCenter(grid, cell);
      if (Math.hypot(center.x - origin.x, center.y - origin.y) > rangePx) continue;
      for (const p of samplePoints(grid, cell)) {
        if (!lineBlocked(origin, p, segments)) {
          visible.add(cellIndex(grid, cell));
          break;
        }
      }
    }
  }
  return visible;
}

/** Union of the cells seen by the given tokens. */
export function visibleCellsForTokens(map: MapData, tokens: Token[]): Set<number> {
  const segments = sightBlockers(map);
  const result = new Set<number>();
  for (const t of tokens) {
    for (const index of visibleCellsFrom(map.grid, tokenCenter(map.grid, t), segments, t.visionRange ?? 0)) result.add(index);
  }
  return result;
}

/** Tokens whose eyes reveal the map to players: the party's characters. */
export function partyViewers(map: MapData): Token[] {
  return map.tokens.filter((t) => t.kind === "pc" && t.layer === "tokens" && !t.hidden);
}

/**
 * Checks a token move along a straight path; returns the blocking wall, if
 * any. Each step between consecutive cells is tested, so a move around a
 * corner should be made in several steps.
 */
export function moveBlocked(map: MapData, token: Token, to: Cell): boolean {
  if (!inBounds(map.grid, to)) return true;
  const from = tokenCenter(map.grid, token);
  const target = tokenCenter(map.grid, { ...token, col: to.col, row: to.row });
  return lineBlocked(from, target, movementBlockers(map.walls));
}

/**
 * Visibility polygon around a point (sorted ray casting towards every wall
 * end), useful to draw smooth light. Coordinates are in pixels.
 */
export function visibilityPolygon(map: MapData, origin: Point): Point[] {
  const { width, height } = mapPixelSize(map.grid);
  const segments = [
    ...sightBlockers(map),
    { a: { x: 0, y: 0 }, b: { x: width, y: 0 } },
    { a: { x: width, y: 0 }, b: { x: width, y: height } },
    { a: { x: width, y: height }, b: { x: 0, y: height } },
    { a: { x: 0, y: height }, b: { x: 0, y: 0 } },
  ];
  const angles: number[] = [];
  for (const s of segments) {
    for (const p of [s.a, s.b]) {
      const angle = Math.atan2(p.y - origin.y, p.x - origin.x);
      angles.push(angle - 0.0001, angle, angle + 0.0001);
    }
  }
  const points: { angle: number; point: Point }[] = [];
  for (const angle of angles) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let closest = Infinity;
    for (const s of segments) {
      const t = raySegment(origin, dx, dy, s);
      if (t !== null && t < closest) closest = t;
    }
    if (closest < Infinity) points.push({ angle, point: { x: origin.x + dx * closest, y: origin.y + dy * closest } });
  }
  return points.sort((a, b) => a.angle - b.angle).map((p) => p.point);
}

function raySegment(o: Point, dx: number, dy: number, s: Segment): number | null {
  const sx = s.b.x - s.a.x;
  const sy = s.b.y - s.a.y;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((s.a.x - o.x) * sy - (s.a.y - o.y) * sx) / denom;
  const u = ((s.a.x - o.x) * dy - (s.a.y - o.y) * dx) / denom;
  if (t < 0 || u < 0 || u > 1) return null;
  return t;
}
