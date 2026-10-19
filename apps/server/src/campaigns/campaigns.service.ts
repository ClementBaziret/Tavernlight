import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomInt } from "node:crypto";
import type { CampaignDetail, CampaignInput, CampaignRole, CampaignSummary } from "@tavernlight/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CharactersService } from "../characters/characters.service";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newInviteCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  return code;
}

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly characters: CharactersService,
  ) {}

  /** Returns the user's role in the campaign, or throws. */
  async roleOf(campaignId: string, userId: string): Promise<CampaignRole> {
    const member = await this.prisma.campaignMember.findUnique({ where: { campaignId_userId: { campaignId, userId } } });
    if (!member) {
      const exists = await this.prisma.campaign.count({ where: { id: campaignId } });
      if (!exists) throw new NotFoundException("Campaign not found.");
      throw new ForbiddenException("You are not a member of this campaign.");
    }
    return member.role as CampaignRole;
  }

  async assertGm(campaignId: string, userId: string) {
    const role = await this.roleOf(campaignId, userId);
    if (role !== "gm") throw new ForbiddenException("Only the game master can do this.");
  }

  async list(userId: string): Promise<CampaignSummary[]> {
    const memberships = await this.prisma.campaignMember.findMany({
      where: { userId },
      include: {
        campaign: {
          include: {
            members: { where: { role: "gm" }, include: { user: { select: { displayName: true } } } },
            _count: { select: { characters: true } },
          },
        },
      },
      orderBy: { campaign: { updatedAt: "desc" } },
    });
    return memberships.map((m) => ({
      id: m.campaign.id,
      name: m.campaign.name,
      description: m.campaign.description,
      role: m.role as CampaignRole,
      gmName: m.campaign.members[0]?.user.displayName ?? "",
      characterCount: m.campaign._count.characters,
      updatedAt: m.campaign.updatedAt.toISOString(),
    }));
  }

  async create(userId: string, input: CampaignInput) {
    const campaign = await this.prisma.campaign.create({
      data: { name: input.name, description: input.description, inviteCode: newInviteCode(), members: { create: { userId, role: "gm" } } },
    });
    return this.detail(campaign.id, userId);
  }

  async detail(campaignId: string, userId: string): Promise<CampaignDetail> {
    const role = await this.roleOf(campaignId, userId);
    const campaign = await this.prisma.campaign.findUniqueOrThrow({
      where: { id: campaignId },
      include: { members: { include: { user: { select: { id: true, displayName: true } } }, orderBy: { joinedAt: "asc" } } },
    });
    const characters = await this.characters.summaries({ campaignId });
    return {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      role,
      inviteCode: role === "gm" ? campaign.inviteCode : null,
      members: campaign.members.map((m) => ({ userId: m.user.id, displayName: m.user.displayName, role: m.role as CampaignRole })),
      characters,
      activeMapId: campaign.activeMapId,
    };
  }

  async update(campaignId: string, userId: string, input: CampaignInput) {
    await this.assertGm(campaignId, userId);
    await this.prisma.campaign.update({ where: { id: campaignId }, data: { name: input.name, description: input.description } });
    return this.detail(campaignId, userId);
  }

  async remove(campaignId: string, userId: string) {
    await this.assertGm(campaignId, userId);
    await this.prisma.campaign.delete({ where: { id: campaignId } });
  }

  async regenerateCode(campaignId: string, userId: string) {
    await this.assertGm(campaignId, userId);
    await this.prisma.campaign.update({ where: { id: campaignId }, data: { inviteCode: newInviteCode() } });
    return this.detail(campaignId, userId);
  }

  /** Joins with the invite code (the same code is used in the invite link). */
  async join(userId: string, code: string, characterId?: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { inviteCode: code.trim().toUpperCase() } });
    if (!campaign) throw new NotFoundException("No campaign uses this code.");
    const existing = await this.prisma.campaignMember.findUnique({ where: { campaignId_userId: { campaignId: campaign.id, userId } } });
    if (!existing) await this.prisma.campaignMember.create({ data: { campaignId: campaign.id, userId, role: "player" } });
    if (characterId) await this.attachCharacter(campaign.id, userId, characterId);
    return this.detail(campaign.id, userId);
  }

  /** Puts a character in the campaign: its owner, or the GM, can do it. */
  async attachCharacter(campaignId: string, userId: string, characterId: string) {
    const role = await this.roleOf(campaignId, userId);
    const character = await this.prisma.character.findUnique({ where: { id: characterId } });
    if (!character) throw new NotFoundException("Character not found.");
    if (character.ownerId !== userId && role !== "gm") throw new ForbiddenException("You can only add your own characters.");
    if (character.ownerId !== userId) {
      // The GM adds a player's character: the owner must be a member.
      await this.roleOf(campaignId, character.ownerId);
    }
    if (character.campaignId && character.campaignId !== campaignId) throw new BadRequestException("This character already plays in another campaign.");
    await this.prisma.character.update({ where: { id: characterId }, data: { campaignId } });
    return this.detail(campaignId, userId);
  }

  async detachCharacter(campaignId: string, userId: string, characterId: string) {
    const role = await this.roleOf(campaignId, userId);
    const character = await this.prisma.character.findUnique({ where: { id: characterId } });
    if (!character || character.campaignId !== campaignId) throw new NotFoundException("Character not found in this campaign.");
    if (character.ownerId !== userId && role !== "gm") throw new ForbiddenException();
    await this.prisma.character.update({ where: { id: characterId }, data: { campaignId: null } });
    return this.detail(campaignId, userId);
  }

  async removeMember(campaignId: string, userId: string, memberId: string) {
    if (memberId !== userId) await this.assertGm(campaignId, userId);
    const member = await this.prisma.campaignMember.findUnique({ where: { campaignId_userId: { campaignId, userId: memberId } } });
    if (!member) throw new NotFoundException();
    if (member.role === "gm") throw new BadRequestException("The game master can't leave their own campaign; delete it instead.");
    await this.prisma.$transaction([
      this.prisma.character.updateMany({ where: { campaignId, ownerId: memberId }, data: { campaignId: null } }),
      this.prisma.campaignMember.delete({ where: { campaignId_userId: { campaignId, userId: memberId } } }),
    ]);
  }
}
