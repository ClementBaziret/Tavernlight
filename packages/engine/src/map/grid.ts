import type { Cell, GridDef, Point, Token } from "./types";

const SQRT3 = Math.sqrt(3);

/** Hex grids are "pointy-top" with odd rows shifted right (odd-r layout). */
function hexRadius(grid: GridDef): number {
  return grid.cellSize / SQRT3;
}

export function cellIndex(grid: GridDef, cell: Cell): number {
  return cell.row * grid.cols + cell.col;
}

export function cellFromIndex(grid: GridDef, index: number): Cell {
  return { col: index % grid.cols, row: Math.floor(index / grid.cols) };
}

export function inBounds(grid: GridDef, cell: Cell): boolean {
  return cell.col >= 0 && cell.row >= 0 && cell.col < grid.cols && cell.row < grid.rows;
}

export function mapPixelSize(grid: GridDef): { width: number; height: number } {
  if (grid.type === "square") return { width: grid.cols * grid.cellSize, height: grid.rows * grid.cellSize };
  const r = hexRadius(grid);
  return { width: grid.cellSize * (grid.cols + 0.5), height: 1.5 * r * (grid.rows - 1) + 2 * r };
}

export function cellCenter(grid: GridDef, cell: Cell): Point {
  if (grid.type === "square") {
    return { x: (cell.col + 0.5) * grid.cellSize, y: (cell.row + 0.5) * grid.cellSize };
  }
  const r = hexRadius(grid);
  const w = grid.cellSize;
  return { x: w * (cell.col + 0.5 * (cell.row & 1)) + w / 2, y: 1.5 * r * cell.row + r };
}

/** Polygon outline of a cell, used for drawing and fog masks. */
export function cellPolygon(grid: GridDef, cell: Cell): Point[] {
  const c = cellCenter(grid, cell);
  if (grid.type === "square") {
    const h = grid.cellSize / 2;
    return [
      { x: c.x - h, y: c.y - h },
      { x: c.x + h, y: c.y - h },
      { x: c.x + h, y: c.y + h },
      { x: c.x - h, y: c.y + h },
    ];
  }
  const r = hexRadius(grid);
  const points: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    points.push({ x: c.x + r * Math.cos(angle), y: c.y + r * Math.sin(angle) });
  }
  return points;
}

function cubeRound(q: number, r: number): { q: number; r: number } {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}

export function pixelToCell(grid: GridDef, p: Point): Cell {
  if (grid.type === "square") {
    return { col: Math.floor(p.x / grid.cellSize), row: Math.floor(p.y / grid.cellSize) };
  }
  const R = hexRadius(grid);
  const px = p.x - grid.cellSize / 2;
  const py = p.y - R;
  const q = ((SQRT3 / 3) * px - (1 / 3) * py) / R;
  const r = ((2 / 3) * py) / R;
  const rounded = cubeRound(q, r);
  return { col: rounded.q + (rounded.r - (rounded.r & 1)) / 2, row: rounded.r };
}

function toCube(cell: Cell): { x: number; y: number; z: number } {
  const x = cell.col - (cell.row - (cell.row & 1)) / 2;
  const z = cell.row;
  return { x, y: -x - z, z };
}

/** Number of cells moved between two cells following the grid rules. */
export function gridSteps(grid: GridDef, a: Cell, b: Cell): number {
  if (grid.type === "hex") {
    const ca = toCube(a);
    const cb = toCube(b);
    return Math.max(Math.abs(ca.x - cb.x), Math.abs(ca.y - cb.y), Math.abs(ca.z - cb.z));
  }
  const dx = Math.abs(a.col - b.col);
  const dy = Math.abs(a.row - b.row);
  if (grid.diagonals === "standard") return Math.max(dx, dy);
  const diagonal = Math.min(dx, dy);
  const straight = Math.max(dx, dy) - diagonal;
  return straight + diagonal + Math.floor(diagonal / 2);
}

/** Distance in feet between two cells. */
export function distanceFeet(grid: GridDef, a: Cell, b: Cell): number {
  return gridSteps(grid, a, b) * grid.feetPerCell;
}

/** Distance in feet between two tokens, measured between their closest cells. */
export function tokenDistanceFeet(grid: GridDef, a: Token, b: Token): number {
  let best = Infinity;
  for (const ca of tokenCells(a)) for (const cb of tokenCells(b)) best = Math.min(best, distanceFeet(grid, ca, cb));
  return best;
}

export function neighbours(grid: GridDef, cell: Cell): Cell[] {
  let deltas: [number, number][];
  if (grid.type === "square") {
    deltas = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
  } else {
    deltas =
      cell.row & 1
        ? [
            [1, 0],
            [-1, 0],
            [0, -1],
            [1, -1],
            [0, 1],
            [1, 1],
          ]
        : [
            [1, 0],
            [-1, 0],
            [-1, -1],
            [0, -1],
            [-1, 1],
            [0, 1],
          ];
  }
  return deltas.map(([dc, dr]) => ({ col: cell.col + dc, row: cell.row + dr })).filter((c) => inBounds(grid, c));
}

/** Cells covered by a token (a size-2 token covers 2x2 cells on a square grid). */
export function tokenCells(token: Pick<Token, "col" | "row" | "size">): Cell[] {
  const size = Math.max(1, Math.round(token.size));
  const cells: Cell[] = [];
  for (let dr = 0; dr < size; dr++) for (let dc = 0; dc < size; dc++) cells.push({ col: token.col + dc, row: token.row + dr });
  return cells;
}

export function tokenCenter(grid: GridDef, token: Pick<Token, "col" | "row" | "size">): Point {
  const cells = tokenCells(token).map((c) => cellCenter(grid, c));
  return { x: cells.reduce((s, p) => s + p.x, 0) / cells.length, y: cells.reduce((s, p) => s + p.y, 0) / cells.length };
}

/** Spreadsheet-like coordinates for the text view: column letters + row number (A1). */
export function cellLabel(cell: Cell): string {
  let n = cell.col;
  let letters = "";
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `${letters}${cell.row + 1}`;
}

export function feetToPixels(grid: GridDef, feet: number): number {
  return (feet / grid.feetPerCell) * grid.cellSize;
}
