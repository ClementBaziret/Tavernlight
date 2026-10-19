import { Body, Controller, Delete, Get, HttpCode, Injectable, NotFoundException, Param, Post, Put } from "@nestjs/common";
import type { Encounter } from "@prisma/client";
import { derive, evaluateEncounter, newId, tokenCells, cellIndex, inBounds, neighbours, type CharacterBuild, type CharacterState, type MapData, type Token } from "@tavernlight/engine";
import { encounterSchema, placeEncounterSchema, type EncounterDto, type EncounterInput } from "@tavernlight/shared";
import type { z } from "zod";
import { AuthUser, CurrentUser } from "../common/auth";
import { ZodPipe } from "../common/zod.pipe";
import { CampaignsService } from "../campaigns/campaigns.service";
import { toMapDto } from "../common/dto";
import { PrismaService } from "../prisma/prisma.service";
import { RulesService } from "../rules/rules.service";
import { TableService } from "../table/table.service";

@Injectable()
export class EncountersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
  ) {}

  toDto(e: Encounter): EncounterDto {
    const monsters = (e.monsters as { key: string; count: number }[]).map((m) => {
      const def = this.rules.rules.monster(m.key);
      return { key: m.key, count: m.count, name: def?.name ?? m.key, cr: def?.cr ?? 0, xp: def?.xp ?? 0 };
    });
    return { id: e.id, campaignId: e.campaignId, name: e.name, description: e.description, mapId: e.mapId, monsters };
  }

  async find(campaignId: string, id: string) {
    const e = await this.prisma.encounter.findFirst({ where: { id, campaignId } });
    if (!e) throw new NotFoundException("Encounter not found.");
    return e;
  }

  async partyLevels(campaignId: string): Promise<number[]> {
    const characters = await this.prisma.character.findMany({ where: { campaignId } });
    return characters.map((c) => derive(c.build as unknown as CharacterBuild, c.state as unknown as CharacterState, this.rules.rules).level);
  }

  /**
   * Adds the encounter's monsters as tokens, starting at a cell and spreading
   * to the nearest free cells (one click placement).
   */
  place(map: MapData, encounter: EncounterDto, start: { col: number; row: number }, hidden: boolean): MapData {
    const occupied = new Set<number>();
    for (const t of map.tokens) for (const c of tokenCells(t)) occupied.add(cellIndex(map.grid, c));
    const tokens: Token[] = [];
    const queue = [start];
    const seen = new Set([cellIndex(map.grid, start)]);
    const nextFree = (): { col: number; row: number } | null => {
      while (queue.length) {
        const cell = queue.shift()!;
        for (const n of neighbours(map.grid, cell)) {
          const i = cellIndex(map.grid, n);
          if (!seen.has(i)) {
            seen.add(i);
            queue.push(n);
          }
        }
        if (inBounds(map.grid, cell) && !occupied.has(cellIndex(map.grid, cell))) return cell;
      }
      return null;
    };
    for (const m of encounter.monsters) {
      const def = this.rules.rules.monster(m.key);
      const size = def ? ({ tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 } as const)[def.size] : 1;
      for (let i = 0; i < m.count; i++) {
        const cell = nextFree();
        if (!cell) break;
        const token: Token = {
          id: newId("tok"),
          name: m.count > 1 ? `${m.name} ${String.fromCharCode(65 + i)}` : m.name,
          kind: "monster",
          side: "enemy",
          col: cell.col,
          row: cell.row,
          size,
          layer: "tokens",
          hidden,
          label: `${m.name[0]}${m.count > 1 ? String.fromCharCode(65 + i) : ""}`.toUpperCase().slice(0, 3),
          color: "#b3261e",
          monsterKey: m.key,
          visionRange: def?.senses.darkvision ?? 0,
        };
        for (const c of tokenCells(token)) occupied.add(cellIndex(map.grid, c));
        tokens.push(token);
      }
    }
    return { ...map, tokens: [...map.tokens, ...tokens] };
  }
}

