// Pixi compiles shaders without eval with this module (the CSP forbids unsafe-eval).
import "pixi.js/unsafe-eval";
import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cellCenter, cellIndex, cellPolygon, mapPixelSize, pixelToCell, type Cell, type DecorItem, type GridDef, type Point, type Wall } from "@tavernlight/engine";

export interface CanvasToken {
  id: string;
  name: string;
  kind: "pc" | "npc" | "monster" | "object";
  side: "party" | "enemy" | "neutral";
  col: number;
  row: number;
  size: number;
  label: string;
  color: string;
  hidden?: boolean;
  layer?: "tokens" | "gm";
}

export interface TokenStatus {
  down?: boolean;
  /** 0..1, only drawn when provided (game master). */
  hpRatio?: number;
  current?: boolean;
}

export interface MapCanvasProps {
  grid: GridDef;
  terrain: (string | null)[];
  decor: DecorItem[];
  walls: Omit<Wall, "secret">[] & { secret?: boolean }[];
  tokens: CanvasToken[];
  backgroundUrl?: string | null;
  backgroundOpacity?: number;
  fogView: "gm" | "players" | "none";
  revealed: Set<number> | null;
  visible: Set<number> | null;
  selectedTokenId?: string | null;
  highlightTokenIds?: Set<string>;
  statuses?: Record<string, TokenStatus>;
  template?: Point[] | null;
  measure?: { from: Point; to: Point; label: string } | null;
  /** Cells to highlight (paint brush, fog brush preview, area cells). */
  highlightCells?: Set<number> | null;
  pendingWall?: { a: Point; b: Point } | null;
  draggableTokens?: boolean;
  onPointer?: (e: { type: "down" | "move" | "up"; cell: Cell; point: Point; button: number; shift: boolean; tokenId: string | null }) => void;
  onTokenDrop?: (tokenId: string, cell: Cell) => void;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  ariaLabel: string;
  ariaDescribedBy?: string;
  className?: string;
  /** Fit the whole map in view when it first loads. */
  fit?: boolean;
}

export const TERRAINS: Record<string, { color: number; label: string; accent?: number }> = {
  stone: { color: 0x8a8f98, label: "Stone floor", accent: 0x7a7f88 },
  tiles: { color: 0xb9a88a, label: "Tiles", accent: 0xa89878 },
  wood: { color: 0x9a6b3f, label: "Wooden floor", accent: 0x86592f },
  dirt: { color: 0x8b6b4a, label: "Dirt", accent: 0x7a5c3d },
  grass: { color: 0x6b8f47, label: "Grass", accent: 0x5e7f3d },
  road: { color: 0xa68a5b, label: "Road", accent: 0x94794c },
  sand: { color: 0xd8c38f, label: "Sand", accent: 0xc8b27d },
  water: { color: 0x3f6f9f, label: "Water", accent: 0x5a89b8 },
  cave: { color: 0x5d5751, label: "Cave floor", accent: 0x524c46 },
  lava: { color: 0xc4471b, label: "Lava", accent: 0xe8762d },
};

export const DECOR_ICONS: Record<string, string> = {
  tree: "Tree",
  rock: "Rock",
  pillar: "Pillar",
  barrel: "Barrel",
  chest: "Chest",
  sarcophagus: "Sarcophagus",
  brazier: "Brazier",
  torch: "Torch",
  campfire: "Campfire",
  bones: "Bones",
  rubble: "Rubble",
  cart: "Cart",
  stalagmite: "Stalagmite",
  table: "Table",
  bed: "Bed",
  statue: "Statue",
};

