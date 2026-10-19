import { Body, Controller, Delete, Get, HttpCode, Injectable, NotFoundException, Param, Post, Put } from "@nestjs/common";
import type { MapData } from "@tavernlight/engine";
import { mapSchema, type MapInput } from "@tavernlight/shared";
import { toMapDto, toMapSummary } from "../common/dto";
import { AuthUser, CurrentUser } from "../common/auth";
import { ZodPipe } from "../common/zod.pipe";
import { CampaignsService } from "../campaigns/campaigns.service";
import { PrismaService } from "../prisma/prisma.service";
import { TableService } from "../table/table.service";


@Injectable()
export class MapsService {
  constructor(private readonly prisma: PrismaService) {}

  async find(campaignId: string, id: string) {
    const map = await this.prisma.gameMap.findFirst({ where: { id, campaignId } });
    if (!map) throw new NotFoundException("Map not found.");
    return map;
  }

  /** Terrain must match the grid size; fog cells must exist. */
  normalize(data: MapData): MapData {
    const cells = data.grid.cols * data.grid.rows;
    const terrain = Array.from({ length: cells }, (_, i) => data.terrain[i] ?? null);
    return { ...data, terrain, fog: { ...data.fog, revealed: [...new Set(data.fog.revealed.filter((c) => c < cells))] } };
  }
}

/** Maps are prepared and edited by the game master only. */
@Controller("campaigns/:campaignId/maps")
export class MapsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maps: MapsService,
    private readonly campaigns: CampaignsService,
    private readonly table: TableService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Param("campaignId") campaignId: string) {
    await this.campaigns.assertGm(campaignId, user.id);
    const maps = await this.prisma.gameMap.findMany({ where: { campaignId }, orderBy: { name: "asc" } });
    return maps.map(toMapSummary);
  }

  @Get(":id")
  async get(@CurrentUser() user: AuthUser, @Param("campaignId") campaignId: string, @Param("id") id: string) {
    await this.campaigns.assertGm(campaignId, user.id);
    return toMapDto(await this.maps.find(campaignId, id));
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Param("campaignId") campaignId: string, @Body(new ZodPipe(mapSchema)) body: MapInput) {
    await this.campaigns.assertGm(campaignId, user.id);
    const data = this.maps.normalize(body.data as MapData);
    const map = await this.prisma.gameMap.create({
      data: { campaignId, name: body.name, description: body.description, gridType: data.grid.type, cols: data.grid.cols, rows: data.grid.rows, data: data as object },
    });
    return toMapDto(map);
  }

  @Put(":id")
  async update(@CurrentUser() user: AuthUser, @Param("campaignId") campaignId: string, @Param("id") id: string, @Body(new ZodPipe(mapSchema)) body: MapInput) {
    await this.campaigns.assertGm(campaignId, user.id);
    await this.maps.find(campaignId, id);
    const data = this.maps.normalize(body.data as MapData);
    const map = await this.prisma.gameMap.update({
      where: { id },
      data: { name: body.name, description: body.description, gridType: data.grid.type, cols: data.grid.cols, rows: data.grid.rows, data: data as object },
    });
    await this.table.mapChanged(campaignId, id);
    return toMapDto(map);
  }

  @HttpCode(204)
  @Delete(":id")
  async remove(@CurrentUser() user: AuthUser, @Param("campaignId") campaignId: string, @Param("id") id: string) {
    await this.campaigns.assertGm(campaignId, user.id);
    await this.maps.find(campaignId, id);
    await this.prisma.campaign.updateMany({ where: { id: campaignId, activeMapId: id }, data: { activeMapId: null } });
    await this.prisma.gameMap.delete({ where: { id } });
    await this.table.broadcast(campaignId);
  }
}
