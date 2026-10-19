import type { AreaDef } from "../rules/types";
import { cellCenter, cellIndex, feetToPixels, tokenCells, tokenCenter } from "./grid";
import { lineBlocked, sightBlockers } from "./vision";
import type { GridDef, MapData, Point, Token } from "./types";

/** Half-angle of a 5e cone: its width equals its length at any distance. */
const CONE_HALF_ANGLE = Math.atan(0.5);

export interface AreaPlacement {
  area: AreaDef;
  /** Point of origin in pixels (sphere centre, cone apex, line start, cube face centre). */
  origin: Point;
  /** Direction in radians for cones, lines and cubes. */
  direction: number;
}

/**
 * Builds a placement from a caster position and a target point, the way the
 * template tool works: spheres are centred on the target, cones/lines start
 * at the caster and point at the target, cubes start at the target face.
 */
export function placeArea(area: AreaDef, caster: Point | null, target: Point): AreaPlacement {
  const from = caster ?? target;
  const direction = Math.atan2(target.y - from.y, target.x - from.x);
  switch (area.shape) {
    case "cone":
    case "line":
      return { area, origin: from, direction };
    case "emanation":
      return { area, origin: from, direction: 0 };
    default:
      return { area, origin: target, direction };
  }
}

/** True when a pixel point lies inside the area (ignoring walls). */
export function pointInArea(grid: GridDef, placement: AreaPlacement, p: Point, slack = 0): boolean {
  const { area, origin, direction } = placement;
  const size = feetToPixels(grid, area.size) + slack;
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  const along = dx * Math.cos(direction) + dy * Math.sin(direction);
  const across = -dx * Math.sin(direction) + dy * Math.cos(direction);
  switch (area.shape) {
    case "sphere":
    case "cylinder":
    case "emanation":
      return Math.hypot(dx, dy) <= size;
    case "cone": {
      const distance = Math.hypot(dx, dy);
      if (distance === 0 || distance > size) return false;
      return Math.abs(Math.atan2(across, along)) <= CONE_HALF_ANGLE + 1e-6;
    }
    case "line": {
      const width = feetToPixels(grid, area.width ?? 5) + slack;
      return along >= 0 && along <= size && Math.abs(across) <= width / 2;
    }
    case "cube":
      return along >= -slack && along <= size && Math.abs(across) <= size / 2;
  }
}

/** Cells of the map covered by the area; walls block the area's spread. */
export function cellsInArea(map: MapData, placement: AreaPlacement): Set<number> {
  const cells = new Set<number>();
  const segments = sightBlockers(map);
  const slack = map.grid.cellSize * 0.01;
  for (let row = 0; row < map.grid.rows; row++) {
    for (let col = 0; col < map.grid.cols; col++) {
      const center = cellCenter(map.grid, { col, row });
      if (!pointInArea(map.grid, placement, center, slack)) continue;
      if (lineBlocked(placement.origin, center, segments)) continue;
      cells.add(cellIndex(map.grid, { col, row }));
    }
  }
  return cells;
}

/**
 * Tokens touched by the area, allies included. The caster of an emanation is
 * excluded (pass its id).
 */
export function tokensInArea(map: MapData, placement: AreaPlacement, excludeTokenId?: string): Token[] {
  const cells = cellsInArea(map, placement);
  return map.tokens.filter((t) => {
    if (t.id === excludeTokenId || t.kind === "object") return false;
    return tokenCells(t).some((c) => cells.has(cellIndex(map.grid, c)));
  });
}

/** Outline of the area in pixels, for drawing the template. */
export function areaOutline(grid: GridDef, placement: AreaPlacement): Point[] {
  const { area, origin, direction } = placement;
  const size = feetToPixels(grid, area.size);
  const rotate = (along: number, across: number): Point => ({
    x: origin.x + along * Math.cos(direction) - across * Math.sin(direction),
    y: origin.y + along * Math.sin(direction) + across * Math.cos(direction),
  });
  switch (area.shape) {
    case "sphere":
    case "cylinder":
    case "emanation": {
      const points: Point[] = [];
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        points.push({ x: origin.x + size * Math.cos(a), y: origin.y + size * Math.sin(a) });
      }
      return points;
    }
    case "cone": {
      const points: Point[] = [origin];
      for (let i = 0; i <= 16; i++) {
        const a = -CONE_HALF_ANGLE + (i / 16) * 2 * CONE_HALF_ANGLE;
        points.push(rotate(size * Math.cos(a), size * Math.sin(a)));
      }
      return points;
    }
    case "line": {
      const w = feetToPixels(grid, area.width ?? 5) / 2;
      return [rotate(0, -w), rotate(size, -w), rotate(size, w), rotate(0, w)];
    }
    case "cube":
      return [rotate(0, -size / 2), rotate(size, -size / 2), rotate(size, size / 2), rotate(0, size / 2)];
  }
}

export function tokenOrigin(map: MapData, token: Token): Point {
  return tokenCenter(map.grid, token);
}
