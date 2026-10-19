import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import type { DiceRoll } from "@prisma/client";
import { DiceError, probabilities, roll, type RollResult } from "@tavernlight/dice";
import { derive, type CharacterBuild, type CharacterState } from "@tavernlight/engine";
import type { RollDto, RollInput, RollVisibility } from "@tavernlight/shared";
import { secureRoller } from "../common/rng";
import { PrismaService } from "../prisma/prisma.service";
import { RulesService } from "../rules/rules.service";

type RollWithNames = DiceRoll & { user: { displayName: string }; character: { name: string } | null };

@Injectable()
export class DiceService {
  private readonly listeners: ((roll: RollDto) => void | Promise<void>)[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
  ) {}

  onRoll(listener: (roll: RollDto) => void | Promise<void>) {
    this.listeners.push(listener);
  }

  toDto(r: RollWithNames): RollDto {
    return {
      id: r.id,
      userId: r.userId,
      userName: r.user.displayName,
      characterId: r.characterId,
      characterName: r.character?.name ?? null,
      campaignId: r.campaignId,
      label: r.label,
      expression: r.expression,
      visibility: r.visibility as RollVisibility,
      result: r.result as unknown as RollResult,
      createdAt: r.createdAt.toISOString(),
    };
  }

  /**
   * Rolls on the server with a cryptographically secure generator. Variables
   * (@str, @prof...) come from the character sheet, never from the client.
   */
  async roll(userId: string, input: RollInput): Promise<RollDto> {
    let variables: Record<string, number> = {};
    let campaignId = input.campaignId ?? null;
    let role: string | null = null;
    if (input.characterId) {
      const character = await this.prisma.character.findUnique({ where: { id: input.characterId } });
      if (!character) throw new BadRequestException("Unknown character.");
      const gm = character.campaignId
        ? await this.prisma.campaignMember.findFirst({ where: { campaignId: character.campaignId, userId, role: "gm" } })
        : null;
      if (character.ownerId !== userId && !gm) throw new ForbiddenException("You can't roll for this character.");
      variables = derive(character.build as unknown as CharacterBuild, character.state as unknown as CharacterState, this.rules.rules).variables;
      campaignId = campaignId ?? character.campaignId;
    }
    if (campaignId) {
      const member = await this.prisma.campaignMember.findUnique({ where: { campaignId_userId: { campaignId, userId } } });
      if (!member) throw new ForbiddenException("You are not a member of this campaign.");
      role = member.role;
    }
    // Only the game master makes hidden rolls.
    const visibility: RollVisibility = input.visibility === "hidden" && role !== "gm" ? "private" : input.visibility;
    let result: RollResult;
    try {
      result = roll(input.expression, { variables, advantage: input.advantage ?? null, roller: secureRoller });
    } catch (error) {
      if (error instanceof DiceError) throw new BadRequestException({ message: error.message, dice: error.toJSON() });
      throw error;
    }
    const saved = await this.prisma.diceRoll.create({
      data: { userId, campaignId, characterId: input.characterId ?? null, label: input.label ?? null, expression: input.expression, visibility, result: result as object },
      include: { user: { select: { displayName: true } }, character: { select: { name: true } } },
    });
    const dto = this.toDto(saved);
    for (const l of this.listeners) await l(dto);
    return dto;
  }

  probabilities(expression: string, advantage?: "advantage" | "disadvantage" | null) {
    try {
      return { expression, ...probabilities(expression, { advantage: advantage ?? null, variables: {} }) };
    } catch (error) {
      if (error instanceof DiceError) throw new BadRequestException({ message: error.message, dice: error.toJSON() });
      throw error;
    }
  }

  /** Who can see a roll: everyone (public), the GM and the roller (private), the GM (hidden). */
  static visibleTo(roll: { visibility: string; userId: string }, viewer: { userId?: string; role: "gm" | "player" | "table" }) {
    if (roll.visibility === "public") return true;
    if (viewer.role === "gm") return true;
    if (roll.visibility === "private") return viewer.role === "player" && roll.userId === viewer.userId;
    return false;
  }

  async history(userId: string, campaignId?: string, limit = 50): Promise<RollDto[]> {
    if (campaignId) {
      const member = await this.prisma.campaignMember.findUnique({ where: { campaignId_userId: { campaignId, userId } } });
      if (!member) throw new ForbiddenException();
      const rolls = await this.prisma.diceRoll.findMany({
        where: { campaignId },
        include: { user: { select: { displayName: true } }, character: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: limit * 2,
      });
      return rolls
        .filter((r) => DiceService.visibleTo(r, { userId, role: member.role as "gm" | "player" }))
        .slice(0, limit)
        .map((r) => this.toDto(r));
    }
    const rolls = await this.prisma.diceRoll.findMany({
      where: { userId, campaignId: null },
      include: { user: { select: { displayName: true } }, character: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rolls.map((r) => this.toDto(r));
  }

  async campaignRolls(campaignId: string, limit = 30) {
    const rolls = await this.prisma.diceRoll.findMany({
      where: { campaignId },
      include: { user: { select: { displayName: true } }, character: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rolls.map((r) => this.toDto(r));
  }
}