@Controller("campaigns/:campaignId/encounters")
export class EncountersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encounters: EncountersService,
    private readonly campaigns: CampaignsService,
    private readonly rules: RulesService,
    private readonly table: TableService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Param("campaignId") campaignId: string) {
    await this.campaigns.assertGm(campaignId, user.id);
    const list = await this.prisma.encounter.findMany({ where: { campaignId }, orderBy: { name: "asc" } });
    const party = await this.encounters.partyLevels(campaignId);
    return list.map((e) => {
      const dto = this.encounters.toDto(e);
      return { ...dto, evaluation: evaluateEncounter(party, dto.monsters, this.rules.all.encounters) };
    });
  }

  /** Difficulty of a list of monsters against the campaign's party (live preview). */
  @HttpCode(200)
  @Post("evaluate")
  async evaluate(@CurrentUser() user: AuthUser, @Param("campaignId") campaignId: string, @Body(new ZodPipe(encounterSchema.pick({ monsters: true }))) body: Pick<EncounterInput, "monsters">) {
    await this.campaigns.assertGm(campaignId, user.id);
    const party = await this.encounters.partyLevels(campaignId);
    const monsters = body.monsters.map((m) => {
      const def = this.rules.get("monsters", m.key);
      return { key: m.key, name: def.name, cr: def.cr, xp: def.xp, count: m.count };
    });
    return { partyLevels: party, ...evaluateEncounter(party, monsters, this.rules.all.encounters) };
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Param("campaignId") campaignId: string, @Body(new ZodPipe(encounterSchema)) body: EncounterInput) {
    await this.campaigns.assertGm(campaignId, user.id);
    for (const m of body.monsters) this.rules.get("monsters", m.key);
    const e = await this.prisma.encounter.create({ data: { campaignId, name: body.name, description: body.description, mapId: body.mapId ?? null, monsters: body.monsters } });
    return this.encounters.toDto(e);
  }

  @Put(":id")
  async update(@CurrentUser() user: AuthUser, @Param("campaignId") campaignId: string, @Param("id") id: string, @Body(new ZodPipe(encounterSchema)) body: EncounterInput) {
    await this.campaigns.assertGm(campaignId, user.id);
    await this.encounters.find(campaignId, id);
    for (const m of body.monsters) this.rules.get("monsters", m.key);
    const e = await this.prisma.encounter.update({ where: { id }, data: { name: body.name, description: body.description, mapId: body.mapId ?? null, monsters: body.monsters } });
    return this.encounters.toDto(e);
  }

  @HttpCode(204)
  @Delete(":id")
  async remove(@CurrentUser() user: AuthUser, @Param("campaignId") campaignId: string, @Param("id") id: string) {
    await this.campaigns.assertGm(campaignId, user.id);
    await this.encounters.find(campaignId, id);
    await this.prisma.encounter.delete({ where: { id } });
  }

  @Post(":id/place")
  async place(@CurrentUser() user: AuthUser, @Param("campaignId") campaignId: string, @Param("id") id: string, @Body(new ZodPipe(placeEncounterSchema)) body: z.infer<typeof placeEncounterSchema>) {
    await this.campaigns.assertGm(campaignId, user.id);
    const encounter = this.encounters.toDto(await this.encounters.find(campaignId, id));
    const map = await this.prisma.gameMap.findFirst({ where: { id: body.mapId, campaignId } });
    if (!map) throw new NotFoundException("Map not found.");
    const data = map.data as unknown as MapData;
    const start = { col: body.col ?? Math.floor(data.grid.cols * 0.7), row: body.row ?? Math.floor(data.grid.rows / 2) };
    const placed = this.encounters.place(data, encounter, start, body.hidden);
    const updated = await this.prisma.gameMap.update({ where: { id: map.id }, data: { data: placed as object } });
    await this.table.mapChanged(campaignId, map.id);
    return toMapDto(updated);
  }
}
