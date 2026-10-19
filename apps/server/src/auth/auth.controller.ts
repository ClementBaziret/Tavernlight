import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from "@tavernlight/shared";
import { AuthedRequest, AuthUser, CurrentUser, Public, SESSION_COOKIE } from "../common/auth";
import { ZodPipe } from "../common/zod.pipe";
import { AuthService } from "./auth.service";

function setCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: 30 * 86400_000,
    path: "/",
  });
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("register")
  async register(@Body(new ZodPipe(registerSchema)) body: RegisterInput, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.register(body, req.headers["user-agent"]);
    setCookie(res, result.token);
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post("login")
  async login(@Body(new ZodPipe(loginSchema)) body: LoginInput, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(body, req.headers["user-agent"]);
    setCookie(res, result.token);
    return result;
  }

  @HttpCode(204)
  @Post("logout")
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    if (req.sessionToken) await this.auth.logout(req.sessionToken);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