function drawDecor(g: Graphics, d: DecorItem, cell: number) {
  const r = (d.size * cell) / 2;
  const { x, y } = d;
  switch (d.icon) {
    case "tree":
      g.circle(x, y, r * 0.95).fill(0x2f5d2a).stroke({ width: 3, color: 0x1c3a19 });
      g.circle(x - r * 0.25, y - r * 0.25, r * 0.4).fill(0x3e7a37);
      break;
    case "rock":
    case "stalagmite":
      g.poly([x - r * 0.8, y + r * 0.5, x - r * 0.4, y - r * 0.7, x + r * 0.5, y - r * 0.6, x + r * 0.85, y + r * 0.4, x, y + r * 0.8]).fill(d.icon === "rock" ? 0x6f6a64 : 0x8c857c).stroke({ width: 2, color: 0x3a3632 });
      break;
    case "pillar":
    case "statue":
      g.circle(x, y, r * 0.75).fill(0xd6d1c4).stroke({ width: 3, color: 0x55524b });
      g.circle(x, y, r * 0.45).stroke({ width: 2, color: 0x8c877c });
      break;
    case "barrel":
      g.circle(x, y, r * 0.6).fill(0x8a5a2b).stroke({ width: 3, color: 0x4d3115 });
      g.circle(x, y, r * 0.35).stroke({ width: 2, color: 0x4d3115 });
      break;
    case "chest":
      g.roundRect(x - r * 0.7, y - r * 0.45, r * 1.4, r * 0.9, 4).fill(0x9b6a2f).stroke({ width: 3, color: 0x4d3115 });
      g.rect(x - r * 0.7, y - r * 0.08, r * 1.4, r * 0.16).fill(0xe0b84a);
      break;
    case "sarcophagus":
      g.roundRect(x - r * 0.45, y - r * 0.9, r * 0.9, r * 1.8, 10).fill(0xa8a397).stroke({ width: 3, color: 0x4a473f });
      g.moveTo(x, y - r * 0.6).lineTo(x, y + r * 0.6).stroke({ width: 2, color: 0x4a473f });
      break;
    case "brazier":
    case "torch":
    case "campfire":
      g.circle(x, y, r * (d.icon === "torch" ? 0.3 : 0.55)).fill(0x4a3a2a).stroke({ width: 2, color: 0x241c14 });
      g.circle(x, y, r * (d.icon === "torch" ? 0.22 : 0.4)).fill(0xf28c28);
      g.circle(x, y, r * (d.icon === "torch" ? 0.12 : 0.2)).fill(0xffd166);
      break;
    case "bones":
      g.moveTo(x - r * 0.6, y - r * 0.3).lineTo(x + r * 0.6, y + r * 0.3).stroke({ width: 4, color: 0xe8e2d0 });
      g.moveTo(x - r * 0.5, y + r * 0.4).lineTo(x + r * 0.4, y - r * 0.4).stroke({ width: 4, color: 0xe8e2d0 });
      break;
    case "rubble":
      for (const [dx, dy, s] of [[-0.4, -0.2, 0.25], [0.3, 0.1, 0.3], [-0.1, 0.4, 0.2], [0.35, -0.4, 0.18]]) g.circle(x + dx * r, y + dy * r, s * r).fill(0x75706a).stroke({ width: 1, color: 0x3a3632 });
      break;
    case "cart":
      g.roundRect(x - r * 0.8, y - r * 0.45, r * 1.6, r * 0.9, 4).fill(0x8a5a2b).stroke({ width: 3, color: 0x4d3115 });
      g.circle(x - r * 0.5, y + r * 0.5, r * 0.2).fill(0x3a2a1a);
      g.circle(x + r * 0.5, y + r * 0.5, r * 0.2).fill(0x3a2a1a);
      break;
    case "table":
    case "bed":
      g.roundRect(x - r * 0.8, y - r * 0.5, r * 1.6, r, 4).fill(d.icon === "bed" ? 0x7d5ea8 : 0x8a5a2b).stroke({ width: 3, color: 0x3a2a1a });
      break;
    default:
      g.circle(x, y, r * 0.5).fill(0x999999);
  }
}

function tokenShape(g: Graphics, t: CanvasToken, x: number, y: number, r: number, color: number) {
  const stroke = { width: 3, color: 0x111111 };
  if (t.side === "enemy") {
    // Enemies are diamonds: the side is never shown by color alone.
    g.poly([x, y - r, x + r, y, x, y + r, x - r, y]).fill(color).stroke(stroke);
  } else if (t.side === "neutral") {
    g.roundRect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7, r * 0.3).fill(color).stroke(stroke);
  } else {
    g.circle(x, y, r).fill(color).stroke(stroke);
    g.circle(x, y, r - 4).stroke({ width: 2, color: 0xffffff, alpha: 0.85 });
  }
}

