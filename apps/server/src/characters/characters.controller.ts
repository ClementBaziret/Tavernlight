import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import type { CharacterBuild, CharacterDetails } from "@tavernlight/engine";
import {
  characterActionSchema,
  createCharacterSchema,
  levelUpSchema,
  updateCharacterSchema,
  type CharacterAction,
  type CreateCharacterInput,
  type LevelUpRequest,
} from "@tavernlight/shared";
import { AuthUser, CurrentUser } from "../common/auth";
import { ZodPipe } from "../common/zod.pipe";
import { CharactersService } from "./characters.service";

@Controller("characters")
export class CharactersController {
  constructor(private readonly characters: CharactersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.characters.listForUser(user.id);
  }

  /** Rolls 4d6 (drop lowest) six times on the server; the token proves the result. */
  @Post("roll-abilities")
  rollAbilities(@CurrentUser() user: AuthUser) {
    return this.characters.rollAbilities(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createCharacterSchema)) body: CreateCharacterInput) {
    return this.characters.create(user.id, body);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.characters.get(id, user.id);
  }

  @Put(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodPipe(updateCharacterSchema)) body: { build?: CharacterBuild; details?: CharacterDetails }) {
    return this.characters.update(id, user.id, body);
  }

  @HttpCode(204)
  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.characters.remove(id, user.id);
  }

  /** Hit points, rests, slots, inventory, money, notes... */
  @HttpCode(200)
  @Post(":id/actions")
  act(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodPipe(characterActionSchema)) body: CharacterAction) {
    return this.characters.act(id, user.id, body);
  }

  @Get(":id/level-up")
  preview(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query("subclass") subclass?: string) {
    return this.characters.preview(id, user.id, subclass);
  }

  @Post(":id/level-up")
  levelUp(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodPipe(levelUpSchema)) body: LevelUpRequest) {
    return this.characters.levelUp(id, user.id, body);
  }
}
