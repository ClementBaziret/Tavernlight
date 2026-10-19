import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { probabilitySchema, rollSchema, type RollInput } from "@tavernlight/shared";
import { AuthUser, CurrentUser, Public } from "../common/auth";
import { ZodPipe } from "../common/zod.pipe";
import { DiceService } from "./dice.service";

@Controller("dice")
export class DiceController {
  constructor(private readonly dice: DiceService) {}

  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post("roll")
  roll(@CurrentUser() user: AuthUser, @Body(new ZodPipe(rollSchema)) body: RollInput) {
    return this.dice.roll(user.id, body);
  }

  @Public()
  @HttpCode(200)
  @Post("probabilities")
  probabilities(@Body(new ZodPipe(probabilitySchema)) body: { expression: string; advantage?: "advantage" | "disadvantage" | null }) {
    return this.dice.probabilities(body.expression, body.advantage);
  }

  @Get("history")
  history(@CurrentUser() user: AuthUser, @Query("campaignId") campaignId?: string) {
    return this.dice.history(user.id, campaignId);
  }
}
