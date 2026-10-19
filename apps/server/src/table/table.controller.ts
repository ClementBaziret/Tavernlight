import { Controller, ForbiddenException, Get, NotFoundException, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import sharp from "sharp";
import { cellFromIndex, cellPolygon, computeFog, mapPixelSize, type MapData } from "@tavernlight/engine";
import { AuthUser, CurrentUser } from "../common/auth";
import { CampaignsService } from "../campaigns/campaigns.service";
import { PrismaService } from "../prisma/prisma.service";
import { TableService } from "./table.service";

/** Masked backgrounds already rendered, keyed by map, asset and revealed cells. */
const cache = new Map<string, Buffer>();
const CACHE_SIZE = 20;

@Controller("table/:campaignId")
export class TableController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campaigns: CampaignsService,
    private readonly table: TableService,
  ) {}

  /** Snapshot over HTTP (same content as the socket event). */
  @Get("state")
  async state(@CurrentUser() user: AuthUser, @Param("campaignId") campaignId: string, @Query("view") view?: string) {
    const role = await this.campaigns.roleOf(campaignId, user.id);
    if (view === "gm") {
      if (role !== "gm") throw new ForbiddenException();
      return this.table.gmState(campaignId);
    }
    return this.table.playerState(campaignId);
  }

  /**
   * Background image of the active map for the players' view. Unrevealed
   * cells are painted black on the server, so the hidden parts of the image
   * are never downloaded by the players' browser.
   */
  @Get("background")
  async background(@CurrentUser() user: AuthUser, @Param("campaignId") campaignId: string, @Res() res: Response) {
    await this.campaigns.roleOf(campaignId, user.id);
    const campaign = await this.prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    const map = campaign.activeMapId ? await this.prisma.gameMap.findUnique({ where: { id: campaign.activeMapId } }) : null;
    const data = map?.data as unknown as MapData | undefined;
    if (!map || !data?.background) throw new NotFoundException();
    const revealed = data.fog.enabled ? [...computeFog(data).revealed].sort((a, b) => a - b) : null;
    const key = `${map.id}:${data.background.assetId}:${revealed ? revealed.join(",") : "all"}`;
    let image = cache.get(key);
    if (!image) {
      const asset = await this.prisma.asset.findFirst({ where: { id: data.background.assetId } });
      if (!asset) throw new NotFoundException();
      const { width, height } = mapPixelSize(data.grid);
      const w = Math.round(width);
      const h = Math.round(height);
      let pipeline = sharp(Buffer.from(asset.bytes)).resize(w, h, { fit: "fill" });
      if (revealed) {
        const open = new Set(revealed);
        const paths: string[] = [];
        for (let i = 0; i < data.grid.cols * data.grid.rows; i++) {
          if (open.has(i)) continue;
          const c = cellFromIndex(data.grid, i);
          const pts = cellPolygon(data.grid, c);
          const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
          const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
          // Slightly enlarged so that no seam of the image shows between cells.
          paths.push(`M${pts.map((p) => `${(cx + (p.x - cx) * 1.04).toFixed(1)},${(cy + (p.y - cy) * 1.04).toFixed(1)}`).join("L")}Z`);
        }
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><path d="${paths.join("")}" fill="#000" shape-rendering="crispEdges"/></svg>`;
        pipeline = sharp(await pipeline.png().toBuffer()).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]);
      }
      image = await pipeline.webp({ quality: 80 }).toBuffer();
      cache.set(key, image);
      if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
    }
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "private, no-cache");
    res.send(image);
  }
}