export function MapCanvas(props: MapCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const [ready, setReady] = useState(false);
  const propsRef = useRef(props);
  propsRef.current = props;
  const bgTexture = useRef<{ url: string; texture: Texture } | null>(null);
  const [bgVersion, setBgVersion] = useState(0);
  const drag = useRef<{ tokenId: string | null; panning: boolean; startX: number; startY: number; worldX: number; worldY: number; moved: boolean; ghost?: Graphics } | null>(null);
  const fitted = useRef(false);

  // Create the Pixi application once.
  useEffect(() => {
    let destroyed = false;
    const app = new Application();
    void app
      .init({ background: "#0d0f17", resizeTo: hostRef.current!, antialias: true, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1) })
      .then(() => {
        if (destroyed) {
          app.destroy(true);
          return;
        }
        hostRef.current!.appendChild(app.canvas);
        app.canvas.setAttribute("aria-hidden", "true");
        const world = new Container();
        app.stage.addChild(world);
        app.stage.eventMode = "static";
        app.stage.hitArea = app.screen;
        appRef.current = app;
        worldRef.current = world;
        setupInteraction(app, world);
        setReady(true);
      });
    return () => {
      destroyed = true;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tokenAt(point: Point): string | null {
    const p = propsRef.current;
    for (let i = p.tokens.length - 1; i >= 0; i--) {
      const t = p.tokens[i];
      const c = tokenCentre(p.grid, t);
      const r = (t.size * p.grid.cellSize) / 2;
      if (Math.hypot(point.x - c.x, point.y - c.y) <= r) return t.id;
    }
    return null;
  }

  function setupInteraction(app: Application, world: Container) {
    app.stage.on("pointerdown", (e) => {
      const p = propsRef.current;
      const point = world.toLocal(e.global);
      const tokenId = tokenAt(point);
      const button = e.button;
      const panning = button === 1 || button === 2 || (!tokenId && !p.onPointer);
      drag.current = { tokenId: p.draggableTokens && button === 0 ? tokenId : null, panning, startX: e.global.x, startY: e.global.y, worldX: world.x, worldY: world.y, moved: false };
      if (!panning) p.onPointer?.({ type: "down", cell: pixelToCell(p.grid, point), point, button, shift: e.shiftKey, tokenId });
    });
    app.stage.on("pointermove", (e) => {
      const p = propsRef.current;
      const point = world.toLocal(e.global);
      const d = drag.current;
      if (d) {
        const dx = e.global.x - d.startX;
        const dy = e.global.y - d.startY;
        if (Math.hypot(dx, dy) > 4) d.moved = true;
        if (d.panning) {
          world.x = d.worldX + dx;
          world.y = d.worldY + dy;
          return;
        }
        if (d.tokenId && d.moved) {
          const token = p.tokens.find((t) => t.id === d.tokenId);
          if (token) {
            if (!d.ghost) {
              d.ghost = new Graphics();
              world.addChild(d.ghost);
            }
            const cell = pixelToCell(p.grid, point);
            const c = tokenCentre(p.grid, { ...token, col: cell.col, row: cell.row });
            d.ghost.clear();
            tokenShape(d.ghost, token, c.x, c.y, (token.size * p.grid.cellSize) / 2 - 4, parseInt(token.color.slice(1), 16));
            d.ghost.alpha = 0.6;
          }
          return;
        }
      }
      p.onPointer?.({ type: "move", cell: pixelToCell(p.grid, point), point, button: -1, shift: e.shiftKey, tokenId: null });
    });
    const end = (e: { global: { x: number; y: number }; button: number; shiftKey: boolean }) => {
      const p = propsRef.current;
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      d.ghost?.destroy();
      if (d.panning) return;
      const point = world.toLocal(e.global as never);
      if (d.tokenId && d.moved) {
        p.onTokenDrop?.(d.tokenId, pixelToCell(p.grid, point));
        return;
      }
      p.onPointer?.({ type: "up", cell: pixelToCell(p.grid, point), point, button: e.button, shift: e.shiftKey, tokenId: d.tokenId ?? tokenAt(point) });
    };
    app.stage.on("pointerup", end);
    app.stage.on("pointerupoutside", end);
    app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    app.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const rect = app.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const scale = Math.max(0.15, Math.min(4, world.scale.x * factor));
        const wx = (mx - world.x) / world.scale.x;
        const wy = (my - world.y) / world.scale.y;
        world.scale.set(scale);
        world.x = mx - wx * scale;
        world.y = my - wy * scale;
      },
      { passive: false },
    );
  }

  // Load the background image (sent masked by the server for the players).
  useEffect(() => {
    const url = props.backgroundUrl;
    if (!url) {
      bgTexture.current = null;
      setBgVersion((v) => v + 1);
      return;
    }
    if (bgTexture.current?.url === url) return;
    const img = new Image();
    img.crossOrigin = "use-credentials";
    img.onload = () => {
      bgTexture.current = { url, texture: Texture.from(img) };
      setBgVersion((v) => v + 1);
    };
    img.src = url;
  }, [props.backgroundUrl]);

  // Fit the map in view.
  useEffect(() => {
    if (!ready || !props.fit || fitted.current) return;
    const app = appRef.current!;
    const world = worldRef.current!;
    const { width, height } = mapPixelSize(props.grid);
    const scale = Math.min(app.screen.width / (width + 40), app.screen.height / (height + 40), 1.5);
    world.scale.set(scale);
    world.x = (app.screen.width - width * scale) / 2;
    world.y = (app.screen.height - height * scale) / 2;
    fitted.current = true;
  }, [ready, props.fit, props.grid]);

  // Redraw everything when the data changes.
  useEffect(() => {
    if (!ready) return;
    const world = worldRef.current!;
    for (const child of world.removeChildren()) child.destroy({ children: true });
    const { grid } = props;
    const size = mapPixelSize(grid);
    const cell = grid.cellSize;
    const total = grid.cols * grid.rows;

    // Background layer: image + terrain.
    const base = new Graphics();
    base.rect(0, 0, size.width, size.height).fill(0x1c1e26);
    world.addChild(base);
    if (bgTexture.current) {
      const sprite = new Sprite(bgTexture.current.texture);
      sprite.width = size.width;
      sprite.height = size.height;
      sprite.alpha = props.backgroundOpacity ?? 1;
      world.addChild(sprite);
    }
    const terrain = new Graphics();
    for (let i = 0; i < total; i++) {
      const tkey = props.terrain[i];
      if (!tkey) continue;
      const def = TERRAINS[tkey];
      if (!def) continue;
      const c = { col: i % grid.cols, row: Math.floor(i / grid.cols) };
      const poly = cellPolygon(grid, c).flatMap((p) => [p.x, p.y]);
      terrain.poly(poly).fill(def.color);
      if (def.accent && (c.col * 7 + c.row * 13) % 5 === 0) {
        const ctr = cellCenter(grid, c);
        terrain.circle(ctr.x + ((c.col * 31) % 11) - 5, ctr.y + ((c.row * 17) % 11) - 5, cell * 0.08).fill(def.accent);
      }
    }
    world.addChild(terrain);

    // Grid.
    const lines = new Graphics();
    if (grid.type === "square") {
      for (let c = 0; c <= grid.cols; c++) lines.moveTo(c * cell, 0).lineTo(c * cell, size.height);
      for (let r = 0; r <= grid.rows; r++) lines.moveTo(0, r * cell).lineTo(size.width, r * cell);
    } else {
      for (let i = 0; i < total; i++) {
        const pts = cellPolygon(grid, { col: i % grid.cols, row: Math.floor(i / grid.cols) });
        lines.poly(pts.flatMap((p) => [p.x, p.y]));
      }
    }
    lines.stroke({ width: 1, color: 0x000000, alpha: 0.22 });
    world.addChild(lines);

    // Decor (the GM layer is drawn translucent and only when provided).
    const decor = new Graphics();
    for (const d of props.decor) {
      drawDecor(decor, d, cell);
    }
    world.addChild(decor);
    const gmDecor = props.decor.filter((d) => d.layer === "gm");
    if (gmDecor.length) {
      const marks = new Graphics();
      for (const d of gmDecor) marks.circle(d.x, d.y, (d.size * cell) / 2).stroke({ width: 2, color: 0xb388ff, alpha: 0.9 });
      world.addChild(marks);
    }

    // Highlights (brush preview, area cells).
    if (props.highlightCells?.size) {
      const h = new Graphics();
      for (const i of props.highlightCells) {
        const pts = cellPolygon(grid, { col: i % grid.cols, row: Math.floor(i / grid.cols) });
        h.poly(pts.flatMap((p) => [p.x, p.y])).fill({ color: 0xf0c55d, alpha: 0.35 });
      }
      world.addChild(h);
    }

    // Tokens.
    const tokens = new Container();
    for (const t of props.tokens) {
      const g = new Graphics();
      const c = tokenCentre(grid, t);
      const r = (t.size * cell) / 2 - 5;
      const color = parseInt((t.color || "#888888").replace("#", ""), 16);
      const status = props.statuses?.[t.id];
      if (status?.current) g.circle(c.x, c.y, r + 9).stroke({ width: 4, color: 0xffffff, alpha: 0.95 });
      if (props.highlightTokenIds?.has(t.id)) g.circle(c.x, c.y, r + 6).stroke({ width: 5, color: 0xff7043 });
      if (props.selectedTokenId === t.id) g.circle(c.x, c.y, r + 6).stroke({ width: 5, color: 0xf0c55d });
      tokenShape(g, t, c.x, c.y, r, color);
      if (t.hidden || t.layer === "gm") g.alpha = 0.5;
      if (status?.down) {
        g.moveTo(c.x - r * 0.7, c.y - r * 0.7).lineTo(c.x + r * 0.7, c.y + r * 0.7).stroke({ width: 5, color: 0x111111 });
        g.moveTo(c.x + r * 0.7, c.y - r * 0.7).lineTo(c.x - r * 0.7, c.y + r * 0.7).stroke({ width: 5, color: 0x111111 });
      }
      if (status?.hpRatio !== undefined && !status.down) {
        g.rect(c.x - r, c.y + r + 3, r * 2, 6).fill(0x111111);
        g.rect(c.x - r + 1, c.y + r + 4, (r * 2 - 2) * Math.max(0, Math.min(1, status.hpRatio)), 4).fill(status.hpRatio > 0.5 ? 0x2ea043 : status.hpRatio > 0.25 ? 0xe9b949 : 0xd73a49);
      }
      tokens.addChild(g);
      const label = new Text({ text: t.label || t.name[0], style: { fill: 0xffffff, fontSize: Math.max(12, r * 0.8), fontWeight: "bold", stroke: { color: 0x000000, width: 3 } } });
      label.anchor.set(0.5);
      label.x = c.x;
      label.y = c.y;
      if (t.hidden || t.layer === "gm") label.alpha = 0.6;
      tokens.addChild(label);
    }
    world.addChild(tokens);

    // Walls and doors.
    const walls = new Graphics();
    for (const w of props.walls as (Wall & { secret?: boolean })[]) {
      if (w.kind === "wall") {
        walls.moveTo(w.a.x, w.a.y).lineTo(w.b.x, w.b.y).stroke({ width: 8, color: 0x15120e, cap: "round" });
        walls.moveTo(w.a.x, w.a.y).lineTo(w.b.x, w.b.y).stroke({ width: 3, color: 0x4b4438, cap: "round" });
      } else if (w.kind === "window") {
        walls.moveTo(w.a.x, w.a.y).lineTo(w.b.x, w.b.y).stroke({ width: 6, color: 0x9fd3ff });
      } else {
        const color = w.secret ? 0xb388ff : 0xb5651d;
        if (w.open) {
          walls.moveTo(w.a.x, w.a.y).lineTo(w.a.x + (w.b.x - w.a.x) * 0.25, w.a.y + (w.b.y - w.a.y) * 0.25).stroke({ width: 8, color });
          walls.circle((w.a.x + w.b.x) / 2, (w.a.y + w.b.y) / 2, 5).stroke({ width: 2, color });
        } else {
          walls.moveTo(w.a.x, w.a.y).lineTo(w.b.x, w.b.y).stroke({ width: 10, color });
          walls.moveTo(w.a.x, w.a.y).lineTo(w.b.x, w.b.y).stroke({ width: 2, color: 0x2a1a0a });
        }
      }
    }
    if (props.pendingWall) walls.moveTo(props.pendingWall.a.x, props.pendingWall.a.y).lineTo(props.pendingWall.b.x, props.pendingWall.b.y).stroke({ width: 6, color: 0xf0c55d, alpha: 0.8 });
    world.addChild(walls);

    // Fog of war.
    if (props.fogView !== "none" && props.revealed) {
      const fog = new Graphics();
      for (let i = 0; i < total; i++) {
        const c = { col: i % grid.cols, row: Math.floor(i / grid.cols) };
        const isRevealed = props.revealed.has(i);
        const isVisible = props.visible?.has(i) ?? true;
        let alpha = 0;
        if (props.fogView === "players") alpha = !isRevealed ? 1 : !isVisible ? 0.45 : 0;
        else alpha = !isRevealed ? 0.55 : !isVisible ? 0.2 : 0;
        if (!alpha) continue;
        const poly = cellPolygon(grid, c);
        const ctr = cellCenter(grid, c);
        fog.poly(poly.flatMap((p) => [ctr.x + (p.x - ctr.x) * 1.03, ctr.y + (p.y - ctr.y) * 1.03])).fill({ color: 0x05060a, alpha });
      }
      world.addChild(fog);
    }

    // Template and measuring tape.
    if (props.template?.length) {
      const tpl = new Graphics();
      tpl.poly(props.template.flatMap((p) => [p.x, p.y])).fill({ color: 0xff7043, alpha: 0.28 }).stroke({ width: 3, color: 0xff7043 });
      world.addChild(tpl);
    }
    if (props.measure) {
      const m = new Graphics();
      m.moveTo(props.measure.from.x, props.measure.from.y).lineTo(props.measure.to.x, props.measure.to.y).stroke({ width: 4, color: 0xf0c55d });
      m.circle(props.measure.from.x, props.measure.from.y, 6).fill(0xf0c55d);
      world.addChild(m);
      const label = new Text({ text: props.measure.label, style: { fill: 0x111111, fontSize: 18, fontWeight: "bold", stroke: { color: 0xf0c55d, width: 4 } } });
      label.x = props.measure.to.x + 10;
      label.y = props.measure.to.y - 24;
      world.addChild(label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, bgVersion, props.grid, props.terrain, props.decor, props.walls, props.tokens, props.fogView, props.revealed, props.visible, props.selectedTokenId, props.highlightTokenIds, props.statuses, props.template, props.measure, props.highlightCells, props.pendingWall, props.backgroundOpacity]);

  return (
    <div
      ref={hostRef}
      tabIndex={0}
      role="application"
      aria-roledescription="map"
      aria-label={props.ariaLabel}
      aria-describedby={props.ariaDescribedBy}
      onKeyDown={props.onKeyDown}
      className={props.className ?? "relative h-[60vh] w-full overflow-hidden rounded-xl border border-line"}
    />
  );
}

export function tokenCentre(grid: GridDef, t: { col: number; row: number; size: number }): Point {
  const cells: Point[] = [];
  for (let dr = 0; dr < t.size; dr++) for (let dc = 0; dc < t.size; dc++) cells.push(cellCenter(grid, { col: t.col + dc, row: t.row + dr }));
  return { x: cells.reduce((s, p) => s + p.x, 0) / cells.length, y: cells.reduce((s, p) => s + p.y, 0) / cells.length };
}

export { cellIndex };
