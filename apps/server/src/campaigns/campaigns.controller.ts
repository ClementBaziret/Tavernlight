import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { attachCharacterSchema, campaignSchema, joinCampaignSchema, type CampaignInput } from "@tavernlight/shared";
import { AuthUser, CurrentUser } from "../common/auth";
import { ZodPipe } from "../common/zod.pipe";
import { CampaignsService } from "./campaigns.service";

@Controller("campaigns")
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.campaigns.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(campaignSchema)) body: CampaignInput) {
    return this.campaigns.create(user.id, body);
  }

  @HttpCode(200)
  @Post("join")
  join(@CurrentUser() user: AuthUser, @Body(new ZodPipe(joinCampaignSchema)) body: { code: string; characterId?: string }) {
    return this.campaigns.join(user.id, body.code, body.characterId);
  }

  @Get(":id")
  detail(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.campaigns.detail(id, user.id);
  }

  @Put(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodPipe(campaignSchema)) body: CampaignInput) {
    return this.campaigns.update(id, user.id, body);
  }

  @HttpCode(204)
  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.campaigns.remove(id, user.id);
  }

  @Post(":id/invite-code")
  regenerate(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.campaigns.regenerateCode(id, user.id);
  }

  @Post(":id/characters")
  attach(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodPipe(attachCharacterSchema)) body: { characterId: string }) {
    return this.campaigns.attachCharacter(id, user.id, body.characterId);
  }

  @Delete(":id/characters/:characterId")
  detach(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("characterId") characterId: string) {
    return this.campaigns.detachCharacter(id, user.id, characterId);
  }

  @HttpCode(204)
  @Delete(":id/members/:userId")
  removeMember(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("userId") memberId: string) {
    return this.campaigns.removeMember(id, user.id, memberId);
  }
}
